/**
 * Sprint 2 — footprints drawn on the map, stored by PostGIS, and the rules of
 * the geocoding proxy that do not require calling the IGN service.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, TENANT_83, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));

type Call = (method: string, path: string, body?: unknown, ifMatch?: number) => Promise<Response>;
const as =
  (token: string, tenant: string): Call =>
  async (method, path, body, ifMatch) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': tenant,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

/** Square of about 40 m around EHPAD Les Oliviers. */
const square = [
  [7.2516, 43.7077],
  [7.252, 43.7077],
  [7.252, 43.7081],
  [7.2516, 43.7081],
  [7.2516, 43.7077],
];
/** Self-intersecting "bow tie": rejected by PostGIS. */
const bowTie = [
  [7.2516, 43.7077],
  [7.252, 43.7081],
  [7.252, 43.7077],
  [7.2516, 43.7081],
  [7.2516, 43.7077],
];

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

async function siteVersion(): Promise<number> {
  const site = endpoints.getSite.response.parse(await (await editor06('GET', `/sites/${EHPAD_ID}`)).json());
  return site.row_version;
}

describe('footprints', () => {
  it('stores a drawn site footprint as a MultiPolygon, refuses an invalid one, and removes it', async () => {
    const drawn = await editor06(
      'PATCH',
      `/sites/${EHPAD_ID}`,
      { footprint: { type: 'Polygon', coordinates: [square] } },
      await siteVersion(),
    );
    expect(drawn.status).toBe(200);
    const site = endpoints.updateSite.response.parse(await drawn.json());
    expect(site.footprint).toEqual({ type: 'MultiPolygon', coordinates: [[square]] });

    const invalid = await editor06(
      'PATCH',
      `/sites/${EHPAD_ID}`,
      { footprint: { type: 'Polygon', coordinates: [bowTie] } },
      site.row_version,
    );
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { message: string } }).error.message).toContain('Contour invalide');

    const removed = await editor06('PATCH', `/sites/${EHPAD_ID}`, { footprint: null }, site.row_version);
    expect(endpoints.updateSite.response.parse(await removed.json()).footprint).toBeNull();
  });

  it('draws a building footprint at creation and keeps it in the building list', async () => {
    const created = await editor06('POST', `/sites/${EHPAD_ID}/buildings`, {
      name: `Bâtiment tracé ${Date.now()}`,
      footprint: { type: 'Polygon', coordinates: [square] },
    });
    expect(created.status).toBe(201);
    const building = endpoints.createBuilding.response.parse(await created.json());
    expect(building.footprint?.type).toBe('MultiPolygon');

    const moved = await editor06(
      'PATCH',
      `/buildings/${building.id}`,
      { footprint: { type: 'MultiPolygon', coordinates: [[square.map(([x, y]) => [(x ?? 0) + 0.0001, y ?? 0])]] } },
      building.row_version,
    );
    expect(moved.status).toBe(200);
    expect(endpoints.updateBuilding.response.parse(await moved.json()).footprint?.coordinates[0]?.[0]?.[0]).toEqual([
      7.2517, 43.7077,
    ]);
  });

  it('keeps footprints inside the SIS', async () => {
    const other = await editor83(
      'PATCH',
      `/sites/${EHPAD_ID}`,
      { footprint: { type: 'Polygon', coordinates: [square] } },
      await siteVersion(),
    );
    expect(other.status).toBe(404);
  });
});

describe('geocoding proxy', () => {
  it('checks the caller and the query before contacting the geocoder', async () => {
    expect((await ops06('GET', '/geocoding/search?q=12%20avenue%20des%20mimosas')).status).toBe(403);
    expect((await editor06('GET', '/geocoding/search?q=ab')).status).toBe(400);
    expect((await editor06('GET', '/geocoding/reverse?lon=200&lat=43')).status).toBe(400);
  });
});
