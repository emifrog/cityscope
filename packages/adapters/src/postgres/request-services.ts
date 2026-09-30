import type { AuditRecorder, JobScheduler } from '@etare/application';
import type { PoolClient } from './pool';

/** Enqueues in the request transaction: the job exists if and only if the business change is committed. */
export class PostgresJobScheduler implements JobScheduler {
  constructor(private readonly client: PoolClient) {}

  async enqueue(type: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<string> {
    const result = await this.client.query<{ id: string }>('select app.enqueue_job($1, $2::jsonb, $3) as id', [
      type,
      JSON.stringify(payload),
      idempotencyKey,
    ]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('The job could not be enqueued.');
    return id;
  }
}

/** Business audit events; the actor and tenant come from the verified request context, never from the caller. */
export class PostgresAuditRecorder implements AuditRecorder {
  constructor(private readonly client: PoolClient) {}

  async record(
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.client.query("select app.record_audit_event($1, $2, $3, 'success', null, $4::jsonb)", [
      action,
      entityType,
      entityId,
      JSON.stringify(metadata),
    ]);
  }
}
