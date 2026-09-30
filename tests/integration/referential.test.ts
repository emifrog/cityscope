/**
 * Sprint 1 — editable referential through the real stack (Auth -> API -> RLS):
 * creation, optimistic concurrency, nested records, conflicts, isolation and audit.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, apiErrorSchema, endpoints } from '@etare/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, TENANT_83, requireEnv, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const admin = new pg.Pool({ connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL'), max: 1 });
afterAll(() => admin.end());

type Call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
function as(token: string, tenant: string): Call {
  return async (method, path, body, headers = {}) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': tenant,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

const run = Date.now().toString(36);
let editor06: Call;
let reader06: Call;
let editor83: Call;

beforeAll(async () => {
  const [editor, reader, other] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('lecteur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  reader06 = as(reader, TENANT_06);
  editor83 = as(other, TENANT_83);
});

describe('site lifecycle', () => {
  let siteId: string;

  it('creates a site with its address and location', async () => {
    const response = await editor06('POST', '/sites', {
      name: `Collège des Pins ${run} (démo)`,
      site_type: 'education',
      etare_number: `06-T${run}`,
      address: { street: '3 rue des Écoles', postal_code: '06100', city: 'Nice' },
      location: { type: 'Point', coordinates: [7.26, 43.72] },
    });
    expect(response.status).toBe(201);
    const site = endpoints.createSite.response.parse(await response.json());
    siteId = site.id;
    expect(site).toMatchObject({ tenant_id: TENANT_06, status: 'draft', row_version: 1 });
    expect(site.address?.label).toBe('3 rue des Écoles, 06100 Nice');
    expect(response.headers.get('etag')).toBe('"1"');
  });

  it('records the creation in the audit journal with its author', async () => {
    const { rows } = await admin.query<{ actor: string; origin: string }>(
      `select u.email::text as actor, e.origin from app.audit_event e join app.user_account u on u.id = e.actor_user_id
       where e.action = 'site.insert' and e.entity_id = $1`,
      [siteId],
    );
    expect(rows).toEqual([{ actor: 'redacteur06@demo.etare.test', origin: 'web' }]);
  });

  it('refuses a stale version and applies the current one', async () => {
    const stale = await editor06('PATCH', `/sites/${siteId}`, { status: 'active' }, { 'if-match': '"0"' });
    expect(stale.status).toBe(412);
    const ok = await editor06('PATCH', `/sites/${siteId}`, { status: 'active' }, { 'if-match': '"1"' });
    expect(ok.status).toBe(200);
    expect(endpoints.updateSite.response.parse(await ok.json()).row_version).toBe(2);
    expect(ok.headers.get('etag')).toBe('"2"');
  });

  it('refuses a duplicate ETARE number in the same SIS', async () => {
    const response = await editor06('POST', '/sites', {
      name: 'Doublon',
      site_type: 'other',
      etare_number: `06-T${run}`,
    });
    expect(response.status).toBe(409);
  });

  it('manages buildings and levels', async () => {
    const created = await editor06('POST', `/sites/${siteId}/buildings`, {
      name: 'Bâtiment principal',
      floors_above: 2,
    });
    expect(created.status).toBe(201);
    const building = endpoints.createBuilding.response.parse(await created.json());

    const rdc = await editor06('POST', `/buildings/${building.id}/levels`, { label: 'RDC', sort_order: 0 });
    expect(rdc.status).toBe(201);
    const duplicate = await editor06('POST', `/buildings/${building.id}/levels`, { label: 'RDC', sort_order: 1 });
    expect(duplicate.status).toBe(409);

    const list = endpoints.listBuildings.response.parse(
      await (await editor06('GET', `/sites/${siteId}/buildings`)).json(),
    );
    expect(list.items[0]?.levels.map((level) => level.label)).toEqual(['RDC']);
  });

  it('records classifications, contacts and external identifiers', async () => {
    expect(
      (
        await editor06('POST', `/sites/${siteId}/classifications`, {
          classification_type: 'ERP',
          code: 'R',
          category: '2',
        })
      ).status,
    ).toBe(201);
    const contact = await editor06('POST', `/sites/${siteId}/contacts`, {
      name: 'Loge (démo)',
      phone: '04 00 00 00 01',
    });
    expect(endpoints.createContact.response.parse(await contact.json()).visibility).toBe('prevision');
    expect(
      (
        await editor06('POST', `/sites/${siteId}/external-ids`, {
          entity_type: 'site',
          entity_id: siteId,
          system_code: 'SIG',
          external_id: `SIG-${run}`,
        })
      ).status,
    ).toBe(201);
  });

  it('finds the site by name, ETARE number and city', async () => {
    for (const query of [`q=Pins ${run}`, `q=06-T${run}`, 'city=nice&site_type=education']) {
      const page = endpoints.listSites.response.parse(
        await (await editor06('GET', `/sites?${encodeURI(query)}`)).json(),
      );
      expect(
        page.items.some((site) => site.id === siteId),
        query,
      ).toBe(true);
    }
  });

  it('keeps readers read-only', async () => {
    expect((await reader06('GET', `/sites/${siteId}/contacts`)).status).toBe(200);
    expect(
      (await reader06('POST', `/sites/${siteId}/contacts`, { name: 'Intrus', phone: '04 00 00 00 02' })).status,
    ).toBe(403);
  });

  it('never lets another SIS read or write the site', async () => {
    expect((await editor83('GET', `/sites/${siteId}/buildings`)).status).toBe(404);
    const patch = await editor83('PATCH', `/sites/${siteId}`, { name: 'Pris' }, { 'if-match': '"2"' });
    expect(patch.status).toBe(404);
    const contact = await editor83('POST', `/sites/${siteId}/contacts`, { name: 'Intrus', phone: '04 00 00 00 03' });
    expect(apiErrorSchema.parse(await contact.json()).error.code).toBe('NOT_FOUND');
    expect((await editor83('POST', `/sites/${EHPAD_ID}/buildings`, { name: 'Intrus' })).status).toBe(404);
  });
});
