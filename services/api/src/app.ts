import type { AccessTokenVerifier, Logger } from '@etare/adapters';
import {
  addDocumentVersion,
  addPlanRevision,
  confirmUpload,
  createBuilding,
  createDocument,
  createClassification,
  createContact,
  createExternalId,
  createLevel,
  createPlan,
  createSite,
  createSiteObject,
  getAssetDownload,
  getMe,
  getMapCatalog,
  getSite,
  inviteMember,
  listBuildings,
  reverseGeocode,
  searchAddresses,
  listClassifications,
  listContacts,
  listDocuments,
  listExternalIds,
  listMapFeatures,
  listMapSites,
  listMembers,
  listPlans,
  listObjectTypes,
  listSiteObjects,
  listSites,
  updateBuilding,
  updateClassification,
  updateContact,
  updateDocument,
  updateLevel,
  updateMember,
  updatePlan,
  updateSiteObject,
  updateSite,
  type CartographyCatalog,
  type Geocoder,
  type HealthProbe,
  type IdentityProvisioner,
  type ObjectStorage,
  type SessionFactory,
} from '@etare/application';
import { API_BASE_PATH, TENANT_HEADER, endpoints, type EndpointContract } from '@etare/contracts';
import {
  InvalidInput,
  PreconditionRequired,
  TenantRequired,
  Unauthenticated,
  type RequestContext,
  type RequestOrigin,
} from '@etare/domain';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { toApiError } from './errors';

export interface ApiDependencies {
  readonly sessions: SessionFactory;
  readonly tokens: AccessTokenVerifier;
  readonly health: HealthProbe;
  /** Null when file storage is not configured (document endpoints answer 503). */
  readonly storage: ObjectStorage | null;
  /** Null when identity administration is not configured (invitations of new addresses answer 503). */
  readonly identities: IdentityProvisioner | null;
  readonly cartography: CartographyCatalog;
  readonly geocoder: Geocoder;
  readonly logger: Logger;
  readonly version: string;
  readonly openApiDocument: () => unknown;
}

type Env = { Variables: { traceId: string } };

const CLIENT_HEADER = 'x-client-platform';
const tenantIdSchema = z.uuid();
const originSchema = z.enum(['web', 'mobile', 'integration']);
const MAX_JSON_BODY_BYTES = 64 * 1024;

