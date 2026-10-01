import pg from 'pg';

export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

export interface PoolOptions {
  readonly connectionString: string;
  readonly applicationName: string;
  readonly max?: number;
  /** An idle connection was lost (database restart, failover): the pool drops it and reconnects on demand. */
  readonly onIdleError?: (error: Error) => void;
}

/**
 * Bounded pool. Server-side timeouts (statement, idle transaction, lock) are
 * set on the database roles themselves (migration 20260930120000), not sent as
 * startup parameters, so that they also apply behind a connection pooler.
 * The client keeps its own query timeout as a last resort. The loss of an
 * idle connection never stops the process: without a listener, the 'error'
 * event of the pool would be thrown.
 */
export function createPool(options: PoolOptions): pg.Pool {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    application_name: options.applicationName,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  });
  pool.on('error', (error) => options.onIdleError?.(error));
  return pool;
}

/** Maps the stable SQLSTATE of an error raised by PostgreSQL, if any. */
export function sqlState(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}
