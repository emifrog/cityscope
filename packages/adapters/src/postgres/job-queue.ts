import type { Job, JobQueue } from '@etare/application';
import type { Pool } from './pool';

interface JobRow {
  id: string;
  tenant_id: string | null;
  job_type: string;
  payload_version: number;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  correlation_id: string | null;
}

/** Worker side of the PostgreSQL queue (SECURITY DEFINER functions granted to etare_worker only). */
export class PostgresJobQueue implements JobQueue {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
  ) {}

  async claim(limit: number, leaseSeconds: number): Promise<Job[]> {
    const result = await this.pool.query<JobRow>(
      `select id, tenant_id, job_type, payload_version, payload, attempts, max_attempts, correlation_id
       from app.claim_jobs($1, $2, $3)`,
      [this.workerId, limit, leaseSeconds],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      type: row.job_type,
      payloadVersion: row.payload_version,
      payload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      correlationId: row.correlation_id,
    }));
  }

  async heartbeat(jobId: string, leaseSeconds: number): Promise<boolean> {
    const result = await this.pool.query<{ ok: boolean }>('select app.heartbeat_job($1, $2, $3) as ok', [
      jobId,
      this.workerId,
      leaseSeconds,
    ]);
    return result.rows[0]?.ok === true;
  }

  async complete(jobId: string): Promise<boolean> {
    const result = await this.pool.query<{ ok: boolean }>('select app.complete_job($1, $2) as ok', [
      jobId,
      this.workerId,
    ]);
    return result.rows[0]?.ok === true;
  }

  async fail(jobId: string, errorCode: string, retryInSeconds: number | null): Promise<'queued' | 'dead' | null> {
    const result = await this.pool.query<{ status: string | null }>('select app.fail_job($1, $2, $3, $4) as status', [
      jobId,
      this.workerId,
      errorCode,
      retryInSeconds,
    ]);
    const status = result.rows[0]?.status ?? null;
    return status === 'queued' || status === 'dead' ? status : null;
  }
}
