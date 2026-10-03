import { IgnCartographyCatalog, IgnGeocoder, createLogger, type AccessTokenVerifier } from '@etare/adapters';
import type { RequestSession, SessionFactory } from '@etare/application';
import { stubSession } from '@etare/application/testing';
import { API_BASE_PATH, apiErrorSchema, endpoints, type SiteDetail } from '@etare/contracts';
import { AccessDenied, Unauthenticated, permissionsForRoles, type RequestContext, type Role } from '@etare/domain';
import { describe, expect, it } from 'vitest';
import { createApiApp, routerPath } from './app';

const tenant06 = '06000000-0000-4000-8000-000000000000';
const tenant83 = '83000000-0000-4000-8000-000000000000';
const siteId = '06000002-0000-4000-8000-000000000001';

const site: SiteDetail = {
  id: siteId,
  tenant_id: tenant06,
  name: 'EHPAD Les Oliviers',
  short_name: null,
  status: 'active',
  site_type: 'health',
  sensitivity: 'normal',
  etare_number: '06-0428',
  address: {
    label: '12 avenue des Mimosas, 06000 Nice',
    street: '12 avenue des Mimosas',
    city: 'Nice',
    postal_code: '06000',
    insee_code: '06088',
  },
  location: { type: 'Point', coordinates: [7.2518, 43.7079] },
  updated_at: '2026-09-27T10:00:00.000Z',
  footprint: null,
  last_verified_at: null,
  building_count: 2,
  active_publication: null,
  archive: null,
  row_version: 1,
};

/** Fake session factory mimicking the database: membership of 06 only, roles given per test. */
function sessions(roles: Role[]): SessionFactory & { contexts: RequestContext[] } {
  const contexts: RequestContext[] = [];
  return {
    contexts,
    async run<T>(context: RequestContext, work: (session: RequestSession) => Promise<T>): Promise<T> {
      contexts.push(context);
      if (context.tenantId && context.tenantId !== tenant06)
        throw new AccessDenied('Vous n’êtes pas membre de ce SIS.');
      return work(
        stubSession(
          { userId: 'u', tenantId: context.tenantId, permissions: permissionsForRoles(roles) },
          {
            identity: {
              me: async () => ({
                user: {
                  id: '00000000-0000-4000-b000-000000000002',
                  email: 'redacteur06@demo.etare.test',
                  display_name: null,
                  second_factor: false,
                  second_factor_reenrollment: false,
                },
                memberships: [
                  {
                    tenant_id: tenant06,
                    tenant_slug: 'sdis-demo-06',
                    tenant_name: 'SDIS DEMO 06',
                    roles,
                    second_factor_required: false,
                  },
                ],
              }),
            },
            sites: {
              list: async () => ({ items: [site], next_cursor: null }),
              get: async (id: string) => (id === siteId ? site : null),
            },
          },
        ),
      );
    },
  };
}

const tokens: AccessTokenVerifier = {
  async verify(token) {
    if (token !== 'valid-token') throw new Unauthenticated('Jeton d’accès invalide ou expiré.');
    return { provider: 'supabase', subject: 'sub-2', email: null, assurance: 'aal1' };
  },
};

function makeApp(roles: Role[] = ['PREVISION_EDITOR']) {
  const fake = sessions(roles);
  const app = createApiApp({
    sessions: fake,
    tokens,
    health: { database: async () => 'ok' },
    storage: null,
    identities: null,
    cartography: new IgnCartographyCatalog(),
    geocoder: new IgnGeocoder(async () => new Response('{"features":[]}')),
    sha256: async () => '0'.repeat(64),
    catalogSigner: null,
    verifier: { verify: () => false },
    randomBytes: (length) => new Uint8Array(length),
    now: () => new Date(),
    logger: createLogger({}, { write: () => undefined }),
    version: 'test',
    openApiDocument: () => ({ openapi: '3.1.0' }),
  });
  const call = (path: string, headers: Record<string, string> = {}) =>
    app.request(`${API_BASE_PATH}${path}`, { headers });
  return { app, call, fake };
}

const auth = { authorization: 'Bearer valid-token' };

describe('API routing', () => {
  it('implements every endpoint of the contract', async () => {
    const { app } = makeApp();
    for (const endpoint of Object.values(endpoints)) {
      const path = routerPath(endpoint.path).replace(/:([A-Za-z0-9_]+)/g, siteId);
      const response = await app.request(`${API_BASE_PATH}${path}`, { method: endpoint.method.toUpperCase() });
      const body: unknown = await response.json();
      expect(apiErrorSchema.safeParse(body).success && response.status === 404, endpoint.operationId).toBe(false);
    }
  });

  it('returns structured errors with a trace id and never caches answers', async () => {
    const { call } = makeApp();
    const response = await call('/unknown');
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.trace_id).toBe(response.headers.get('x-trace-id'));
  });
});

describe('authentication and tenant context', () => {
  it('serves the health check without authentication', async () => {
    const response = await makeApp().call('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', version: 'test', checks: { database: 'ok' } });
  });

  it('rejects requests without a valid bearer token', async () => {
    const { call } = makeApp();
    expect((await call('/me')).status).toBe(401);
    expect((await call('/me', { authorization: 'Bearer forged' })).status).toBe(401);
    expect((await call('/me', { authorization: 'Basic abc' })).status).toBe(401);
  });

  it('requires the active SIS on tenant-scoped routes', async () => {
    const response = await makeApp().call('/sites', auth);
    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('TENANT_REQUIRED');
  });

  it('rejects a malformed tenant id', async () => {
    const response = await makeApp().call('/sites', { ...auth, 'x-tenant-id': 'not-a-uuid' });
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a tenant the user does not belong to', async () => {
    const response = await makeApp().call('/sites', { ...auth, 'x-tenant-id': tenant83 });
    expect(response.status).toBe(403);
  });
});

describe('sites', () => {
  it('lists the sites of the active SIS', async () => {
    const { call, fake } = makeApp();
    const response = await call('/sites?limit=10', { ...auth, 'x-tenant-id': tenant06, 'x-client-platform': 'web' });
    expect(response.status).toBe(200);
    const body = endpoints.listSites.response.parse(await response.json());
    expect(body.items.map((s) => s.name)).toEqual(['EHPAD Les Oliviers']);
    expect(fake.contexts[0]).toMatchObject({ tenantId: tenant06, origin: 'web' });
  });

  it('validates query parameters', async () => {
    const response = await makeApp().call('/sites?limit=1000', { ...auth, 'x-tenant-id': tenant06 });
    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.fields?.[0]?.path).toBe('limit');
  });

  it('forbids roles without site:read', async () => {
    const response = await makeApp(['OPS_USER']).call('/sites', { ...auth, 'x-tenant-id': tenant06 });
    expect(response.status).toBe(403);
  });

  it('answers 404 for a site outside the tenant', async () => {
    const response = await makeApp().call('/sites/83000002-0000-4000-8000-000000000001', {
      ...auth,
      'x-tenant-id': tenant06,
    });
    expect(response.status).toBe(404);
  });

  it('returns the detail of a visible site', async () => {
    const response = await makeApp().call(`/sites/${siteId}`, { ...auth, 'x-tenant-id': tenant06 });
    expect(endpoints.getSite.response.parse(await response.json()).building_count).toBe(2);
  });
});

describe('me', () => {
  it('lists the memberships of the user', async () => {
    const response = await makeApp().call('/me', auth);
    const body = endpoints.getMe.response.parse(await response.json());
    expect(body.memberships[0]?.tenant_name).toBe('SDIS DEMO 06');
  });
});
