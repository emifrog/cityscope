/**
 * Sprint 2 — operational objects placed on the map (MAP-02) through the real
 * stack: typed properties, geometry of the type, distances, map details.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints, type ObjectType } from '@etare/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, TENANT_83, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const AROUND_EHPAD = '7.249,43.706,7.254,43.709';

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

let editor06: Call;
let reader06: Call;
let editor83: Call;
let types: ObjectType[];
const typeId = (code: string) => types.find((type) => type.code === code)?.id ?? '';

beforeAll(async () => {
  const [editor, reader, other] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('lecteur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  reader06 = as(reader, TENANT_06);
  editor83 = as(other, TENANT_83);
  types = endpoints.listObjectTypes.response.parse(await (await editor06('GET', '/object-types')).json()).items;
});

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: { message: string; fields?: { path: string; message: string }[] } }).error;

describe('operational objects', () => {
  it('serves the catalogue with the typed properties of hydrants', () => {
    const hydrant = types.find((type) => type.code === 'PEI');
    expect(hydrant).toMatchObject({ geometry_kind: 'point', category: 'water' });
    expect(Object.keys((hydrant?.properties_schema['properties'] as object | undefined) ?? {})).toContain('debit_m3h');
  });

  it('lists the objects of a site with their distance to the reference point', async () => {
    const response = await reader06('GET', `/sites/${EHPAD_ID}/objects`);
    expect(response.status).toBe(200);
    const { items } = endpoints.listSiteObjects.response.parse(await response.json());
    const hydrant = items.find((object) => object.label === 'PEI 1');
    expect(hydrant).toMatchObject({ category: 'water', properties: { debit_m3h: 120 } });
    expect(hydrant?.distance_m).toBeGreaterThan(50);
    expect(hydrant?.distance_m).toBeLessThan(150);
    // Interior objects exist on plans only: no map geometry.
    expect(items.find((object) => object.type_code === 'TGBT')?.geometry).toBeNull();
  });

  it('places a typed hydrant, refuses wrong properties and a wrong geometry', async () => {
    const created = await editor06('POST', `/sites/${EHPAD_ID}/objects`, {
      object_type_id: typeId('PEI'),
      label: 'PEI 2',
      geometry: { type: 'Point', coordinates: [7.2525, 43.7083] },
      properties: { nature: 'bouche', debit_m3h: 60 },
      criticality: 'important',
    });
    expect(created.status).toBe(201);
    const hydrant = endpoints.createSiteObject.response.parse(await created.json());
    expect(hydrant).toMatchObject({ type_code: 'PEI', status: 'active', properties: { nature: 'bouche' } });

    const badProperties = await editor06('POST', `/sites/${EHPAD_ID}/objects`, {
      object_type_id: typeId('PEI'),
      geometry: { type: 'Point', coordinates: [7.2525, 43.7083] },
      properties: { debit_m3h: -1, couleur: 'rouge' },
    });
    expect(badProperties.status).toBe(400);
    expect((await errorOf(badProperties)).fields?.map((field) => field.path)).toEqual([
      'properties.debit_m3h',
      'properties.couleur',
    ]);

    const line = await editor06('POST', `/sites/${EHPAD_ID}/objects`, {
      object_type_id: typeId('PEI'),
      geometry: {
        type: 'LineString',
        coordinates: [
          [7.2525, 43.7083],
          [7.2526, 43.7084],
        ],
      },
    });
    expect(line.status).toBe(400);
    expect((await errorOf(line)).message).toContain('un point');
  });

  it('moves, verifies and puts an object out of service with optimistic concurrency', async () => {
    const created = endpoints.createSiteObject.response.parse(
      await (
        await editor06('POST', `/sites/${EHPAD_ID}/objects`, {
          object_type_id: typeId('VOIE_ENGINS'),
          name: 'Voie engins nord',
          geometry: {
            type: 'LineString',
            coordinates: [
              [7.2511, 43.7082],
              [7.2521, 43.7084],
            ],
          },
          properties: { largeur_m: 4 },
        })
      ).json(),
    );
    const moved = await editor06(
      'PATCH',
      `/objects/${created.id}`,
      {
        geometry: {
          type: 'LineString',
          coordinates: [
            [7.2512, 43.7082],
            [7.2522, 43.7084],
          ],
        },
        status: 'out_of_service',
        verified: true,
      },
      created.row_version,
    );
    expect(moved.status).toBe(200);
    const updated = endpoints.updateObject.response.parse(await moved.json());
    expect(updated).toMatchObject({ status: 'out_of_service', row_version: created.row_version + 1 });
    expect(updated.verified_at).not.toBeNull();
    expect((await editor06('PATCH', `/objects/${created.id}`, { status: 'active' }, created.row_version)).status).toBe(
      412,
    );
  });

  it('serves building footprints and objects of a small extent only, inside the SIS', async () => {
    const response = await reader06('GET', `/map/features?bbox=${AROUND_EHPAD}`);
    expect(response.status).toBe(200);
    const details = endpoints.listMapFeatures.response.parse(await response.json());
    const labels = details.objects.features.map((feature) => feature.properties.label);
    expect(labels).toEqual(expect.arrayContaining(['PEI 1', 'P1']));
    expect(details.objects.features.every((feature) => feature.properties.site_name === 'EHPAD Les Oliviers')).toBe(
      true,
    );

    expect((await reader06('GET', '/map/features?bbox=6.5,43.4,7.5,44')).status).toBe(400);
    const other = endpoints.listMapFeatures.response.parse(
      await (await editor83('GET', `/map/features?bbox=${AROUND_EHPAD}`)).json(),
    );
    expect(other.objects.features).toEqual([]);
    expect(other.buildings.features).toEqual([]);
  });

  it('keeps writes to editors and objects inside their SIS', async () => {
    const placement = {
      object_type_id: typeId('PEI'),
      geometry: { type: 'Point', coordinates: [7.2525, 43.7083] },
    };
    expect((await reader06('POST', `/sites/${EHPAD_ID}/objects`, placement)).status).toBe(403);
    expect((await editor83('POST', `/sites/${EHPAD_ID}/objects`, placement)).status).toBe(404);
    expect((await editor83('GET', `/sites/${EHPAD_ID}/objects`)).status).toBe(404);
  });
});
