import type { TenantSupervision } from '@etare/contracts';
import type { RequestContext } from '@etare/domain';
import type { SessionFactory } from './ports';
import { inTenant } from './use-cases';

/** Board of a SIS (EXP-03): publications, terminals, receipts, field reports, files, notifications, base maps. */
export async function getSupervision(sessions: SessionFactory, context: RequestContext): Promise<TenantSupervision> {
  return inTenant(sessions, context, 'audit:read', (session) => session.supervision.read());
}

/** Database maintenance of the platform (EXP-03): history purge, one job per hour. */
export const DATABASE_MAINTENANCE_JOB = 'maintenance.database';

/** Worker-side access to the supervision data (dedicated database functions). */
export interface WorkerSupervisionStore {
  /** Queues the database maintenance of an hour slot (idempotent). */
  scheduleMaintenance(slot: string): Promise<void>;
  /** Purges finished jobs, receipt history, heartbeats and rate-limit windows; returns the counts. */
  purgeHistory(): Promise<Record<string, number>>;
  /** Liveness of the worker; [stopping] on a clean shutdown. */
  beat(beat: {
    workerId: string;
    startedAt: Date;
    version: string;
    handlers: readonly string[];
    concurrency: number;
    stopping?: boolean;
  }): Promise<void>;
}
