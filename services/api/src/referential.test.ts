import { createLogger, type AccessTokenVerifier } from '@etare/adapters';
import type { RequestSession, SessionFactory } from '@etare/application';
import { stubSession, type SessionOverrides } from '@etare/application/testing';
import { API_BASE_PATH, apiErrorSchema, endpoints, type Contact, type SiteDetail } from '@etare/contracts';
import { Conflict, PreconditionFailed, permissionsForRoles, type RequestContext, type Role } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { createApiApp, parseIfMatch } from './app';

const tenant = '06000000-0000-4000-8000-000000000000';
const siteId = '06000002-0000-4000-8000-000000000001';

const site: SiteDetail = {
  id: siteId,
  tenant_id: tenant,
  name: 'EHPAD Les Oliviers',
  short_name: null,
  status: 'active',
  site_type: 'health',
  sensitivity: 'normal',
  etare_number: '06-0428',
  address: null,
  location: null,
  updated_at: '2026-10-01T08:00:00.000Z',
  footprint: null,
  last_verified_at: null,
  building_count: 0,
  active_publication: null,
  row_version: 4,
};

const contact: Contact = {
  id: '06000010-0000-4000-8000-000000000001',
  site_id: siteId,
  name: 'PC sécurité',
  role: null,
  phone: '04 00 00 00 00',
  phone_alt: null,
  email: null,
  availability: '24/7',
  visibility: 'prevision',
  sort_order: 0,
  status: 'active',
  verified_at: null,
  row_version: 1,
};

