import type { WorkerSupervisionStore } from '@etare/application';
import type { Pool } from './pool';

/** Worker side of the supervision (EXP-03): heartbeat and history maintenance, app.worker_* functions only. */
export class PostgresWorkerSupervisionStore implements WorkerSupervisionStore {
  constructor(private readonly pool: Pool) {}

  async scheduleMaintenance(slot: string): Promise<void> {
    await this.pool.query('select app.worker_schedule_database_maintenance($1)', [slot]);
  }

  async purgeHistory(): Promise<Record<string, number>> {
    const { rows } = await this.pool.query<{ purged: Record<string, number> }>(
      'select app.worker_purge_history() as purged',
    );
    return rows[0]?.purged ?? {};
  }

  async beat(beat: {
    workerId: string;
    startedAt: Date;
    version: string;
    handlers: readonly string[];
    concurrency: number;
    stopping?: boolean;
  }): Promise<void> {
    await this.pool.query('select app.worker_beat($1, $2, $3, $4::text[], $5, $6)', [
      beat.workerId,
      beat.startedAt,
      beat.version,
      beat.handlers,
      beat.concurrency,
      beat.stopping ?? false,
    ]);
  }
}
