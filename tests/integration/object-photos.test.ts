/**
 * Sprint 4 — photos of operational objects through the real stack (PLAN-05):
 * declaration, signed upload to quarantine, verification by the worker, then
 * the photo travels with the snapshot once checked; archived rather than deleted.
 */
import { createHash } from 'node:crypto';
import {
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { antivirusNotConfigured } from '@etare/application';
import { API_BASE_PATH, endpoints, type ObjectPhotoUpload } from '@etare/contracts';
import { HandlerRegistry, assetVerificationHandler, createWorker } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, TENANT_83, requireEnv, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-photos',
});
afterAll(async () => {
  await workerPool.end();
});

const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');
/** A JPEG as the worker recognizes it (magic bytes), with distinct content per call. */
const jpeg = (text: string) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(text)]);

const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-photos'),
  registry: new HandlerRegistry([
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects: SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY')),
      scanner: antivirusNotConfigured,
      sha256: async (content) => sha256(content),
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 4,
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

let editor06: Call;
let reader06: Call;
let editor83: Call;
let siteId = '';
let objectId = '';

beforeAll(async () => {
  const [editor, reader, other] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('lecteur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  reader06 = as(reader, TENANT_06);
  editor83 = as(other, TENANT_83);

  const created = await editor06('POST', '/sites', {
    name: `Site photos ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { city: 'Nice', postal_code: '06000' },
    location: { type: 'Point', coordinates: [7.26, 43.7] },
  });
  expect(created.status).toBe(201);
  siteId = ((await created.json()) as { id: string }).id;
  const types = endpoints.listObjectTypes.response.parse(await (await editor06('GET', '/object-types')).json()).items;
  const hydrant = await editor06('POST', `/sites/${siteId}/objects`, {
    object_type_id: types.find((type) => type.code === 'PEI')?.id,
    label: 'PEI photographié',
    geometry: { type: 'Point', coordinates: [7.2601, 43.7001] },
  });
  expect(hydrant.status).toBe(201);
  objectId = endpoints.createSiteObject.response.parse(await hydrant.json()).id;
});

async function declarePhoto(content: Uint8Array, caption?: string): Promise<ObjectPhotoUpload> {
  const response = await editor06('POST', `/objects/${objectId}/photos`, {
    ...(caption === undefined ? {} : { caption }),
    file: { filename: 'poteau.jpg', mime_type: 'image/jpeg', size_bytes: content.byteLength, sha256: sha256(content) },
  });
  expect(response.status).toBe(201);
  return endpoints.createObjectPhoto.response.parse(await response.json());
}

async function upload(created: ObjectPhotoUpload, content: Uint8Array) {
  const sent = await fetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: content });
  expect(sent.ok, await sent.clone().text()).toBe(true);
  expect((await editor06('POST', `/assets/${created.upload.asset_id}/uploaded`)).status).toBe(202);
  await worker.runOnce();
}

const preview = async () =>
  endpoints.previewSiteEtare.response.parse(await (await reader06('GET', `/sites/${siteId}/etare/preview`)).json());

const objectOf = async () => {
  const { items } = endpoints.listSiteObjects.response.parse(
    await (await reader06('GET', `/sites/${siteId}/objects`)).json(),
  );
  return items.find((object) => object.id === objectId);
};

describe('object photos', () => {
  it('holds back a photo until the worker has checked it', async () => {
    const content = jpeg(`poteau ${Date.now()}`);
    const created = await declarePhoto(content, 'Accès au poteau');
    expect(created.photo).toMatchObject({ caption: 'Accès au poteau', status: 'active', sort_order: 0 });
    expect(created.photo.asset.scan_status).toBe('pending');
    // Declared but not yet checked: the dossier cannot be submitted, the snapshot ignores it.
    const before = await preview();
    expect(before.checks.find((check) => check.code === 'photos')?.level).toBe('error');
    expect(before.snapshot.objects.find((object) => object.id === objectId)).not.toHaveProperty('photos');

    await upload(created, content);
    expect((await objectOf())?.photos.map((photo) => [photo.id, photo.asset.scan_status])).toEqual([
      [created.photo.id, 'clean'],
    ]);
    const after = await preview();
    expect(after.checks.find((check) => check.code === 'photos')).toMatchObject({
      level: 'ok',
      detail: '1 photo prête.',
    });
    expect(after.snapshot.objects.find((object) => object.id === objectId)?.photos).toEqual([
      {
        id: created.photo.id,
        caption: 'Accès au poteau',
        asset: {
          id: created.upload.asset_id,
          filename: 'poteau.jpg',
          mime_type: 'image/jpeg',
          size_bytes: content.byteLength,
          sha256: sha256(content),
        },
      },
    ]);
    // A checked photo is served like any file of the site, to its readers.
    expect((await reader06('GET', `/assets/${created.upload.asset_id}/download`)).status).toBe(200);
  });

  it('refuses a file that is not an image, a reader, and another SIS', async () => {
    const pdf = await editor06('POST', `/objects/${objectId}/photos`, {
      file: { filename: 'plan.pdf', mime_type: 'application/pdf', size_bytes: 10, sha256: 'a'.repeat(64) },
    });
    expect(await codeOf(pdf)).toBe('VALIDATION_FAILED');
    const file = { filename: 'x.jpg', mime_type: 'image/jpeg', size_bytes: 10, sha256: 'b'.repeat(64) };
    expect(await codeOf(await reader06('POST', `/objects/${objectId}/photos`, { file }))).toBe('FORBIDDEN');
    expect((await editor83('POST', `/objects/${objectId}/photos`, { file })).status).toBe(404);
  });

  it('corrects a caption with optimistic concurrency, then archives the photo for good', async () => {
    const content = jpeg(`vanne ${Date.now()}`);
    const created = await declarePhoto(content);
    await upload(created, content);
    expect(created.photo).toMatchObject({ caption: null, sort_order: 1 });

    const path = `/object-photos/${created.photo.id}`;
    const renamed = await editor06('PATCH', path, { caption: 'Vanne de barrage' }, created.photo.row_version);
    expect(renamed.status).toBe(200);
    const photo = endpoints.updateObjectPhoto.response.parse(await renamed.json());
    expect(photo).toMatchObject({ caption: 'Vanne de barrage', row_version: created.photo.row_version + 1 });
    expect((await editor06('PATCH', path, { caption: 'Trop tard' }, created.photo.row_version)).status).toBe(412);

    const archived = await editor06('PATCH', path, { status: 'archived' }, photo.row_version);
    expect(archived.status).toBe(200);
    expect((await objectOf())?.photos.map((item) => item.id)).not.toContain(created.photo.id);
    expect((await preview()).checks.find((check) => check.code === 'photos')?.detail).toBe('1 photo prête.');
  });
});
