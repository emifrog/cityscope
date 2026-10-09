/**
 * Sprint 14 — hazardous substances and their safety data sheets (RISK-03) through the real
 * stack: declaration with classes, quantity and location, the FDS as a document of the site
 * classed FDS, concurrency, RBAC and isolation. Everything created here is archived at the end.
 */
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { createApiApp, createApiDependencies } from '@etare/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, TENANT_83, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));

const BUILDING_A = '06000003-0000-4000-8000-000000000001';
const LEVEL_RDC_A = '06000004-0000-4000-8000-000000000002';
const BUILDING_B = '06000003-0000-4000-8000-000000000002';
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

let editor06: Call;
let reader06: Call;
let editor83: Call;
const cleanup: (() => Promise<unknown>)[] = [];

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

afterAll(async () => {
  for (const archive of cleanup.reverse()) await archive();
});

/** A document of the EHPAD (its first version stays pending: the sheet is attached, not published). */
async function declareDocument(category: 'fds' | 'notice'): Promise<string> {
  const response = await editor06('POST', `/sites/${EHPAD_ID}/documents`, {
    title: `${category === 'fds' ? 'FDS' : 'Notice'} test ${Date.now()}`,
    category,
    offline_policy: 'on_demand',
    file: { filename: 'fiche.pdf', mime_type: 'application/pdf', size_bytes: 1024, sha256: 'a'.repeat(64) },
  });
  expect(response.status).toBe(201);
  const { document } = endpoints.createDocument.response.parse(await response.json());
  cleanup.push(() => editor06('PATCH', `/documents/${document.id}`, { status: 'archived' }, document.row_version));
  return document.id;
}

describe('hazardous substances (RISK-03)', () => {
  it('declares a product with its classes, quantity, location and sheet, then corrects it', async () => {
    const fds = await declareDocument('fds');
    const created = await editor06('POST', `/sites/${EHPAD_ID}/substances`, {
      name: 'Acétylène (test)',
      hazard_classes: ['GHS02', 'GHS04'],
      un_number: '1001',
      physical_state: 'gas',
      quantity: 2,
      unit: 'bouteilles',
      zone_id: PHARMACY_ROOM,
      location_note: 'Armoire ventilée',
      fds_document_id: fds,
    });
    expect(created.status).toBe(201);
    const substance = endpoints.createSiteSubstance.response.parse(await created.json());
    cleanup.push(() =>
      editor06('PATCH', `/substances/${substance.id}`, { status: 'archived' }, substance.row_version + 1),
    );
    // The level and the building follow the zone; the sheet is named.
    expect(substance).toMatchObject({
      building_id: BUILDING_A,
      level_id: LEVEL_RDC_A,
      zone_id: PHARMACY_ROOM,
      fds_document_id: fds,
      hazard_classes: ['GHS02', 'GHS04'],
      status: 'active',
    });
    expect(substance.fds_title).toMatch(/^FDS test/);

    const listed = endpoints.listSiteSubstances.response.parse(
      await (await editor06('GET', `/sites/${EHPAD_ID}/substances`)).json(),
    );
    expect(listed.items.some((item) => item.id === substance.id)).toBe(true);

    const corrected = await editor06(
      'PATCH',
      `/substances/${substance.id}`,
      { quantity: 3, unit: 'bouteilles', fds_document_id: null },
      substance.row_version,
    );
    expect(corrected.status).toBe(200);
    expect(endpoints.updateSubstance.response.parse(await corrected.json())).toMatchObject({
      quantity: 3,
      fds_document_id: null,
      fds_title: null,
      row_version: substance.row_version + 1,
    });
    // A stale version is refused.
    expect(
      (await editor06('PATCH', `/substances/${substance.id}`, { notes: 'Tard' }, substance.row_version)).status,
    ).toBe(412);
  });

  it('refuses a sheet that is not an FDS of the site, a contradicting location, a lone quantity', async () => {
    const notice = await declareDocument('notice');
    const wrongSheet = await editor06('POST', `/sites/${EHPAD_ID}/substances`, {
      name: 'Produit',
      fds_document_id: notice,
    });
    expect(wrongSheet.status).toBe(400);
    expect((await errorOf(wrongSheet)).fields?.[0]?.path).toBe('fds_document_id');

    const contradiction = await editor06('POST', `/sites/${EHPAD_ID}/substances`, {
      name: 'Produit',
      zone_id: PHARMACY_ROOM,
      building_id: BUILDING_B,
    });
    expect(contradiction.status).toBe(400);
    expect((await errorOf(contradiction)).message).toMatch(/ne se correspondent pas/);

    const lone = await editor06('POST', `/sites/${EHPAD_ID}/substances`, { name: 'Produit', quantity: 5 });
    expect(lone.status).toBe(400);
    expect((await errorOf(lone)).fields?.[0]?.path).toBe('unit');
  });

  it('is read by the readers of the site, written by its editors, invisible to another SIS', async () => {
    const created = await editor06('POST', `/sites/${EHPAD_ID}/substances`, { name: 'Chlore (test)' });
    const substance = endpoints.createSiteSubstance.response.parse(await created.json());
    cleanup.push(() => editor06('PATCH', `/substances/${substance.id}`, { status: 'archived' }, substance.row_version));

    const read = endpoints.listSiteSubstances.response.parse(
      await (await reader06('GET', `/sites/${EHPAD_ID}/substances`)).json(),
    );
    expect(read.items.some((item) => item.id === substance.id)).toBe(true);
    expect((await reader06('POST', `/sites/${EHPAD_ID}/substances`, { name: 'Lecteur' })).status).toBe(403);
    expect((await editor83('GET', `/sites/${EHPAD_ID}/substances`)).status).toBe(404);
    expect(
      (await editor83('PATCH', `/substances/${substance.id}`, { name: 'Autre' }, substance.row_version)).status,
    ).toBe(404);
  });

  it('reaches the ETARE preview with its sheet when the sheet is published', async () => {
    const created = await editor06('POST', `/sites/${EHPAD_ID}/substances`, {
      name: 'Fioul (test aperçu)',
      hazard_classes: ['GHS02'],
      quantity: 500,
      unit: 'L',
    });
    const substance = endpoints.createSiteSubstance.response.parse(await created.json());
    cleanup.push(() => editor06('PATCH', `/substances/${substance.id}`, { status: 'archived' }, substance.row_version));
    const preview = endpoints.previewSiteEtare.response.parse(
      await (await editor06('GET', `/sites/${EHPAD_ID}/etare/preview`)).json(),
    );
    const published = preview.snapshot.substances?.find((item) => item.id === substance.id);
    expect(published).toMatchObject({ name: 'Fioul (test aperçu)', quantity: 500, unit: 'L', fds: null });
    expect(preview.checks.find((check) => check.code === 'substances')?.level).toBe('warning');
  });
});
