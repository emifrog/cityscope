/**
 * Sprint 12 — EXP-03: supervision through the real stack. The metrics endpoint reads the figures of
 * the platform from PostgreSQL behind its token; a worker that beats is counted alive; the board of
 * the SIS is read with audit:read; the trace of a request follows the job it enqueues.
 */
import { createHash } from 'node:crypto';
import { PostgresWorkerSupervisionStore, createLogger, createPool } from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, apiErrorSchema, endpoints } from '@etare/contracts';
import { startWorkerSupervision } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, requireEnv, signIn } from './helpers';

const metricsToken = `integration-metrics-token-${Date.now()}-0123456789`;
const app = createApiApp({ ...createApiDependencies(process.env), metricsToken });
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-supervision',
});
const adminPool = createPool({
  connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL'),
  applicationName: 'integration-admin',
});
const silent = createLogger({}, { write: () => undefined });

type Call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
const as =
  (token: string): Call =>
  async (method, path, body, headers = {}) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': TENANT_06,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

let admin06: Call;
let ops06: Call;
let editor06: Call;

beforeAll(async () => {
  const [admin, ops, editor] = await Promise.all([
    signIn('admin.sis06@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
    signIn('redacteur06@demo.etare.test'),
  ]);
  admin06 = as(admin);
  ops06 = as(ops);
  editor06 = as(editor);
});

afterAll(async () => {
  await Promise.all([workerPool.end(), adminPool.end()]);
});

const scrape = (token = metricsToken) =>
  app.request(`${API_BASE_PATH}/metrics`, { headers: { authorization: `Bearer ${token}` } });

describe('supervision (EXP-03)', () => {
  it('serves the metrics of the API and of the platform behind its token only', async () => {
    expect((await scrape('wrong-token')).status).toBe(401);
    await admin06('GET', '/supervision');
    const response = await scrape();
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('etare_platform_metrics_up 1\n');
    expect(text).toMatch(/etare_database_size_bytes \d+\n/);
    expect(text).toContain('etare_devices_active{tenant="sdis-demo-06"}');
    expect(text).toContain('etare_http_requests_total{method="GET",route="/api/v1/supervision",status="2xx"}');
    // Never an identifier in a label.
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it('counts a worker alive while it beats, and no longer once it stopped', async () => {
    const workerId = `integration-${Date.now()}`;
    const alive = async () => Number(/etare_workers_alive (\d+)/.exec(await (await scrape()).text())?.[1] ?? 0);
    const before = await alive();
    // Beats only: the hourly maintenance is left to the real workers (the test workers lack its handler).
    const store = new PostgresWorkerSupervisionStore(workerPool);
    const stop = startWorkerSupervision(
      { beat: (beat) => store.beat(beat), scheduleMaintenance: async () => undefined, purgeHistory: async () => ({}) },
      { workerId, version: 'integration', handlers: ['system.noop'], concurrency: 1 },
      silent,
    );
    await expect.poll(alive).toBe(before + 1);
    await stop();
    expect(await alive()).toBe(before);
  });

  it('gives the board of the SIS to audit:read holders only', async () => {
    const response = await admin06('GET', '/supervision');
    expect(response.status).toBe(200);
    const board = endpoints.getSupervision.response.parse(await response.json());
    expect(board.devices.active).toBeGreaterThanOrEqual(0);
    const refused = await ops06('GET', '/supervision');
    expect(refused.status).toBe(403);
    expect(apiErrorSchema.parse(await refused.json()).error.code).toBe('FORBIDDEN');
  });

  it('carries the W3C trace of a request into the job it enqueues', async () => {
    const content = new TextEncoder().encode(`%PDF-1.4\n% trace ${Date.now()}\n%%EOF\n`);
    const created = endpoints.createDocument.response.parse(
      await (
        await editor06('POST', `/sites/${EHPAD_ID}/documents`, {
          title: `Trace ${Date.now()}`,
          category: 'instruction',
          file: {
            filename: 'trace.pdf',
            mime_type: 'application/pdf',
            size_bytes: content.byteLength,
            sha256: createHash('sha256').update(content).digest('hex'),
          },
        })
      ).json(),
    );
    await fetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: content });
    const trace = createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 32);
    const confirmed = await editor06('POST', `/assets/${created.upload.asset_id}/uploaded`, undefined, {
      traceparent: `00-${trace}-00f067aa0ba902b7-01`,
    });
    expect(confirmed.status).toBe(202);
    const expected = `${trace.slice(0, 8)}-${trace.slice(8, 12)}-${trace.slice(12, 16)}-${trace.slice(16, 20)}-${trace.slice(20)}`;
    expect(confirmed.headers.get('x-trace-id')).toBe(expected);
    const jobId = endpoints.confirmUpload.response.parse(await confirmed.json()).job_id;
    try {
      const { rows } = await adminPool.query<{ correlation_id: string }>(
        'select correlation_id from app.job where id = $1',
        [jobId],
      );
      expect(rows[0]?.correlation_id).toBe(expected);
    } finally {
      // No job left in the queue: the next test files claim from the same queue with their own workers.
      await adminPool.query('delete from app.job where id = $1', [jobId]);
    }
  });
});
