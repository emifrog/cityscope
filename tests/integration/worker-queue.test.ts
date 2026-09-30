/**
 * The job queue end to end: a job enqueued by an API request (in its tenant
 * context and transaction) is leased and completed by a worker connected
 * with its own least-privileged role.
 */
import { PostgresJobQueue, createLogger, createPool } from '@etare/adapters';
import { HandlerRegistry, createWorker, noopHandler } from '@etare/worker';
import { afterAll, describe, expect, it } from 'vitest';
import { TENANT_06, requireEnv } from './helpers';

const apiPool = createPool({
  connectionString: requireEnv('DATABASE_URL'),
  applicationName: 'integration-api',
  max: 1,
});
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-worker',
  max: 2,
});
const adminPool = createPool({
  connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL'),
  applicationName: 'integration-admin',
  max: 1,
});

afterAll(async () => {
  await Promise.all([apiPool.end(), workerPool.end(), adminPool.end()]);
});

describe('PostgreSQL job queue', () => {
  it('runs a job enqueued by the API with the worker role', async () => {
    const client = await apiPool.connect();
    let jobId: string;
    try {
      await client.query('begin');
      await client.query(
        `select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', $1, 'aal1', null, 'web')`,
        [TENANT_06],
      );
      const result = await client.query<{ id: string }>(
        `select app.enqueue_job('system.noop', '{"note": "integration"}'::jsonb, $1) as id`,
        [`integration-${Date.now()}`],
      );
      jobId = result.rows[0]?.id ?? '';
      await client.query('commit');
    } finally {
      client.release();
    }
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/);

    const worker = createWorker({
      queue: new PostgresJobQueue(workerPool, 'integration-worker'),
      registry: new HandlerRegistry([noopHandler]),
      logger: createLogger({}, { write: () => undefined }),
      concurrency: 5,
      leaseSeconds: 30,
      pollIntervalMs: 100,
    });
    await worker.runOnce();

    const { rows } = await adminPool.query<{ status: string; tenant_id: string }>(
      'select status, tenant_id from app.job where id = $1',
      [jobId],
    );
    expect(rows[0]).toEqual({ status: 'succeeded', tenant_id: TENANT_06 });
  });

  it('refuses queue operations to the API role', async () => {
    await expect(apiPool.query(`select * from app.claim_jobs('api', 1, 30)`)).rejects.toThrow(/permission denied/);
  });
});
