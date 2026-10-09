/**
 * Sprint 14 — reversibility export of a SIS (ADMIN-04, ADR-033) through the real stack: the
 * administrator with their second factor asks for it, the worker builds the parts in the object
 * storage, the administration downloads them through signed URLs, every step is audited; the
 * reader and the administrator without second factor are refused.
 */
import { createHash } from 'node:crypto';
import { FflateArchiveBuilder } from '@etare/adapters/export';
import { createLogger } from '@etare/adapters/logging';
import { PostgresExportBuildStore, PostgresJobQueue, createPool } from '@etare/adapters/postgres';
import { SupabaseObjectStorage } from '@etare/adapters/storage';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { HandlerRegistry, createWorker, exportBuildHandler, noopHandler } from '@etare/worker';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, drain, requireEnv, signIn, withSecondFactor } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-exports',
});
const sha256 = async (content: Uint8Array) => createHash('sha256').update(content).digest('hex');
const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-exports'),
  registry: new HandlerRegistry([
    noopHandler,
    exportBuildHandler({
      store: new PostgresExportBuildStore(workerPool),
      objects,
      archives: () => new FflateArchiveBuilder(),
      sha256,
      now: () => new Date(),
      utf8: (text: string) => new TextEncoder().encode(text),
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 1,
  leaseSeconds: 60,
  pollIntervalMs: 50,
});

type Call = (method: string, path: string, body?: unknown) => Promise<Response>;
const as =
  (token: string): Call =>
  async (method, path, body) =>
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

let admin06: Call;
let adminWithoutFactor: Call;
let reader06: Call;
let adminFactor: { token: string; factorId: string } | undefined;

beforeAll(async () => {
  const adminToken = await signIn('admin.sis06@demo.etare.test');
  adminWithoutFactor = as(adminToken);
  adminFactor = await withSecondFactor(adminToken);
  admin06 = as(adminFactor.token);
  reader06 = as(await signIn('lecteur06@demo.etare.test'));
});

afterAll(async () => {
  // The factor enrolled for the test never stays on the demo account.
  if (adminFactor) await authApi(`/factors/${adminFactor.factorId}`, { method: 'DELETE', token: adminFactor.token });
  await workerPool.end();
});

describe('reversibility export (ADMIN-04)', () => {
  it('is requested with the second factor, built by the worker, downloaded part by part', async () => {
    expect((await reader06('GET', '/exports')).status).toBe(403);
    const withoutFactor = await adminWithoutFactor('POST', '/exports');
    expect(withoutFactor.status).toBe(403);
    expect(((await withoutFactor.json()) as { error: { code: string } }).error.code).toBe('MFA_REQUIRED');

    // Earlier runs may have left an export building (crash): not the case after a reset; one at a time.
    const requested = await admin06('POST', '/exports');
    expect(requested.status).toBe(201);
    const run = endpoints.requestExport.response.parse(await requested.json());
    expect(run.status).toBe('queued');
    expect((await admin06('POST', '/exports')).status).toBe(409);

    await drain(worker, 20);
    const listed = endpoints.listExports.response.parse(await (await admin06('GET', '/exports')).json());
    const ready = listed.items.find((item) => item.id === run.id);
    expect(ready?.status).toBe('ready');
    expect(ready?.parts[0]).toMatchObject({
      index: 0,
      kind: 'data',
      filename: 'donnees.zip',
      media_type: 'application/zip',
    });
    expect(ready?.row_count ?? 0).toBeGreaterThan(50);
    expect(Date.parse(ready?.expires_at ?? '')).toBeGreaterThan(Date.now() + 6 * 86_400_000);

    // The data part: tables as JSON and CSV, the manifest naming every part and file with its hash.
    const ticket = await admin06('POST', `/exports/${run.id}/parts/0/download`);
    expect(ticket.status).toBe(200);
    const download = endpoints.downloadExportPart.response.parse(await ticket.json());
    expect(download.filename).toBe('donnees.zip');
    const bytes = new Uint8Array(await (await fetch(download.url)).arrayBuffer());
    expect(await sha256(bytes)).toBe(ready?.parts[0]?.sha256);
    const entries = unzipSync(bytes);
    const decode = (name: string) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(entries[name]);
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining(['donnees/site.json', 'donnees/site.csv', 'manifeste.json', 'LISEZMOI.md']),
    );
    expect(decode('donnees/site.csv')).toContain('EHPAD Les Oliviers');
    const manifest = JSON.parse(decode('manifeste.json')) as {
      sis: { slug: string };
      tables: Record<string, number>;
      files: { sha256: string; part: string }[];
      parts: { filename: string }[];
    };
    expect(manifest.sis.slug).toBe('sdis-demo-06');
    expect(manifest.tables['site']).toBeGreaterThan(0);
    expect(manifest.tables['hazardous_substance']).toBeGreaterThan(0);
    expect(manifest.parts.map((part) => part.filename)).toEqual(ready?.parts.slice(1).map((part) => part.filename));
    // Devices never export the hash of their enrolment code.
    expect(decode('donnees/device.json')).not.toContain('enrollment_code_hash');

    expect((await admin06('POST', `/exports/${run.id}/parts/99/download`)).status).toBe(404);
    expect((await reader06('POST', `/exports/${run.id}/parts/0/download`)).status).toBe(403);
  }, 120_000);
});
