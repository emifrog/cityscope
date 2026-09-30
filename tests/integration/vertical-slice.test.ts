/**
 * Sprint 0 acceptance scenario, end to end through the real stack
 * (Supabase Auth -> API -> PostgreSQL RLS):
 *   a user of SDIS DEMO 06 signs in, lists the sites of their SIS, sees
 *   "EHPAD Les Oliviers", and cannot reach any SDIS DEMO 83 data.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, apiErrorSchema, endpoints } from '@etare/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, SITE_83_ID, TENANT_06, TENANT_83, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const request = (path: string, headers: Record<string, string>) =>
  app.request(`${API_BASE_PATH}${path}`, { headers: { 'x-client-platform': 'web', ...headers } });

let editor06: string;
let editor83: string;

beforeAll(async () => {
  [editor06, editor83] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
});

describe('vertical slice: SDIS DEMO 06 user', () => {
  it('belongs to SDIS DEMO 06 only', async () => {
    const response = await request('/me', { authorization: `Bearer ${editor06}` });
    const me = endpoints.getMe.response.parse(await response.json());
    expect(me.memberships.map((m) => m.tenant_name)).toEqual(['SDIS DEMO 06']);
    expect(me.memberships[0]?.roles).toEqual(['PREVISION_EDITOR']);
  });

  it('lists the sites of its SIS and sees EHPAD Les Oliviers', async () => {
    const response = await request('/sites', { authorization: `Bearer ${editor06}`, 'x-tenant-id': TENANT_06 });
    expect(response.status).toBe(200);
    const page = endpoints.listSites.response.parse(await response.json());
    expect(page.items.map((site) => site.name)).toContain('EHPAD Les Oliviers');
    expect(page.items.every((site) => site.tenant_id === TENANT_06)).toBe(true);
  });

  it('reads the detail of EHPAD Les Oliviers with its active publication', async () => {
    const response = await request(`/sites/${EHPAD_ID}`, {
      authorization: `Bearer ${editor06}`,
      'x-tenant-id': TENANT_06,
    });
    const site = endpoints.getSite.response.parse(await response.json());
    expect(site.etare_number).toBe('06-0428');
    expect(site.active_publication?.publication_number).toBe(1);
  });

  it('cannot open a request in SDIS DEMO 83', async () => {
    const response = await request('/sites', { authorization: `Bearer ${editor06}`, 'x-tenant-id': TENANT_83 });
    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('FORBIDDEN');
  });

  it('cannot read a SDIS DEMO 83 site, even with its exact id', async () => {
    const response = await request(`/sites/${SITE_83_ID}`, {
      authorization: `Bearer ${editor06}`,
      'x-tenant-id': TENANT_06,
    });
    expect(response.status).toBe(404);
  });

  it('paginates with an opaque cursor', async () => {
    const first = endpoints.listSites.response.parse(
      await (await request('/sites?limit=1', { authorization: `Bearer ${editor06}`, 'x-tenant-id': TENANT_06 })).json(),
    );
    expect(first.items).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const second = endpoints.listSites.response.parse(
      await (
        await request(`/sites?limit=1&cursor=${first.next_cursor}`, {
          authorization: `Bearer ${editor06}`,
          'x-tenant-id': TENANT_06,
        })
      ).json(),
    );
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
  });
});

describe('vertical slice: symmetric isolation', () => {
  it('a SDIS DEMO 83 user sees only 83 sites', async () => {
    const response = await request('/sites', { authorization: `Bearer ${editor83}`, 'x-tenant-id': TENANT_83 });
    const page = endpoints.listSites.response.parse(await response.json());
    expect(page.items.map((site) => site.name)).not.toContain('EHPAD Les Oliviers');
    expect(page.items.every((site) => site.tenant_id === TENANT_83)).toBe(true);
  });

  it('rejects a forged token', async () => {
    const [header, payload] = editor06.split('.');
    const response = await request('/me', { authorization: `Bearer ${header}.${payload}.forged-signature` });
    expect(response.status).toBe(401);
  });
});