function makeApp(overrides: SessionOverrides, roles: Role[] = ['PREVISION_EDITOR']) {
  const sessions: SessionFactory = {
    run: async <T>(context: RequestContext, work: (session: RequestSession) => Promise<T>) =>
      work(
        stubSession({ userId: 'u', tenantId: context.tenantId, permissions: permissionsForRoles(roles) }, overrides),
      ),
  };
  const tokens: AccessTokenVerifier = {
    verify: async () => ({ provider: 'supabase', subject: 'sub', email: null, assurance: 'aal1' }),
  };
  const app = createApiApp({
    sessions,
    tokens,
    health: { database: async () => 'ok' },
    storage: null,
    identities: null,
    logger: createLogger({}, { write: () => undefined }),
    version: 'test',
    openApiDocument: () => ({}),
  });
  return (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: { authorization: 'Bearer t', 'x-tenant-id': tenant, 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
}

const errorCode = async (response: Response) => apiErrorSchema.parse(await response.json()).error.code;

describe('If-Match parsing', () => {
  it('accepts the ETag forms', () => {
    expect(parseIfMatch('"4"')).toBe(4);
    expect(parseIfMatch('W/"4"')).toBe(4);
    expect(parseIfMatch('4')).toBe(4);
  });

  it('requires and validates the header', () => {
    expect(() => parseIfMatch(undefined)).toThrow('If-Match');
    expect(() => parseIfMatch('"*"')).toThrow('invalide');
  });
});

describe('site creation', () => {
  it('creates a site, applies defaults and returns Location and ETag', async () => {
    const create = vi.fn(async () => site);
    const call = makeApp({ sites: { create } });
    const response = await call('POST', '/sites', { name: 'EHPAD Les Oliviers', site_type: 'health' });
    expect(response.status).toBe(201);
    expect(response.headers.get('location')).toBe(`${API_BASE_PATH}/sites/${siteId}`);
    expect(response.headers.get('etag')).toBe('"4"');
    expect(create).toHaveBeenCalledWith({
      name: 'EHPAD Les Oliviers',
      site_type: 'health',
      status: 'draft',
      sensitivity: 'normal',
    });
  });

  it('reports every invalid field', async () => {
    const call = makeApp({});
    const response = await call('POST', '/sites', {
      name: '',
      site_type: 'castle',
      address: { city: 'Nice', postal_code: '6000' },
      location: { type: 'Point', coordinates: [43.7, 190] },
    });
    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.fields?.map((field) => field.path).sort()).toEqual(
      ['address.postal_code', 'location.coordinates.1', 'name', 'site_type'].sort(),
    );
  });

  it('rejects malformed JSON and oversized bodies', async () => {
    const call = makeApp({});
    expect(await errorCode(await call('POST', '/sites', '{not json'))).toBe('VALIDATION_FAILED');
    const huge = await call('POST', '/sites', { name: 'x'.repeat(70_000), site_type: 'other' });
    expect(huge.status).toBe(413);
  });

  it('refuses writers without site:write', async () => {
    const call = makeApp({}, ['READER']);
    const response = await call('POST', '/sites', { name: 'Nouveau', site_type: 'other' });
    expect(response.status).toBe(403);
  });

  it('maps database conflicts to 409', async () => {
    const call = makeApp({
      sites: {
        create: async () => {
          throw new Conflict('Ce numéro ETARE est déjà utilisé dans votre SIS.');
        },
      },
    });
    const response = await call('POST', '/sites', { name: 'Doublon', site_type: 'other', etare_number: '06-0428' });
    expect(response.status).toBe(409);
  });
});

describe('optimistic concurrency', () => {
  it('requires If-Match on updates (428)', async () => {
    const call = makeApp({});
    const response = await call('PATCH', `/sites/${siteId}`, { name: 'Autre nom' });
    expect(response.status).toBe(428);
    expect(await errorCode(response)).toBe('PRECONDITION_REQUIRED');
  });

  it('passes the expected version and answers 412 when it is stale', async () => {
    const update = vi.fn(async () => {
      throw new PreconditionFailed();
    });
    const call = makeApp({ sites: { update } });
    const response = await call('PATCH', `/sites/${siteId}`, { name: 'Autre nom' }, { 'if-match': '"3"' });
    expect(response.status).toBe(412);
    expect(update).toHaveBeenCalledWith(siteId, 3, { name: 'Autre nom' });
  });

  it('refuses empty patches', async () => {
    const call = makeApp({});
    const response = await call('PATCH', `/sites/${siteId}`, {}, { 'if-match': '"4"' });
    expect(response.status).toBe(400);
  });

  it('answers 404 for records outside the SIS', async () => {
    const call = makeApp({ contacts: { update: async () => null } });
    const response = await call('PATCH', `/contacts/${contact.id}`, { verified: true }, { 'if-match': '"1"' });
    expect(response.status).toBe(404);
  });
});

describe('site records', () => {
  it('lists contacts only for a visible site', async () => {
    const listBySite = vi.fn(async () => [contact]);
    const hidden = makeApp({ sites: { get: async () => null }, contacts: { listBySite } });
    expect((await hidden('GET', `/sites/${siteId}/contacts`)).status).toBe(404);
    expect(listBySite).not.toHaveBeenCalled();

    const visible = makeApp({ sites: { get: async () => site }, contacts: { listBySite } });
    const response = await visible('GET', `/sites/${siteId}/contacts`);
    expect(endpoints.listContacts.response.parse(await response.json()).items).toHaveLength(1);
  });

  it('defaults a new contact to internal visibility', async () => {
    const create = vi.fn(async () => contact);
    const call = makeApp({ contacts: { create } });
    const response = await call('POST', `/sites/${siteId}/contacts`, { name: 'PC sécurité', phone: '04 00 00 00 00' });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(siteId, {
      name: 'PC sécurité',
      phone: '04 00 00 00 00',
      visibility: 'prevision',
    });
  });

  it('rejects a classification ending before it starts', async () => {
    const call = makeApp({});
    const response = await call('POST', `/sites/${siteId}/classifications`, {
      classification_type: 'ERP',
      valid_from: '2025-01-01',
      valid_to: '2024-01-01',
    });
    expect(response.status).toBe(400);
  });
});
