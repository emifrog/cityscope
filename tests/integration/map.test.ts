/**
 * Sprint 2 — map endpoints through the real stack: server-side catalogue of
 * base maps, positioned sites of the active SIS only, extent filtering.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, TENANT_83, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const NICE = '7.2,43.65,7.3,43.75';
const MARSEILLE = '5.3,43.2,5.5,43.4';

type Call = (path: string) => Promise<Response>;
const as =
  (token: string, tenant: string): Call =>
  async (path) =>
    app.request(`${API_BASE_PATH}${path}`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': tenant, 'x-client-platform': 'web' },
    });

let editor06: Call;
let editor83: Call;
let ops06: Call;

beforeAll(async () => {
  const [editor, other, ops] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  editor83 = as(other, TENANT_83);
  ops06 = as(ops, TENANT_06);
});

const sites = async (call: Call, query = '') => {
  const response = await call(`/map/sites${query}`);
  expect(response.status).toBe(200);
  return endpoints.listMapSites.response.parse(await response.json());
};

describe('map', () => {
  it('serves the base map catalogue with attribution and unverified offline rights', async () => {
    const response = await editor06('/map/sources');
    expect(response.status).toBe(200);
    const catalog = endpoints.getMapCatalog.response.parse(await response.json());
    const base = catalog.sources.find((source) => source.id === catalog.default_base);
    expect(base).toMatchObject({ attribution: '© IGN – Plan IGN', rights: { offline_packaging: 'unverified' } });
  });

  it('returns the positioned sites of the active SIS only, as GeoJSON in longitude/latitude order', async () => {
    const collection = await sites(editor06);
    const ehpad = collection.features.find((feature) => feature.properties.name === 'EHPAD Les Oliviers');
    expect(ehpad?.geometry.coordinates).toEqual([7.2518, 43.7079]);
    expect(ehpad?.properties).toMatchObject({ published: true, publication_number: expect.any(Number) });
    expect(collection.features.some((feature) => feature.properties.name.includes('(démo 83)'))).toBe(false);

    const other = await sites(editor83);
    expect(other.features.map((feature) => feature.properties.name).sort()).toEqual([
      'Plateforme industrielle Démo Var',
      'Résidence Les Pins (démo 83)',
    ]);
  });

  it('limits features to the visible extent but keeps the extent of every match', async () => {
    const nice = await sites(editor06, `?bbox=${NICE}`);
    expect(nice.features.every((feature) => feature.properties.city !== 'Antibes')).toBe(true);
    expect(nice.features.some((feature) => feature.properties.name === 'EHPAD Les Oliviers')).toBe(true);

    const elsewhere = await sites(editor06, `?bbox=${MARSEILLE}`);
    expect(elsewhere.features).toEqual([]);
    const [west, , east] = elsewhere.extent ?? [];
    expect(west).toBeLessThanOrEqual(7.1106);
    expect(east).toBeGreaterThanOrEqual(7.2518);
  });

  it('applies the same filters as the site list', async () => {
    const drafts = await sites(editor06, '?status=draft');
    expect(drafts.features.every((feature) => feature.properties.status === 'draft')).toBe(true);
    expect(drafts.features.map((feature) => feature.properties.name)).toContain('Entrepôt logistique Démo Antibes');
    const search = await sites(editor06, '?q=oliviers');
    expect(search.features.map((feature) => feature.properties.name)).toEqual(['EHPAD Les Oliviers']);
  });

  it('refuses an invalid extent and callers without access to working data', async () => {
    expect((await editor06('/map/sites?bbox=7.3,43.65,7.2,43.75')).status).toBe(400);
    expect((await ops06('/map/sites')).status).toBe(403);
  });
});
