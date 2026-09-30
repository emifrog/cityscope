/**
 * Sprint 1 — document upload chain through the real stack:
 * API (declaration) -> signed upload to quarantine -> confirmation -> worker
 * verification (size, SHA-256, real type) -> short-lived download, audited.
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
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { HandlerRegistry, assetVerificationHandler, createWorker, noopHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, TENANT_83, requireEnv, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-worker',
});
const adminPool = createPool({
  connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL'),
  applicationName: 'integration-admin',
});
afterAll(async () => {
  await Promise.all([workerPool.end(), adminPool.end()]);
});

const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');
const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);

const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-documents'),
  registry: new HandlerRegistry([
    noopHandler,
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects: SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY')),
      scanner: antivirusNotConfigured,
      sha256: async (content) => sha256(content),
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 10,
  leaseSeconds: 30,
  pollIntervalMs: 100,
});

type Call = (method: string, path: string, body?: unknown) => Promise<Response>;
const as =
  (token: string, tenant: string): Call =>
  async (method, path, body) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': tenant,
        'x-client-platform': 'web',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

let editor06: Call;
let reader06: Call;
let editor83: Call;

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

async function declareAndUpload(content: Uint8Array, declaredSha = sha256(content)) {
  const response = await editor06('POST', `/sites/${EHPAD_ID}/documents`, {
    title: `Consignes de sécurité (test ${Date.now()})`,
    category: 'instruction',
    file: {
      filename: 'consignes.pdf',
      mime_type: 'application/pdf',
      size_bytes: content.byteLength,
      sha256: declaredSha,
    },
  });
  expect(response.status).toBe(201);
  const created = endpoints.createDocument.response.parse(await response.json());
  const upload = await fetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: content });
  expect(upload.ok, await upload.clone().text()).toBe(true);
  return created;
}

async function assetStatus(documentId: string) {
  const list = endpoints.listDocuments.response.parse(
    await (await editor06('GET', `/sites/${EHPAD_ID}/documents`)).json(),
  );
  return list.items.find((document) => document.id === documentId)?.versions[0]?.asset;
}

describe('document upload chain', () => {
  it('verifies a conforming file and serves it through a short-lived, audited URL', async () => {
    const content = pdf('conforme');
    const created = await declareAndUpload(content);
    const assetId = created.upload.asset_id;
    expect(created.document.versions[0]?.asset.scan_status).toBe('pending');

    // Not downloadable before verification.
    expect((await editor06('GET', `/assets/${assetId}/download`)).status).toBe(409);

    const confirmed = await editor06('POST', `/assets/${assetId}/uploaded`);
    expect(confirmed.status).toBe(202);
    expect(endpoints.confirmUpload.response.parse(await confirmed.json()).job_id).not.toBeNull();

    await worker.runOnce();
    expect((await assetStatus(created.document.id))?.scan_status).toBe('clean');

    const download = await reader06('GET', `/assets/${assetId}/download`);
    expect(download.status).toBe(200);
    const ticket = endpoints.getAssetDownload.response.parse(await download.json());
    const file = new Uint8Array(await (await fetch(ticket.url)).arrayBuffer());
    expect(sha256(file)).toBe(sha256(content));

    const { rows } = await adminPool.query<{ n: number }>(
      `select count(*)::int as n from app.audit_event e join app.user_account u on u.id = e.actor_user_id
       where e.action = 'asset.download' and e.entity_id = $1 and u.email = 'lecteur06@demo.etare.test'`,
      [assetId],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('rejects a file whose content differs from the declaration', async () => {
    const created = await declareAndUpload(pdf('altéré'), sha256(pdf('déclaré')));
    await editor06('POST', `/assets/${created.upload.asset_id}/uploaded`);
    await worker.runOnce();
    const asset = await assetStatus(created.document.id);
    expect(asset).toMatchObject({ scan_status: 'rejected', rejection_reason: 'SHA256_MISMATCH' });
    expect((await editor06('GET', `/assets/${created.upload.asset_id}/download`)).status).toBe(409);
  });

  it('refuses undeclared types and unsafe names before any upload', async () => {
    const base = { title: 'Refusé', category: 'other' };
    const exe = await editor06('POST', `/sites/${EHPAD_ID}/documents`, {
      ...base,
      file: { filename: 'outil.exe', mime_type: 'application/x-msdownload', size_bytes: 10, sha256: 'a'.repeat(64) },
    });
    expect(exe.status).toBe(400);
    const traversal = await editor06('POST', `/sites/${EHPAD_ID}/documents`, {
      ...base,
      file: { filename: '../../plan.pdf', mime_type: 'application/pdf', size_bytes: 10, sha256: 'a'.repeat(64) },
    });
    expect(traversal.status).toBe(400);
  });

  it('keeps files inside their SIS and writes to editors', async () => {
    const created = await declareAndUpload(pdf('isolement'));
    const assetId = created.upload.asset_id;
    expect((await editor83('POST', `/assets/${assetId}/uploaded`)).status).toBe(404);
    expect((await editor83('GET', `/assets/${assetId}/download`)).status).toBe(404);
    expect((await editor83('GET', `/sites/${EHPAD_ID}/documents`)).status).toBe(404);
    expect((await reader06('POST', `/assets/${assetId}/uploaded`)).status).toBe(403);
  });
});
