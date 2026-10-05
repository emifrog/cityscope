/**
 * Sprint 11 — offline base maps through the real stack (CAR-01 to CAR-03,
 * ADR-024): the administration prepares the base map of a sector, the worker
 * builds it from the synthetic test source (PMTiles in parts, style, signed
 * manifest), an enrolled tablet of the sector receives it in its signed
 * catalogue and downloads its parts; the Plan IGN stays locked while its rights
 * sheet is not signed off.
 */
import { createHash } from 'node:crypto';
import {
  Ed25519Signer,
  PmtilesArchiveFactory,
  PostgresBasemapBuildStore,
  PostgresJobQueue,
  SupabaseObjectStorage,
  SyntheticBasemapSource,
  createLogger,
  createPool,
  verifyEd25519,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import {
  API_BASE_PATH,
  basemapManifestSchema,
  endpoints,
  syncCatalogSchema,
  type BasemapManifest,
} from '@etare/contracts';
import { signedText } from '@etare/domain';
import { HandlerRegistry, basemapBuildHandler, createWorker } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, authApi, requireEnv, signIn, withSecondFactor } from './helpers';
import { Terminal } from './terminal';

const app = createApiApp(createApiDependencies({ ...process.env, BASEMAP_SOURCE: 'synthetic' }));
const ignApp = createApiApp(createApiDependencies({ ...process.env, BASEMAP_SOURCE: 'ign-plan-vector' }));
const publicationKey = Ed25519Signer.fromPkcs8(requireEnv('PUBLICATION_SIGNING_KEY'));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-basemaps',
});
const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-basemaps'),
  registry: new HandlerRegistry([
    basemapBuildHandler({
      store: new PostgresBasemapBuildStore(workerPool),
      source: new SyntheticBasemapSource(),
      archives: new PmtilesArchiveFactory(),
      objects: SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY')),
      signer: publicationKey,
      sha256,
      utf8: (text) => new TextEncoder().encode(text),
      now: () => new Date(),
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 1,
  leaseSeconds: 60,
  pollIntervalMs: 100,
  exclusiveTypes: ['basemap.build'],
});

type Call = (method: string, path: string, body?: unknown, ifMatch?: number) => Promise<Response>;
const as =
  (token: string, target = app): Call =>
  async (method, path, body, ifMatch) =>
    target.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': TENANT_06,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

let admin06: Call;
let ops06: Call;
let adminFactor: { token: string; factorId: string } | undefined;
let sectorId = '';
let device: Terminal;

const overview = async () =>
  endpoints.getBasemapOverview.response.parse(await (await admin06('GET', '/basemaps')).json());
const sectorState = async () => (await overview()).sectors.find((state) => state.sector.id === sectorId);
const catalog = async () =>
  syncCatalogSchema.parse(
    JSON.parse(
      endpoints.getSyncCatalog.response.parse(await (await device.request('GET', '/sync/catalog')).json()).catalog,
    ),
  );
const deviceVersion = async () =>
  endpoints.listDevices.response
    .parse(await (await admin06('GET', '/devices')).json())
    .items.find((item) => item.id === device.deviceId)?.row_version;

/** Runs the worker until the pack of the sector leaves the queue. */
async function build(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    await worker.runOnce();
    const state = await sectorState();
    if (!state?.latest || !['queued', 'building'].includes(state.latest.status)) return;
  }
  throw new Error('base map not built');
}

beforeAll(async () => {
  const [adminToken, opsToken] = await Promise.all([
    signIn('admin.sis06@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
  ]);
  adminFactor = await withSecondFactor(adminToken);
  admin06 = as(adminFactor.token);
  ops06 = as(opsToken);

  // A sector holding the published EHPAD (located, distributed), and a tablet assigned to it.
  const created = await admin06('POST', '/sectors', {
    name: `Secteur carte ${Date.now()}`,
    code: null,
    description: null,
    communes: [],
    site_ids: [EHPAD_ID],
  });
  expect(created.status).toBe(201);
  sectorId = endpoints.createSector.response.parse(await created.json()).id;
  const code = endpoints.createDevice.response.parse(
    await (await admin06('POST', '/devices', { name: `TABLETTE CARTE ${Date.now()}`, sector_ids: [sectorId] })).json(),
  ).enrollment_code;
  device = new Terminal(app, opsToken, TENANT_06);
  const enrolled = await ops06('POST', '/sync/enrollment', device.enrollment(code));
  device.deviceId = endpoints.enrollDevice.response.parse(await enrolled.json()).device_id;
});

afterAll(async () => {
  if (adminFactor && device?.deviceId) {
    const version = await deviceVersion();
    if (version)
      await admin06('POST', `/devices/${device.deviceId}/revocation`, { reason: 'Fin du test des fonds' }, version);
    const sector = endpoints.listSectors.response
      .parse(await (await admin06('GET', '/sectors')).json())
      .items.find((item) => item.id === sectorId);
    if (sector) await admin06('POST', `/sectors/${sectorId}/archive`, undefined, sector.row_version);
  }
  if (adminFactor) await authApi(`/factors/${adminFactor.factorId}`, { method: 'DELETE', token: adminFactor.token });
  await workerPool.end();
});

describe('offline base maps (ADR-024)', () => {
  let manifest: BasemapManifest;
  let packId = '';

  it('keeps the Plan IGN locked while its rights sheet is not signed off', async () => {
    const ign = as(adminFactor?.token ?? '', ignApp);
    const state = endpoints.getBasemapOverview.response.parse(await (await ign('GET', '/basemaps')).json());
    expect(state.source).toMatchObject({ id: 'ign-plan-vector', rights: 'unverified', usable: false });
    expect(await codeOf(await ign('POST', `/basemaps/sectors/${sectorId}/builds`))).toBe('CONFLICT');
    expect((await sectorState())?.latest).toBeNull();
  });

  it('is reserved to the administration of the terminals', async () => {
    expect(await codeOf(await ops06('GET', '/basemaps'))).toBe('FORBIDDEN');
    expect(await codeOf(await ops06('POST', `/basemaps/sectors/${sectorId}/builds`))).toBe('FORBIDDEN');
  });

  it('prepares the base map of a sector on request: PMTiles in parts, style, signed manifest', async () => {
    const before = await sectorState();
    expect(before).toMatchObject({ eligible: true, site_count: 1, detail_count: 1, current: null });
    const requested = await admin06('POST', `/basemaps/sectors/${sectorId}/builds`);
    expect(requested.status).toBe(200);
    const queued = endpoints.requestBasemapBuild.response
      .parse(await requested.json())
      .sectors.find((state) => state.sector.id === sectorId);
    expect(queued?.latest).toMatchObject({ status: 'queued', reason: 'manual', source_id: 'synthetic' });

    await build();
    const state = await sectorState();
    expect(state?.current).toMatchObject({ status: 'ready', version: 1, source_id: 'synthetic' });
    expect(state?.current?.tile_count).toBeGreaterThan(100);
    packId = state?.current?.id ?? '';
    // Our tablet, and the tablets of the whole SIS left by other runs on a local stack.
    expect(state?.devices.expected).toBeGreaterThanOrEqual(1);
  });

  it('lists it in the signed catalogue of the tablet, with a manifest signed by the publication key', async () => {
    const entry = (await catalog()).basemaps.find((item) => item.pack_id === packId);
    expect(entry).toMatchObject({ sector_id: sectorId, version: 1 });
    const served = endpoints.getSyncBasemap.response.parse(
      await (await device.request('GET', `/sync/basemaps/${packId}`)).json(),
    );
    expect(await sha256(served.manifest)).toBe(entry?.manifest_hash);
    expect(
      verifyEd25519(
        publicationKey.publicKey,
        signedText('etare.basemap.v1', served.manifest),
        served.signature.signature,
      ),
    ).toBe(true);
    manifest = basemapManifestSchema.parse(JSON.parse(served.manifest));
    expect(manifest.source).toMatchObject({ id: 'synthetic', synthetic: true });
    expect(manifest.coverage.detail_points).toEqual([[7.2518, 43.7079]]);
    expect(manifest.files.map((file) => file.path)).toEqual(['tiles.pmtiles', 'style.json']);
  });

  it('serves the parts by short-lived URLs: their concatenation is the signed file', async () => {
    const tiles = manifest.files.find((file) => file.path === 'tiles.pmtiles');
    const style = manifest.files.find((file) => file.path === 'style.json');
    const wanted = [...(tiles?.parts ?? []).map((part) => part.sha256), style?.sha256 ?? ''];
    const downloads = endpoints.createSyncBasemapDownloads.response.parse(
      await (await device.request('POST', `/sync/basemaps/${packId}/downloads`, { sha256: wanted })).json(),
    );
    expect(downloads.files.map((file) => file.sha256).sort()).toEqual([...new Set(wanted)].sort());
    const fetched = new Map<string, Uint8Array>();
    for (const file of downloads.files) {
      const bytes = new Uint8Array(await (await fetch(file.url)).arrayBuffer());
      expect(await sha256(bytes)).toBe(file.sha256);
      fetched.set(file.sha256, bytes);
    }
    const parts = (tiles?.parts ?? []).map((part) => fetched.get(part.sha256) ?? new Uint8Array());
    const whole = Buffer.concat(parts);
    expect(whole.byteLength).toBe(tiles?.size_bytes);
    expect(await sha256(whole)).toBe(tiles?.sha256);
    expect(whole.subarray(0, 7).toString('ascii')).toBe('PMTiles');
    expect(whole[7]).toBe(3);
    const styleText = new TextDecoder().decode(fetched.get(style?.sha256 ?? ''));
    expect(styleText).toContain('pmtiles://file://{{BASEMAP_DIR}}/tiles.pmtiles');
    expect(styleText).not.toMatch(/https?:\/\//);
  });

  it('records what the tablet holds, and supersedes the file at the next preparation', async () => {
    const receipt = await device.request('POST', '/sync/basemaps/receipts', { installed: [packId] });
    expect(endpoints.recordSyncBasemapReceipt.response.parse(await receipt.json()).installed).toBe(1);
    expect((await sectorState())?.devices.installed).toBe(1);

    expect((await admin06('POST', `/basemaps/sectors/${sectorId}/builds`)).status).toBe(200);
    await build();
    const state = await sectorState();
    expect(state?.current?.version).toBe(2);
    expect(state?.devices.installed).toBe(0);
    expect((await device.request('GET', `/sync/basemaps/${packId}`)).status).toBe(404);
    expect((await catalog()).basemaps.map((item) => item.version)).toEqual([2]);
  });

  it('withdraws the base map from a tablet assigned elsewhere', async () => {
    const sectors = endpoints.listSectors.response.parse(await (await admin06('GET', '/sectors')).json()).items;
    const elsewhere = sectors.find((item) => item.name === 'CIS Antibes');
    const moved = await admin06(
      'PUT',
      `/devices/${device.deviceId}/perimeter`,
      { sector_ids: [elsewhere?.id] },
      await deviceVersion(),
    );
    expect(moved.status).toBe(200);
    expect((await catalog()).basemaps.map((item) => item.sector_id)).not.toContain(sectorId);
  });
});
