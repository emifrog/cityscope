/**
 * SEC-01 — the upload chain with a real ClamAV daemon (clamd, INSTREAM).
 * Runs when ANTIVIRUS_URL is set (CI service container, or a local
 * `docker run -p 3311:3310 clamav/clamav:stable` with
 * ANTIVIRUS_URL=tcp://127.0.0.1:3311); skipped otherwise.
 */
import { createHash } from 'node:crypto';
import {
  ClamAvScanner,
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  SupabaseObjectStorage,
  createLogger,
  createPool,
  parseClamAvUrl,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { HandlerRegistry, assetVerificationHandler, createWorker } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, drain, requireEnv, signIn } from './helpers';

const antivirusUrl = process.env['ANTIVIRUS_URL'];

describe.skipIf(!antivirusUrl)('antivirus (ClamAV)', () => {
  const scanner = new ClamAvScanner(parseClamAvUrl(antivirusUrl ?? 'tcp://127.0.0.1:3310'));
  const app = createApiApp(createApiDependencies(process.env));
  const workerPool = createPool({
    connectionString: requireEnv('WORKER_DATABASE_URL'),
    applicationName: 'integration-av',
  });
  const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');
  const worker = createWorker({
    queue: new PostgresJobQueue(workerPool, 'integration-av'),
    registry: new HandlerRegistry([
      assetVerificationHandler({
        store: new PostgresAssetVerificationStore(workerPool),
        objects: SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY')),
        scanner,
        sha256: async (content) => sha256(content),
      }),
    ]),
    logger: createLogger({}, { write: () => undefined }),
    concurrency: 2,
    leaseSeconds: 60,
    pollIntervalMs: 100,
  });
  let token = '';

  beforeAll(async () => {
    token = await signIn('redacteur06@demo.etare.test');
  });
  afterAll(async () => {
    await workerPool.end();
  });

  it('detects the EICAR test file', async () => {
    // Built at run time: no file of the repository contains the test string.
    const eicar = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS', '-TEST-FILE!$H+H*'].join('');
    const verdict = await scanner.scan(new TextEncoder().encode(eicar));
    expect(verdict).toMatchObject({ verdict: 'infected', engine: 'clamav' });
    expect(verdict.signature).toMatch(/eicar/i);
  });

  it('admits a clean upload only after ClamAV has checked it', async () => {
    const content = new TextEncoder().encode(`%PDF-1.4\n% consignes ${Date.now()}\n%%EOF\n`);
    const response = await app.request(`${API_BASE_PATH}/sites/${EHPAD_ID}/documents`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': TENANT_06,
        'x-client-platform': 'web',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: `Consignes contrôlées (antivirus ${Date.now()})`,
        category: 'instruction',
        file: {
          filename: 'consignes.pdf',
          mime_type: 'application/pdf',
          size_bytes: content.byteLength,
          sha256: sha256(content),
        },
      }),
    });
    expect(response.status).toBe(201);
    const created = endpoints.createDocument.response.parse(await response.json());
    const sent = await fetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: content });
    expect(sent.ok).toBe(true);
    const confirmed = await app.request(`${API_BASE_PATH}/assets/${created.upload.asset_id}/uploaded`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': TENANT_06, 'x-client-platform': 'web' },
    });
    expect(confirmed.status).toBe(202);
    // The whole queue: a job left by an earlier test file may come first.
    await drain(worker);

    const admin = createPool({
      connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL'),
      applicationName: 'integration-av-check',
    });
    try {
      const { rows } = await admin.query<{ scan_status: string; scan_detail: Record<string, unknown> }>(
        'select scan_status, scan_detail from app.asset where id = $1',
        [created.upload.asset_id],
      );
      expect(rows[0]).toMatchObject({ scan_status: 'clean', scan_detail: { antivirus: 'clean', engine: 'clamav' } });
    } finally {
      await admin.end();
    }
  });
});
