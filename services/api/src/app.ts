import type { AccessTokenVerifier, Logger } from '@etare/adapters';
import { getMe, getSite, listSites, type HealthProbe, type SessionFactory } from '@etare/application';
import { API_BASE_PATH, TENANT_HEADER, endpoints, type EndpointContract } from '@etare/contracts';
import { InvalidInput, TenantRequired, Unauthenticated, type RequestContext, type RequestOrigin } from '@etare/domain';
import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { toApiError } from './errors';

export interface ApiDependencies {
  readonly sessions: SessionFactory;
  readonly tokens: AccessTokenVerifier;
  readonly health: HealthProbe;
  readonly logger: Logger;
  readonly version: string;
  readonly openApiDocument: () => unknown;
}

type Env = { Variables: { traceId: string } };

const CLIENT_HEADER = 'x-client-platform';
const tenantIdSchema = z.uuid();
const originSchema = z.enum(['web', 'mobile', 'integration']);

/** Converts an OpenAPI path template (/sites/{id}) into a router path (/sites/:id). */
export function routerPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1');
}

/**
 * The product HTTP API. Framework-neutral (Fetch API Request/Response): served
 * by thin Next.js route handlers at MVP, and by src/server.ts if the API is
 * ever extracted — without duplicating any rule.
 */
export function createApiApp(deps: ApiDependencies): Hono<Env> {
  const app = new Hono<Env>().basePath(API_BASE_PATH);

  app.use('*', async (c, next) => {
    const traceId = crypto.randomUUID();
    c.set('traceId', traceId);
    await next();
    c.header('x-trace-id', traceId);
    // Business answers are never cached by browsers or shared caches.
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
  });

  app.onError((error, c) => {
    const traceId = c.get('traceId');
    const { status, body, expected } = toApiError(error, traceId);
    const log = expected ? deps.logger.warn : deps.logger.error;
    log('request failed', {
      trace_id: traceId,
      method: c.req.method,
      route: c.req.routePath,
      status,
      code: body.error.code,
      ...(expected ? {} : { error }),
    });
    return c.json(body, status as ContentfulStatusCode);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue.', trace_id: c.get('traceId') } }, 404),
  );

  async function requestContext(c: Context<Env>, endpoint: EndpointContract): Promise<RequestContext> {
    const authorization = c.req.header('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(authorization);
    if (!match?.[1]) throw new Unauthenticated();
    const principal = await deps.tokens.verify(match[1]);

    let tenantId: string | null = null;
    if (endpoint.tenantScoped) {
      const header = c.req.header(TENANT_HEADER);
      if (!header) throw new TenantRequired();
      const parsed = tenantIdSchema.safeParse(header);
      if (!parsed.success) {
        throw new InvalidInput('SIS actif invalide.', [{ path: TENANT_HEADER, message: 'UUID attendu.' }]);
      }
      tenantId = parsed.data;
    }

    const client = originSchema.safeParse(c.req.header(CLIENT_HEADER));
    const origin: RequestOrigin = client.success ? client.data : 'api';
    return { principal, tenantId, traceId: c.get('traceId'), origin };
  }

  function respond(c: Context<Env>, endpoint: EndpointContract, body: unknown) {
    // Output validation: an answer that breaks its contract is a server bug, never sent as is.
    return c.json(endpoint.response.parse(body) as object, endpoint.successStatus);
  }

  app.get(routerPath(endpoints.getHealth.path), async (c) => {
    const database = await deps.health.database();
    return respond(c, endpoints.getHealth, {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: deps.version,
      checks: { database },
    });
  });

  app.get('/openapi.json', (c) => c.json(deps.openApiDocument() as object));

  app.get(routerPath(endpoints.getMe.path), async (c) => {
    const context = await requestContext(c, endpoints.getMe);
    return respond(c, endpoints.getMe, await getMe(deps.sessions, context));
  });

  app.get(routerPath(endpoints.listSites.path), async (c) => {
    const context = await requestContext(c, endpoints.listSites);
    const query = endpoints.listSites.query.parse(c.req.query());
    return respond(c, endpoints.listSites, await listSites(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.getSite.path), async (c) => {
    const context = await requestContext(c, endpoints.getSite);
    const { id } = endpoints.getSite.params.parse(c.req.param());
    return respond(c, endpoints.getSite, await getSite(deps.sessions, context, id));
  });

  return app;
}
