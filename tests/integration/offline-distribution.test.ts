/**
 * Sprint 4 — offline distribution through the real stack (OFF-01 to OFF-04,
 * ADMIN-02): a terminal declared by the administration, enrolled with its own
 * key, then served a signed catalogue, a signed package and its files (data,
 * PDF, checked photos), with installation receipts and revocation. Runs on a
 * site published for the test.
 */
import { createHash } from 'node:crypto';
import {
  Ed25519Signer,
  PdfLibEtareRenderer,
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  SupabaseObjectStorage,
  createLogger,
  createPool,
  verifyEd25519,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { antivirusNotConfigured } from '@etare/application';
import {
  API_BASE_PATH,
  endpoints,
  publicationManifestSchema,
  syncCatalogSchema,
  type EtareRevision,
} from '@etare/contracts';
import { isAppVersionBelow, signedText } from '@etare/domain';
import { HandlerRegistry, assetVerificationHandler, createWorker, publicationBuildHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, TENANT_83, authApi, requireEnv, signIn, withSecondFactor } from './helpers';
import { Terminal } from './terminal';

const app = createApiApp(createApiDependencies(process.env));
const catalogKey = Ed25519Signer.fromPkcs8(requireEnv('CATALOG_SIGNING_KEY'));
const publicationKey = Ed25519Signer.fromPkcs8(requireEnv('PUBLICATION_SIGNING_KEY'));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-distribution',
});

const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-distribution'),
  registry: new HandlerRegistry([
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects,
      scanner: antivirusNotConfigured,
      sha256,
    }),
    publicationBuildHandler({
      store: new PostgresPublicationBuildStore(workerPool),
      tools: {
        sha256,
        byteLength: (text) => Buffer.byteLength(text, 'utf8'),
        now: () => new Date(),
        signer: publicationKey,
      },
      artifacts: {
        renderer: new PdfLibEtareRenderer(),
        objects,
        sha256Bytes: sha256,
      },
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 2,
  leaseSeconds: 30,
  pollIntervalMs: 100,
});

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

const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

let admin06: Call;
let ops06: Call;
let opsToken = '';
let editor83Token = '';
let adminFactor: { token: string; factorId: string } | undefined;
let validatorFactor: { token: string; factorId: string } | undefined;
let siteId = '';
let publicationId = '';
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(`photo ${Date.now()}`)]);

