/**
 * Sprint 3 — objects, zones and risks drawn on plans (PLAN-02..04, RISK-01/02)
 * through the real stack: positions in plan pixels, scope derived from the
 * plan and the zones, SIS risk catalogue with its own fields, isolation.
 * Everything created here is archived at the end (the demo plan stays clean).
 */
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { createApiApp, createApiDependencies } from '@etare/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, TENANT_83, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));

const DEMO_REVISION = '06000007-0000-4000-8000-000000000001';
const LEVEL_RDC_A = '06000004-0000-4000-8000-000000000002';
const BUILDING_A = '06000003-0000-4000-8000-000000000001';
const TECHNICAL_ROOM = '06000008-0000-4000-8000-000000000001';
const PHARMACY_ROOM = '06000008-0000-4000-8000-000000000002';

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

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: { message: string; fields?: { path: string }[] } }).error;

const onDemoPlan = (geometry: unknown) => ({ plan_revision_id: DEMO_REVISION, geometry });
const square = (x: number, y: number, size: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});

let editor06: Call;
let reader06: Call;
let admin06: Call;
let editor83: Call;
const cleanup: (() => Promise<unknown>)[] = [];

beforeAll(async () => {
  const [editor, reader, admin, other] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('lecteur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  reader06 = as(reader, TENANT_06);
  admin06 = as(admin, TENANT_06);
  editor83 = as(other, TENANT_83);
});

afterAll(async () => {
  for (const archive of cleanup.reverse()) await archive();
});

async function objectType(code: string): Promise<string> {
  const { items } = endpoints.listObjectTypes.response.parse(await (await editor06('GET', '/object-types')).json());
  const type = items.find((candidate) => candidate.code === code);
  if (!type) throw new Error(`Object type ${code} missing from the catalogue.`);
  return type.id;
}

async function siteObject(id: string) {
  const { items } = endpoints.listSiteObjects.response.parse(
    await (await editor06('GET', `/sites/${EHPAD_ID}/objects`)).json(),
  );
  return items.find((item) => item.id === id);
}

describe('objects on plans', () => {
  it('places an object in plan pixels; level, building and room follow the plan', async () => {
    const created = await editor06('POST', `/sites/${EHPAD_ID}/objects`, {
      object_type_id: await objectType('SSI'),
      label: 'SSI test',
      plan_position: onDemoPlan({ type: 'Point', coordinates: [300, 500] }),
    });
    expect(created.status).toBe(201);
    const object = endpoints.createSiteObject.response.parse(await created.json());
    cleanup.push(async () =>
      editor06('PATCH', `/objects/${object.id}`, { status: 'archived' }, (await siteObject(object.id))?.row_version),
    );
    expect(object).toMatchObject({ geometry: null, level_id: LEVEL_RDC_A, building_id: BUILDING_A, zone_id: null });
    expect(object.plan_position).toEqual({
      plan_id: '06000006-0000-4000-8000-000000000001',
      plan_revision_id: DEMO_REVISION,
      revision_no: 1,
      is_current: true,
      geometry: { type: 'Point', coordinates: [300, 500] },
    });

    const moved = await editor06(
      'PATCH',
      `/objects/${object.id}`,
      { plan_position: onDemoPlan({ type: 'Point', coordinates: [420.5, 300] }) },
      object.row_version,
    );
    expect(moved.status).toBe(200);
    const inRoom = endpoints.updateObject.response.parse(await moved.json());
    expect(inRoom.zone_id).toBe(TECHNICAL_ROOM);
    expect(inRoom.plan_position?.geometry).toEqual({ type: 'Point', coordinates: [420.5, 300] });

    const outside = await editor06(
      'PATCH',
      `/objects/${object.id}`,
      { plan_position: onDemoPlan({ type: 'Point', coordinates: [1700, 300] }) },
      inRoom.row_version,
    );
    expect(outside.status).toBe(400);
    expect((await errorOf(outside)).message).toBe('L’élément doit rester sur le fond du plan.');
  });

  it('checks the plan geometry against the object type', async () => {
    const line = await editor06('POST', `/sites/${EHPAD_ID}/objects`, {
      object_type_id: await objectType('SSI'),
      plan_position: onDemoPlan({
        type: 'LineString',
        coordinates: [
          [10, 10],
          [20, 20],
        ],
      }),
    });
    expect(line.status).toBe(400);
    expect((await errorOf(line)).fields?.[0]?.path).toBe('plan_position.geometry');
    const nowhere = await editor06('POST', `/sites/${EHPAD_ID}/objects`, { object_type_id: await objectType('SSI') });
    expect(nowhere.status).toBe(400);
  });
});

describe('zones', () => {
  it('draws a zone on the level plan and refuses a crossed outline', async () => {
    const created = await editor06('POST', `/sites/${EHPAD_ID}/zones`, {
      name: 'Local test',
      zone_type: 'technical',
      plan_position: onDemoPlan(square(1000, 100, 120)),
    });
    expect(created.status).toBe(201);
    const zone = endpoints.createZone.response.parse(await created.json());
    cleanup.push(() => editor06('PATCH', `/zones/${zone.id}`, { status: 'archived' }, zone.row_version));
    expect(zone).toMatchObject({ level_id: LEVEL_RDC_A, zone_type: 'technical' });

    const crossed = await editor06('POST', `/sites/${EHPAD_ID}/zones`, {
      name: 'Nœud papillon',
      zone_type: 'room',
      plan_position: onDemoPlan({
        type: 'Polygon',
        coordinates: [
          [
            [100, 100],
            [200, 200],
            [200, 100],
            [100, 200],
            [100, 100],
          ],
        ],
      }),
    });
    expect(crossed.status).toBe(400);
    expect((await errorOf(crossed)).message).toContain('ne doit pas se recouper');

    const listed = endpoints.listSiteZones.response.parse(
      await (await reader06('GET', `/sites/${EHPAD_ID}/zones`)).json(),
    );
    expect(listed.items.map((item) => item.id)).toContain(zone.id);
  });
});

describe('risks and the SIS catalogue', () => {
  it('lets the SIS administrator extend the catalogue, never the national entries', async () => {
    const code = `CUVE_TEST_${Date.now()}`;
    const created = await admin06('POST', '/risk-types', {
      code,
      name: 'Cuve de fioul (test)',
      default_severity: 3,
      icon_key: 'risk-flammable',
      fields: [
        { key: 'volume_m3', title: 'Volume', kind: 'number', unit: 'm³', required: true },
        { key: 'produit', title: 'Produit', kind: 'choice', choices: ['fioul', 'gazole'] },
      ],
    });
    expect(created.status).toBe(201);
    const type = endpoints.createRiskType.response.parse(await created.json());
    expect(type).toMatchObject({ owner: 'sis', status: 'active' });

    // Occurrence with the fields of the SIS type, drawn in the pharmacy room.
    const bad = await editor06('POST', `/sites/${EHPAD_ID}/risks`, {
      risk_type_id: type.id,
      properties: { produit: 'essence' },
      plan_position: onDemoPlan(square(500, 270, 30)),
    });
    expect(bad.status).toBe(400);
    const risk = await editor06('POST', `/sites/${EHPAD_ID}/risks`, {
      risk_type_id: type.id,
      label: 'Cuve',
      properties: { volume_m3: 2, produit: 'fioul' },
      plan_position: onDemoPlan(square(500, 270, 30)),
    });
    expect(risk.status).toBe(201);
    const occurrence = endpoints.createSiteRisk.response.parse(await risk.json());
    cleanup.push(() => editor06('PATCH', `/risks/${occurrence.id}`, { status: 'archived' }, occurrence.row_version));
    expect(occurrence).toMatchObject({
      severity: 3,
      icon_key: 'risk-flammable',
      zone_id: PHARMACY_ROOM,
      level_id: LEVEL_RDC_A,
      building_id: BUILDING_A,
    });

    // The editor cannot change the catalogue; nobody changes national entries.
    expect((await editor06('POST', '/risk-types', { ...type, code: `${code}_BIS`, fields: [] })).status).toBe(403);
    const national = endpoints.listRiskTypes.response
      .parse(await (await editor06('GET', '/risk-types')).json())
      .items.find((item) => item.code === 'INFLAMMABLE');
    expect(national?.owner).toBe('national');
    expect(
      (await admin06('PATCH', `/risk-types/${national?.id}`, { name: 'Autre' }, national?.row_version)).status,
    ).toBe(403);
    expect(
      (
        await admin06('POST', '/risk-types', {
          code: 'INFLAMMABLE',
          name: 'Doublon',
          default_severity: 3,
          icon_key: 'risk-flammable',
        })
      ).status,
    ).toBe(409);

    // A retired type is no longer offered, its occurrences remain.
    const retired = await admin06('PATCH', `/risk-types/${type.id}`, { status: 'deprecated' }, type.row_version);
    expect(retired.status).toBe(200);
    const offered = endpoints.listRiskTypes.response.parse(await (await editor06('GET', '/risk-types')).json());
    expect(offered.items.map((item) => item.id)).not.toContain(type.id);
    const managed = endpoints.listRiskTypes.response.parse(
      await (await admin06('GET', '/risk-types?include_deprecated=true')).json(),
    );
    expect(managed.items.find((item) => item.id === type.id)?.status).toBe('deprecated');
  });

  it('scopes a risk to a level without drawing it, and refuses contradictions', async () => {
    const { items } = endpoints.listRiskTypes.response.parse(await (await editor06('GET', '/risk-types')).json());
    const oxygen = items.find((item) => item.code === 'OXYGENE');
    const scoped = await editor06('POST', `/sites/${EHPAD_ID}/risks`, {
      risk_type_id: oxygen?.id,
      severity: 4,
      quantity: 6,
      unit: 'bouteilles',
      level_id: LEVEL_RDC_A,
    });
    expect(scoped.status).toBe(201);
    const risk = endpoints.createSiteRisk.response.parse(await scoped.json());
    cleanup.push(() => editor06('PATCH', `/risks/${risk.id}`, { status: 'archived' }, risk.row_version));
    expect(risk).toMatchObject({ building_id: BUILDING_A, plan_position: null, quantity: 6 });

    const contradiction = await editor06('POST', `/sites/${EHPAD_ID}/risks`, {
      risk_type_id: oxygen?.id,
      level_id: LEVEL_RDC_A,
      building_id: '06000003-0000-4000-8000-000000000002',
    });
    expect(contradiction.status).toBe(400);
    expect((await errorOf(contradiction)).message).toBe('Bâtiment, niveau et zone ne concordent pas.');
  });

  it('keeps risks inside the SIS and writes to editors', async () => {
    expect((await editor83('GET', `/sites/${EHPAD_ID}/risks`)).status).toBe(404);
    const { items } = endpoints.listRiskTypes.response.parse(await (await reader06('GET', '/risk-types')).json());
    const creation = { risk_type_id: items[0]?.id };
    expect((await reader06('POST', `/sites/${EHPAD_ID}/risks`, creation)).status).toBe(403);
  });
});
