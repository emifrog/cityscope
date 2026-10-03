import type { RateLimiter, SecurityEvent, SecurityEventRecorder } from '@etare/application';
import type { Pool } from './pool';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Counters in PostgreSQL, shared by every instance of the API. Each hit is its own
 * statement (autocommit), outside the transaction of the request: a refused or failed
 * attempt is never rolled back.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly pool: Pool) {}

  async consume(key: string, limit: number, windowSeconds: number) {
    const { rows } = await this.pool.query<{ allowed: boolean; hits: number; retry_after: number }>(
      'select allowed, hits, retry_after from app.consume_rate_limit($1, $2, $3)',
      [key, limit, windowSeconds],
    );
    const row = rows[0];
    return { allowed: row?.allowed ?? true, hits: row?.hits ?? 0, retryAfter: row?.retry_after ?? windowSeconds };
  }
}

/** Refusals written to the audit log (outcome 'denied') in their own transaction. */
export class PostgresSecurityEventRecorder implements SecurityEventRecorder {
  constructor(private readonly pool: Pool) {}

  async record(event: SecurityEvent): Promise<void> {
    await this.pool.query('select app.record_security_event($1, $2, $3, $4, $5, $6, $7, $8::jsonb)', [
      event.principal?.provider ?? null,
      event.principal?.subject ?? null,
      event.tenantId && UUID.test(event.tenantId) ? event.tenantId : null,
      event.action,
      event.reason,
      event.traceId && UUID.test(event.traceId) ? event.traceId : null,
      event.origin,
      JSON.stringify(event.metadata),
    ]);
  }
}