/** Accepts "3", W/"3" or 3 (the ETag previously returned by the API). */
export function parseIfMatch(header: string | undefined): number {
  if (!header) throw new PreconditionRequired();
  const match = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!match?.[1])
    throw new InvalidInput('En-tête If-Match invalide.', [{ path: 'if-match', message: 'Version attendue, ex. "3".' }]);
  return Number(match[1]);
}

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

  // JSON bodies are small: bigger payloads (files) go to object storage through signed URLs.
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_JSON_BODY_BYTES,
      onError: (c) =>
        c.json(
          { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.', trace_id: c.get('traceId') } },
          413,
        ),
    }),
  );

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
    const parsed: unknown = endpoint.response.parse(body);
    if (endpoint.concurrency && typeof parsed === 'object' && parsed !== null && 'row_version' in parsed) {
      c.header('etag', `"${String(parsed.row_version)}"`);
    }
    return c.json(parsed as object, endpoint.successStatus);
  }

  async function readBody<S extends z.ZodType>(c: Context<Env>, schema: S): Promise<z.infer<S>> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new InvalidInput('Corps de requête JSON invalide.');
    }
    return schema.parse(raw);
  }

  const idOf = (c: Context<Env>) => endpoints.getSite.params.parse(c.req.param()).id;
  const expectedVersion = (c: Context<Env>) => parseIfMatch(c.req.header('if-match'));

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

  app.get(routerPath(endpoints.getMapCatalog.path), async (c) => {
    await requestContext(c, endpoints.getMapCatalog);
    return respond(c, endpoints.getMapCatalog, getMapCatalog(deps.cartography));
  });

  app.get(routerPath(endpoints.listMapSites.path), async (c) => {
    const context = await requestContext(c, endpoints.listMapSites);
    const query = endpoints.listMapSites.query.parse(c.req.query());
    return respond(c, endpoints.listMapSites, await listMapSites(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.listMapFeatures.path), async (c) => {
    const context = await requestContext(c, endpoints.listMapFeatures);
    const query = endpoints.listMapFeatures.query.parse(c.req.query());
    return respond(c, endpoints.listMapFeatures, await listMapFeatures(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.searchAddresses.path), async (c) => {
    const context = await requestContext(c, endpoints.searchAddresses);
    const query = endpoints.searchAddresses.query.parse(c.req.query());
    const geocoding = { sessions: deps.sessions, geocoder: deps.geocoder };
    return respond(c, endpoints.searchAddresses, await searchAddresses(geocoding, context, query));
  });

  app.get(routerPath(endpoints.reverseGeocode.path), async (c) => {
    const context = await requestContext(c, endpoints.reverseGeocode);
    const query = endpoints.reverseGeocode.query.parse(c.req.query());
    const geocoding = { sessions: deps.sessions, geocoder: deps.geocoder };
    return respond(c, endpoints.reverseGeocode, await reverseGeocode(geocoding, context, query));
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

  // ---------------------------------------------------------------- sites (write)
  app.post(routerPath(endpoints.createSite.path), async (c) => {
    const context = await requestContext(c, endpoints.createSite);
    const input = await readBody(c, endpoints.createSite.body);
    const site = await createSite(deps.sessions, context, input);
    c.header('location', `${API_BASE_PATH}/sites/${site.id}`);
    return respond(c, endpoints.createSite, site);
  });

  app.patch(routerPath(endpoints.updateSite.path), async (c) => {
    const context = await requestContext(c, endpoints.updateSite);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateSite.body);
    return respond(c, endpoints.updateSite, await updateSite(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- buildings and levels
  app.get(routerPath(endpoints.listBuildings.path), async (c) => {
    const context = await requestContext(c, endpoints.listBuildings);
    const items = await listBuildings(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listBuildings, { items });
  });

  app.post(routerPath(endpoints.createBuilding.path), async (c) => {
    const context = await requestContext(c, endpoints.createBuilding);
    const input = await readBody(c, endpoints.createBuilding.body);
    return respond(c, endpoints.createBuilding, await createBuilding(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateBuilding.path), async (c) => {
    const context = await requestContext(c, endpoints.updateBuilding);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateBuilding.body);
    return respond(c, endpoints.updateBuilding, await updateBuilding(deps.sessions, context, idOf(c), version, patch));
  });

  app.post(routerPath(endpoints.createLevel.path), async (c) => {
    const context = await requestContext(c, endpoints.createLevel);
    const input = await readBody(c, endpoints.createLevel.body);
    return respond(c, endpoints.createLevel, await createLevel(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateLevel.path), async (c) => {
    const context = await requestContext(c, endpoints.updateLevel);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateLevel.body);
    return respond(c, endpoints.updateLevel, await updateLevel(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- classifications
  app.get(routerPath(endpoints.listClassifications.path), async (c) => {
    const context = await requestContext(c, endpoints.listClassifications);
    const items = await listClassifications(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listClassifications, { items });
  });

  app.post(routerPath(endpoints.createClassification.path), async (c) => {
    const context = await requestContext(c, endpoints.createClassification);
    const input = await readBody(c, endpoints.createClassification.body);
    return respond(
      c,
      endpoints.createClassification,
      await createClassification(deps.sessions, context, idOf(c), input),
    );
  });

  app.patch(routerPath(endpoints.updateClassification.path), async (c) => {
    const context = await requestContext(c, endpoints.updateClassification);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateClassification.body);
    return respond(
      c,
      endpoints.updateClassification,
      await updateClassification(deps.sessions, context, idOf(c), version, patch),
    );
  });

  // ---------------------------------------------------------------- contacts
  app.get(routerPath(endpoints.listContacts.path), async (c) => {
    const context = await requestContext(c, endpoints.listContacts);
    const items = await listContacts(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listContacts, { items });
  });

  app.post(routerPath(endpoints.createContact.path), async (c) => {
    const context = await requestContext(c, endpoints.createContact);
    const input = await readBody(c, endpoints.createContact.body);
    return respond(c, endpoints.createContact, await createContact(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateContact.path), async (c) => {
    const context = await requestContext(c, endpoints.updateContact);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateContact.body);
    return respond(c, endpoints.updateContact, await updateContact(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- external identifiers
  app.get(routerPath(endpoints.listExternalIds.path), async (c) => {
    const context = await requestContext(c, endpoints.listExternalIds);
    const items = await listExternalIds(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listExternalIds, { items });
  });

  app.post(routerPath(endpoints.createExternalId.path), async (c) => {
    const context = await requestContext(c, endpoints.createExternalId);
    const input = await readBody(c, endpoints.createExternalId.body);
    return respond(c, endpoints.createExternalId, await createExternalId(deps.sessions, context, idOf(c), input));
  });

  // ---------------------------------------------------------------- operational objects
  app.get(routerPath(endpoints.listObjectTypes.path), async (c) => {
    const context = await requestContext(c, endpoints.listObjectTypes);
    return respond(c, endpoints.listObjectTypes, { items: await listObjectTypes(deps.sessions, context) });
  });

  app.get(routerPath(endpoints.listSiteObjects.path), async (c) => {
    const context = await requestContext(c, endpoints.listSiteObjects);
    const items = await listSiteObjects(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listSiteObjects, { items });
  });

  app.post(routerPath(endpoints.createSiteObject.path), async (c) => {
    const context = await requestContext(c, endpoints.createSiteObject);
    const input = await readBody(c, endpoints.createSiteObject.body);
    return respond(c, endpoints.createSiteObject, await createSiteObject(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateObject.path), async (c) => {
    const context = await requestContext(c, endpoints.updateObject);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateObject.body);
    return respond(c, endpoints.updateObject, await updateSiteObject(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- plans
  const plans = { sessions: deps.sessions, storage: deps.storage };

  app.get(routerPath(endpoints.listSitePlans.path), async (c) => {
    const context = await requestContext(c, endpoints.listSitePlans);
    return respond(c, endpoints.listSitePlans, { items: await listPlans(plans, context, idOf(c)) });
  });

  app.post(routerPath(endpoints.createPlan.path), async (c) => {
    const context = await requestContext(c, endpoints.createPlan);
    const input = await readBody(c, endpoints.createPlan.body);
    return respond(c, endpoints.createPlan, await createPlan(plans, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updatePlan.path), async (c) => {
    const context = await requestContext(c, endpoints.updatePlan);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updatePlan.body);
    return respond(c, endpoints.updatePlan, await updatePlan(plans, context, idOf(c), version, patch));
  });

  app.post(routerPath(endpoints.createPlanRevision.path), async (c) => {
    const context = await requestContext(c, endpoints.createPlanRevision);
    const input = await readBody(c, endpoints.createPlanRevision.body);
    return respond(c, endpoints.createPlanRevision, await addPlanRevision(plans, context, idOf(c), input));
  });

  // ---------------------------------------------------------------- documents and files
  const documents = { sessions: deps.sessions, storage: deps.storage };

  app.get(routerPath(endpoints.listDocuments.path), async (c) => {
    const context = await requestContext(c, endpoints.listDocuments);
    const items = await listDocuments(documents, context, idOf(c));
    return respond(c, endpoints.listDocuments, { items });
  });

  app.post(routerPath(endpoints.createDocument.path), async (c) => {
    const context = await requestContext(c, endpoints.createDocument);
    const input = await readBody(c, endpoints.createDocument.body);
    return respond(c, endpoints.createDocument, await createDocument(documents, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateDocument.path), async (c) => {
    const context = await requestContext(c, endpoints.updateDocument);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateDocument.body);
    return respond(c, endpoints.updateDocument, await updateDocument(documents, context, idOf(c), version, patch));
  });

  app.post(routerPath(endpoints.createDocumentVersion.path), async (c) => {
    const context = await requestContext(c, endpoints.createDocumentVersion);
    const input = await readBody(c, endpoints.createDocumentVersion.body);
    return respond(c, endpoints.createDocumentVersion, await addDocumentVersion(documents, context, idOf(c), input));
  });

  app.post(routerPath(endpoints.confirmUpload.path), async (c) => {
    const context = await requestContext(c, endpoints.confirmUpload);
    return respond(c, endpoints.confirmUpload, await confirmUpload(documents, context, idOf(c)));
  });

  app.get(routerPath(endpoints.getAssetDownload.path), async (c) => {
    const context = await requestContext(c, endpoints.getAssetDownload);
    return respond(c, endpoints.getAssetDownload, await getAssetDownload(documents, context, idOf(c)));
  });

  // ---------------------------------------------------------------- members of the SIS
  app.get(routerPath(endpoints.listMembers.path), async (c) => {
    const context = await requestContext(c, endpoints.listMembers);
    return respond(c, endpoints.listMembers, { items: await listMembers(deps.sessions, context) });
  });

  app.post(routerPath(endpoints.inviteMember.path), async (c) => {
    const context = await requestContext(c, endpoints.inviteMember);
    const input = await readBody(c, endpoints.inviteMember.body);
    const members = { sessions: deps.sessions, identities: deps.identities };
    return respond(c, endpoints.inviteMember, await inviteMember(members, context, input));
  });

  app.patch(routerPath(endpoints.updateMember.path), async (c) => {
    const context = await requestContext(c, endpoints.updateMember);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateMember.body);
    return respond(c, endpoints.updateMember, await updateMember(deps.sessions, context, idOf(c), version, patch));
  });

  return app;
}
