/** Asynchronous jobs (PostgreSQL queue, at-least-once delivery: handlers are idempotent). */
export interface Job {
  readonly id: string;
  readonly tenantId: string | null;
  readonly type: string;
  readonly payloadVersion: number;
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly correlationId: string | null;
}

export interface JobQueue {
  claim(limit: number, leaseSeconds: number): Promise<Job[]>;
  heartbeat(jobId: string, leaseSeconds: number): Promise<boolean>;
  complete(jobId: string): Promise<boolean>;
  /** retryInSeconds = null: permanent failure (dead immediately). */
  fail(jobId: string, errorCode: string, retryInSeconds: number | null): Promise<'queued' | 'dead' | null>;
}

/** Thrown by a handler for errors that retrying cannot fix (invalid payload, missing entity...). */
export class PermanentJobError extends Error {
  constructor(
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PermanentJobError';
  }
}