beforeAll(async () => {
  const [editor, validator, adminToken, ops, editor83] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  opsToken = ops;
  editor83Token = editor83;
  ops06 = as(ops, TENANT_06);
  adminFactor = await withSecondFactor(adminToken);
  admin06 = as(adminFactor.token, TENANT_06);
  validatorFactor = await withSecondFactor(validator);
  const editor06 = as(editor, TENANT_06);
  const validator06 = as(validatorFactor.token, TENANT_06);

  // A site published for the test, with its PDF: the content a terminal installs.
  const created = await editor06('POST', '/sites', {
    name: `Site hors ligne ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { city: 'Nice', postal_code: '06000' },
    location: { type: 'Point', coordinates: [7.27, 43.71] },
  });
  expect(created.status).toBe(201);
  siteId = ((await created.json()) as { id: string }).id;
  // A hydrant with a checked photo (PLAN-05): the image travels with the package.
  const types = endpoints.listObjectTypes.response.parse(await (await editor06('GET', '/object-types')).json()).items;
  const hydrant = endpoints.createSiteObject.response.parse(
    await (
      await editor06('POST', `/sites/${siteId}/objects`, {
        object_type_id: types.find((type) => type.code === 'PEI')?.id,
        label: 'PEI 1',
        geometry: { type: 'Point', coordinates: [7.2701, 43.7101] },
      })
    ).json(),
  );
  const declared = endpoints.createObjectPhoto.response.parse(
    await (
      await editor06('POST', `/objects/${hydrant.id}/photos`, {
        caption: 'Poteau',
        file: {
          filename: 'pei.jpg',
          mime_type: 'image/jpeg',
          size_bytes: photo.byteLength,
          sha256: await sha256(photo),
        },
      })
    ).json(),
  );
  await fetch(declared.upload.url, { method: 'PUT', headers: declared.upload.headers, body: photo });
  await editor06('POST', `/assets/${declared.upload.asset_id}/uploaded`);
  await worker.runOnce();
  const draft = endpoints.createRevision.response.parse(
    await (await editor06('POST', `/sites/${siteId}/etare/revisions`, { change_summary: 'Hors ligne' })).json(),
  );
  const submitted: EtareRevision = endpoints.submitRevision.response.parse(
    await (
      await editor06('POST', `/etare-revisions/${draft.id}/submit`, { change_summary: 'Hors ligne' }, draft.row_version)
    ).json(),
  );
  const decided = await validator06('POST', `/etare-revisions/${draft.id}/decision`, {
    decision: 'approved',
    revision_hash: submitted.content_hash,
    publish: true,
  });
  expect(decided.status).toBe(200);
  await worker.runOnce();
  const overview = endpoints.getSiteEtare.response.parse(
    await (await editor06('GET', `/sites/${siteId}/etare`)).json(),
  );
  expect(overview.publications[0]?.status).toBe('published');
  publicationId = overview.publications[0]?.id ?? '';
});

afterAll(async () => {
  for (const factor of [adminFactor, validatorFactor]) {
    if (factor) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  }
  await workerPool.end();
});

describe('offline distribution', () => {
  const terminal = () => new Terminal(app, opsToken, TENANT_06);
  let device: Terminal;
  let enrollmentCode = '';

  it('lets an administrator with a second factor declare a terminal and get a one-time code', async () => {
    expect(await codeOf(await ops06('POST', '/devices', { name: 'Interdit' }))).toBe('FORBIDDEN');
    const response = await admin06('POST', '/devices', { name: `TABLETTE INTEGRATION ${Date.now()}` });
    expect(response.status).toBe(201);
    const created = endpoints.createDevice.response.parse(await response.json());
    expect(created.enrollment_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(created.device).toMatchObject({ status: 'pending', state: 'pending' });
    enrollmentCode = created.enrollment_code;
  });

  it('enrolls the terminal of a field user who proves its key, once', async () => {
    device = terminal();
    const enroll = (code: string, publicKey = device.publicKey) =>
      ops06('POST', '/sync/enrollment', device.enrollment(code, publicKey));
    // The proof must come from the private key of the public key sent.
    expect(await codeOf(await enroll(enrollmentCode, terminal().publicKey))).toBe('DEVICE_PROOF_INVALID');
    const enrolled = await enroll(enrollmentCode.toLowerCase());
    expect(enrolled.status).toBe(201);
    const body = endpoints.enrollDevice.response.parse(await enrolled.json());
    expect(body).toMatchObject({ tenant_id: TENANT_06, tenant_name: 'SDIS DEMO 06' });
    device.deviceId = body.device_id;
    expect(await codeOf(await enroll(enrollmentCode))).toBe('VALIDATION_FAILED');
  });

  it('serves a catalogue signed with the catalogue key, listing the signed publications', async () => {
    const response = await device.request('GET', '/sync/catalog');
    expect(response.status).toBe(200);
    const signed = endpoints.getSyncCatalog.response.parse(await response.json());
    expect(signed.signature.key_id).toBe(catalogKey.keyId);
    expect(
      verifyEd25519(catalogKey.publicKey, signedText('etare.catalog.v1', signed.catalog), signed.signature.signature),
    ).toBe(true);
    const catalog = syncCatalogSchema.parse(JSON.parse(signed.catalog));
    expect(catalog).toMatchObject({ tenant_id: TENANT_06, device_id: device.deviceId });
    expect(new Date(catalog.authorization.expires_at).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    const entry = catalog.publications.find((item) => item.publication_id === publicationId);
    expect(entry).toMatchObject({ site_id: siteId, publication_number: 1 });
    // Only signed versions are distributed: the demo publication of the seed is not.
    expect(catalog.publications.map((item) => item.publication_id)).not.toContain(
      '0600000f-0000-4000-8000-000000000001',
    );
  });

  it('serves the package as built: manifest signed by the worker, data and files checked by hash', async () => {
    const catalog = syncCatalogSchema.parse(
      JSON.parse(
        endpoints.getSyncCatalog.response.parse(await (await device.request('GET', '/sync/catalog')).json()).catalog,
      ),
    );
    const entry = catalog.publications.find((item) => item.publication_id === publicationId);
    const response = await device.request('GET', `/sync/publications/${publicationId}`);
    expect(response.status).toBe(200);
    const pkg = endpoints.getSyncPackage.response.parse(await response.json());
    expect(pkg.signature.key_id).toBe(publicationKey.keyId);
    expect(
      verifyEd25519(publicationKey.publicKey, signedText('etare.manifest.v1', pkg.manifest), pkg.signature.signature),
    ).toBe(true);
    expect(await sha256(pkg.manifest)).toBe(entry?.manifest_hash);
    const manifest = publicationManifestSchema.parse(JSON.parse(pkg.manifest));
    expect(manifest).toMatchObject({ tenant_id: TENANT_06, site_id: siteId, publication_id: publicationId });
    const dataFile = manifest.files.find((file) => file.path === manifest.data_file);
    expect(await sha256(pkg.data)).toBe(dataFile?.sha256);
    expect(Buffer.byteLength(pkg.data, 'utf8')).toBe(dataFile?.size_bytes);

    const pdf = manifest.files.find((file) => file.path === 'etare.pdf');
    const image = manifest.files.find((file) => file.path.startsWith('photos/'));
    expect(image).toMatchObject({ sha256: await sha256(photo), media_type: 'image/jpeg', required: true });
    const downloads = await device.request('POST', `/sync/publications/${publicationId}/downloads`, {
      sha256: [pdf?.sha256, image?.sha256, dataFile?.sha256, 'f'.repeat(64)],
    });
    expect(downloads.status).toBe(200);
    const { files } = endpoints.createSyncDownloads.response.parse(await downloads.json());
    // Only files of the package stored in object storage: never the data file nor an unknown hash.
    expect(files.map((file) => file.sha256).sort()).toEqual([pdf?.sha256, image?.sha256].sort());
    for (const expected of [pdf, image]) {
      const url = files.find((file) => file.sha256 === expected?.sha256)?.url ?? '';
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      expect(await sha256(bytes)).toBe(expected?.sha256);
      expect(bytes.byteLength).toBe(expected?.size_bytes);
    }
  });

  it('records the installation receipt shown to the administration', async () => {
    const catalog = syncCatalogSchema.parse(
      JSON.parse(
        endpoints.getSyncCatalog.response.parse(await (await device.request('GET', '/sync/catalog')).json()).catalog,
      ),
    );
    const receipt = await device.request('POST', '/sync/receipts', {
      generation: catalog.generation,
      status: 'installed',
      error_code: null,
      installed: catalog.publications.map((item) => item.publication_id),
    });
    expect(receipt.status).toBe(200);
    expect(endpoints.recordSyncReceipt.response.parse(await receipt.json()).installed_sites).toBe(
      catalog.publications.length,
    );
    const list = endpoints.listDevices.response.parse(await (await admin06('GET', '/devices')).json());
    expect(list.items.find((item) => item.id === device.deviceId)).toMatchObject({
      status: 'active',
      state: 'up_to_date',
      platform: 'android',
      app_version: '1.0.0',
      installed_generation: catalog.generation,
      installed_sites: catalog.publications.length,
      last_user_name: 'Intervenant OPS 06 (démo)',
    });
    expect(list.undistributed_publications).toBeGreaterThanOrEqual(0);
  });

  it('announces a minimum application version in the signed catalogue and to the administration (SYN-02)', async () => {
    const strict = createApiApp(createApiDependencies({ ...process.env, MOBILE_MIN_APP_VERSION: '9.0.0' }));
    const signed = endpoints.getSyncCatalog.response.parse(
      await (await device.request('GET', '/sync/catalog', undefined, { app: strict })).json(),
    );
    expect(
      verifyEd25519(catalogKey.publicKey, signedText('etare.catalog.v1', signed.catalog), signed.signature.signature),
    ).toBe(true);
    expect(syncCatalogSchema.parse(JSON.parse(signed.catalog)).min_app_version).toBe('9.0.0');
    const listed = await strict.request(`${API_BASE_PATH}/devices`, {
      headers: {
        authorization: `Bearer ${adminFactor?.token ?? ''}`,
        'x-tenant-id': TENANT_06,
        'x-client-platform': 'web',
      },
    });
    const list = endpoints.listDevices.response.parse(await listed.json());
    expect(list.min_app_version).toBe('9.0.0');
    const item = list.items.find((entry) => entry.id === device.deviceId);
    expect(isAppVersionBelow(item?.app_version ?? null, list.min_app_version)).toBe(true);
  });

  it('refuses requests not signed by the terminal for this very path, or from another SIS', async () => {
    const replayed = await device.request('GET', `/sync/publications/${publicationId}`, undefined, {
      signedPath: '/sync/catalog',
    });
    expect(await codeOf(replayed)).toBe('DEVICE_PROOF_INVALID');
    const stranger = new Terminal(app, opsToken, TENANT_06);
    stranger.deviceId = device.deviceId;
    expect(await codeOf(await stranger.request('GET', '/sync/catalog'))).toBe('DEVICE_PROOF_INVALID');
    // Same terminal presented in another SIS: unknown there.
    const elsewhere = new Terminal(app, editor83Token, TENANT_83);
    elsewhere.deviceId = device.deviceId;
    expect(await codeOf(await elsewhere.request('GET', '/sync/catalog'))).toBe('DEVICE_NOT_ENROLLED');
    expect((await admin06('GET', '/devices')).status).toBe(200);
    expect(await codeOf(await as(editor83Token, TENANT_83)('GET', '/devices'))).toBe('FORBIDDEN');
  });

  it('refuses a revoked terminal at once (the application then purges its data)', async () => {
    const list = endpoints.listDevices.response.parse(await (await admin06('GET', '/devices')).json());
    const current = list.items.find((item) => item.id === device.deviceId);
    const revoked = await admin06(
      'POST',
      `/devices/${device.deviceId}/revocation`,
      { reason: 'Tablette perdue (test)' },
      current?.row_version,
    );
    expect(revoked.status).toBe(200);
    expect(endpoints.revokeDevice.response.parse(await revoked.json())).toMatchObject({
      status: 'revoked',
      state: 'revoked',
    });
    const refused = await device.request('GET', '/sync/catalog');
    expect(refused.status).toBe(403);
    expect(await codeOf(refused)).toBe('DEVICE_REVOKED');
  });
});
