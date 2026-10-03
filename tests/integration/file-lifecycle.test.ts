/**
 * Sprint 9 — CAP-03 through the real stack: reduced images computed by the worker
 * after the verdict and served instead of the original in lists; the hourly
 * maintenance removes the quarantine of abandoned or rejected uploads and the PDF
 * of losing build attempts, audits each removal, and never touches a kept file.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  PostgresAssetVariantStore,
  PostgresAssetVerificationStore,
  PostgresFileMaintenanceStore,
  PostgresJobQueue,
  SharpImageResizer,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { antivirusNotConfigured, maintenanceSlot, runFileMaintenance } from '@etare/application';
import { API_BASE_PATH, endpoints, type ObjectPhotoUpload } from '@etare/contracts';
import { HandlerRegistry, assetVariantsHandler, assetVerificationHandler, createWorker } from '@etare/worker';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, drain, requireEnv, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-files',
});
const admin = new pg.Client({ connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL') });
const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
const maintenance = new PostgresFileMaintenanceStore(workerPool);
const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');

const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-files'),
  registry: new HandlerRegistry([
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects,
      scanner: antivirusNotConfigured,
      sha256: async (content) => sha256(content),
    }),
    assetVariantsHandler({
      store: new PostgresAssetVariantStore(workerPool),
      objects,
      images: new SharpImageResizer(),
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 4,
  leaseSeconds: 30,
  pollIntervalMs: 100,
});

let editor: (method: string, path: string, body?: unknown) => Promise<Response>;
let objectId = '';

beforeAll(async () => {
  await admin.connect();
  const token = await signIn('redacteur06@demo.etare.test');
  editor = async (method, path, body) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': TENANT_06,
        'x-client-platform': 'web',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const site = await editor('POST', '/sites', {
    name: `Site fichiers ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { city: 'Nice', postal_code: '06000' },
    location: { type: 'Point', coordinates: [7.26, 43.7] },
  });
  const siteId = ((await site.json()) as { id: string }).id;
  const types = endpoints.listObjectTypes.response.parse(await (await editor('GET', '/object-types')).json()).items;
  const created = await editor('POST', `/sites/${siteId}/objects`, {
    object_type_id: types.find((type) => type.code === 'PEI')?.id,
    label: 'PEI',
    geometry: { type: 'Point', coordinates: [7.2601, 43.7001] },
  });
  objectId = endpoints.createSiteObject.response.parse(await created.json()).id;
});

afterAll(async () => {
  await admin.end();
  await workerPool.end();
});

async function declarePhoto(content: Uint8Array): Promise<ObjectPhotoUpload> {
  const response = await editor('POST', `/objects/${objectId}/photos`, {
    file: { filename: 'poteau.jpg', mime_type: 'image/jpeg', size_bytes: content.byteLength, sha256: sha256(content) },
  });
  expect(response.status).toBe(201);
  return endpoints.createObjectPhoto.response.parse(await response.json());
}

async function send(created: ObjectPhotoUpload, content: Uint8Array) {
  const sent = await fetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: content });
  expect(sent.ok).toBe(true);
}

const download = async (assetId: string, variant: string) =>
  endpoints.getAssetDownload.response.parse(
    await (await editor('GET', `/assets/${assetId}/download?variant=${variant}`)).json(),
  );

describe('reduced images', () => {
  it('are computed after the verdict and served in the lists', async () => {
    const photo = new Uint8Array(
      await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#c84300' } })
        .jpeg()
        .toBuffer(),
    );
    const created = await declarePhoto(photo);
    // Before the verdict, nothing is served; once clean but not reduced, the original replaces it.
    await send(created, photo);
    expect((await editor('POST', `/assets/${created.upload.asset_id}/uploaded`)).status).toBe(202);
    await drain(worker);

    const thumbnail = await download(created.upload.asset_id, 'thumbnail');
    expect(thumbnail).toMatchObject({ variant: 'thumbnail', mime_type: 'image/webp' });
    const bytes = new Uint8Array(await (await fetch(thumbnail.url)).arrayBuffer());
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'webp', width: 320, height: 213 });
    expect(await download(created.upload.asset_id, 'preview')).toMatchObject({ variant: 'preview' });
    expect(await download(created.upload.asset_id, 'original')).toMatchObject({
      variant: 'original',
      mime_type: 'image/jpeg',
    });
  });
});

describe('maintenance of the files', () => {
  it('rejects an upload abandoned for a day and removes its quarantine object', async () => {
    const content = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(randomUUID())]);
    const created = await declarePhoto(content);
    await send(created, content); // sent, but never confirmed
    // Ageing the declaration (created_at is protected by a trigger, lifted for this test only).
    await admin.query('begin');
    await admin.query('alter table app.asset disable trigger touch_row');
    await admin.query(`update app.asset set created_at = now() - interval '25 hours' where id = $1`, [
      created.upload.asset_id,
    ]);
    await admin.query('alter table app.asset enable trigger touch_row');
    await admin.query('commit');
    const { rows } = await admin.query<{ quarantine_key: string }>(
      'select quarantine_key from app.asset where id = $1',
      [created.upload.asset_id],
    );
    const quarantineKey = rows[0]?.quarantine_key ?? '';
    expect(await objects.download(quarantineKey)).not.toBeNull();

    const report = await runFileMaintenance(maintenance, objects);
    expect(report.quarantineReleased).toBeGreaterThanOrEqual(1);
    expect(await objects.download(quarantineKey)).toBeNull();
    const after = await admin.query<{ scan_status: string; reason: string; quarantine_key: string | null }>(
      `select scan_status, scan_detail ->> 'reason' as reason, quarantine_key from app.asset where id = $1`,
      [created.upload.asset_id],
    );
    expect(after.rows[0]).toEqual({ scan_status: 'rejected', reason: 'ABANDONED', quarantine_key: null });
    const audit = await admin.query(
      `select 1 from app.audit_event where action = 'asset.quarantine_purge' and entity_id = $1 and actor_type = 'worker'`,
      [created.upload.asset_id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('rejects an asset whose verification was abandoned by the queue', async () => {
    const content = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(randomUUID())]);
    const created = await declarePhoto(content);
    expect((await editor('POST', `/assets/${created.upload.asset_id}/uploaded`)).status).toBe(202);
    await admin.query(
      `update app.job set status = 'dead', attempts = max_attempts, last_error_code = 'UPLOAD_NOT_RECEIVED'
       where job_type = 'asset.verify' and payload ->> 'asset_id' = $1`,
      [created.upload.asset_id],
    );
    const { rows } = await admin.query<{ scan_status: string; reason: string }>(
      `select scan_status, scan_detail ->> 'reason' as reason from app.asset where id = $1`,
      [created.upload.asset_id],
    );
    expect(rows[0]).toEqual({ scan_status: 'rejected', reason: 'VERIFICATION_FAILED' });
  });

  it('removes the PDF of a losing build attempt, never the kept one', async () => {
    const { rows } = await admin.query<{ id: string; tenant_id: string; pdf_storage_key: string | null }>(
      `select id, tenant_id, pdf_storage_key from app.publication where status = 'published' order by created_at limit 1`,
    );
    const publication = rows[0];
    if (!publication) throw new Error('A published publication is expected in the demo data.');
    const losing = `tenants/${publication.tenant_id}/publications/${publication.id}/etare-${sha256(new TextEncoder().encode(randomUUID()))}.pdf`;
    await objects.upload(losing, new TextEncoder().encode('%PDF-1.7 perdant'), 'application/pdf', { upsert: true });
    for (const key of [losing, publication.pdf_storage_key].filter((value): value is string => Boolean(value))) {
      await admin.query(
        `insert into app.publication_output (tenant_id, publication_id, storage_key, created_at)
         values ($1, $2, $3, now() - interval '2 hours')
         on conflict (storage_key) do update set created_at = excluded.created_at, removed_at = null`,
        [publication.tenant_id, publication.id, key],
      );
    }

    const candidates = await maintenance.publicationOutputsToPurge(500);
    expect(candidates.map((candidate) => candidate.storageKey)).toContain(losing);
    expect(candidates.map((candidate) => candidate.storageKey)).not.toContain(publication.pdf_storage_key);
    await runFileMaintenance(maintenance, objects);
    expect(await objects.download(losing)).toBeNull();
    if (publication.pdf_storage_key) expect(await objects.download(publication.pdf_storage_key)).not.toBeNull();
    const audit = await admin.query(
      `select 1 from app.audit_event where action = 'publication.output_purge' and metadata ->> 'storage_key' = $1`,
      [losing],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('is planned once per hour, whatever the number of workers', async () => {
    const slot = maintenanceSlot(new Date(Date.UTC(2030, 0, 1, Math.floor(Math.random() * 24))));
    await maintenance.schedule(slot);
    await maintenance.schedule(slot);
    const { rows } = await admin.query<{ count: string }>(
      `select count(*) from app.job where job_type = 'maintenance.files' and idempotency_key = $1`,
      [`maintenance.files:${slot}`],
    );
    expect(rows[0]?.count).toBe('1');
    await admin.query(`update app.job set status = 'succeeded', completed_at = now() where idempotency_key = $1`, [
      `maintenance.files:${slot}`,
    ]);
  });
});
