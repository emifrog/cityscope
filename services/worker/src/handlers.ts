import {
  BASEMAP_BUILD_JOB,
  BASEMAP_PLAN_JOB,
  basemapPlanningSlot,
  buildBasemap,
  planBasemaps,
  type BasemapBuildDependencies,
  type BasemapBuildStore,
  type BasemapSourceInfo,
  ASSET_VARIANTS_JOB,
  ASSET_VERIFICATION_JOB,
  FILE_MAINTENANCE_JOB,
  createAssetVariants,
  maintenanceSlot,
  runFileMaintenance,
  type AssetVariantDependencies,
  type FileMaintenanceStore,
  type ObjectStoreAdmin,
  NOTIFICATION_SEND_JOB,
  PUBLICATION_BUILD_JOB,
  PermanentJobError,
  SIGNATURE_RENEWAL_JOB,
  DATABASE_MAINTENANCE_JOB,
  type WorkerSupervisionStore,
  renewSignatures,
  type SignatureRenewalDependencies,
  type SignatureRenewalStore,
  buildPublication,
  sendNotification,
  verifyAsset,
  type BuildTools,
  type Job,
  type NotificationDependencies,
  type PublicationArtifacts,
  type PublicationBuildStore,
  type VerificationDependencies,
} from '@etare/application';
import type { Logger } from '@etare/adapters/logging';
import { z } from 'zod';

export interface JobExecution {
  readonly job: Job;
  readonly logger: Logger;
  /** Aborted when the worker shuts down or loses the lease. */
  readonly signal: AbortSignal;
}

export interface HandlerDefinition<P> {
  readonly type: string;
  readonly payloadVersion: number;
  readonly payload: z.ZodType<P>;
  /** Must be idempotent: a job can be delivered more than once. */
  handle(payload: P, execution: JobExecution): Promise<void>;
}

/** A registered handler: payload validation is encapsulated, so handlers of any payload type can share a registry. */
export interface JobHandler {
  readonly type: string;
  readonly payloadVersion: number;
  run(rawPayload: unknown, execution: JobExecution): Promise<void>;
}

export function defineHandler<P>(definition: HandlerDefinition<P>): JobHandler {
  return {
    type: definition.type,
    payloadVersion: definition.payloadVersion,
    async run(rawPayload, execution) {
      // Validate before any side effect: a malformed payload will never succeed, do not retry it.
      const payload = definition.payload.safeParse(rawPayload);
      if (!payload.success) throw new PermanentJobError('INVALID_PAYLOAD');
      await definition.handle(payload.data, execution);
    },
  };
}

/**
 * Technical no-op job: proves the whole chain (enqueue in a transaction,
 * lease, heartbeat, completion) without side effect. Future handlers
 * (PDF generation, offline packages, thumbnails, imports, antivirus,
 * notifications, checksums) plug in the same way.
 */
export const noopHandler = defineHandler({
  type: 'system.noop',
  payloadVersion: 1,
  payload: z.looseObject({ note: z.string().max(200).optional() }),
  async handle(payload, { logger }) {
    logger.info('noop job executed', { note: payload.note });
  },
});

export class HandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(handlers: readonly JobHandler[] = []) {
    for (const handler of handlers) this.register(handler);
  }

  register(handler: JobHandler): void {
    if (this.handlers.has(handler.type)) throw new Error(`Duplicate job handler: ${handler.type}`);
    this.handlers.set(handler.type, handler);
  }

  /** Unknown types and unsupported payload versions are permanent errors. */
  async execute(execution: JobExecution): Promise<void> {
    const { job } = execution;
    const handler = this.handlers.get(job.type);
    if (!handler) throw new PermanentJobError('UNKNOWN_JOB_TYPE');
    if (job.payloadVersion !== handler.payloadVersion) throw new PermanentJobError('UNSUPPORTED_PAYLOAD_VERSION');
    await handler.run(job.payload, execution);
  }

  types(): string[] {
    return [...this.handlers.keys()];
  }
}

/**
 * Verifies an uploaded file (size, SHA-256, real type, antivirus) and promotes
 * it out of quarantine. A missing upload is retried with backoff; the verdict
 * itself is final and written through a dedicated database function.
 */
export function assetVerificationHandler(deps: VerificationDependencies): JobHandler {
  return defineHandler({
    type: ASSET_VERIFICATION_JOB,
    payloadVersion: 1,
    payload: z.object({ asset_id: z.uuid() }),
    async handle(payload, { job, logger }) {
      const outcome = await verifyAsset(deps, payload.asset_id, job.tenantId);
      logger.info('asset verification', {
        asset_id: payload.asset_id,
        outcome: outcome.status,
        ...('reason' in outcome ? { reason: outcome.reason } : {}),
      });
    },
  });
}

/**
 * Builds a publication from the frozen snapshot of its approved revision:
 * payload, manifest and SHA-256, then activation (a newer publication is
 * never replaced). The working tables are never read (architecture §09).
 */
export function publicationBuildHandler(deps: {
  store: PublicationBuildStore;
  tools: BuildTools;
  /** The ETARE PDF is produced when object storage is available. */
  artifacts?: PublicationArtifacts | null;
}): JobHandler {
  return defineHandler({
    type: PUBLICATION_BUILD_JOB,
    payloadVersion: 1,
    payload: z.object({ publication_id: z.uuid() }),
    async handle(payload, { job, logger, signal }) {
      if (!job.tenantId) throw new PermanentJobError('TENANT_REQUIRED');
      const outcome = await buildPublication(
        deps.store,
        deps.tools,
        payload.publication_id,
        job.tenantId,
        { jobId: job.id, attempt: job.attempts },
        deps.artifacts ?? null,
        signal,
      );
      logger.info('publication build', { publication_id: payload.publication_id, outcome });
    },
  });
}

/** Reduced images of a clean image (CAP-03), planned by the database with the verdict. */
export function assetVariantsHandler(deps: AssetVariantDependencies): JobHandler {
  return defineHandler({
    type: ASSET_VARIANTS_JOB,
    payloadVersion: 1,
    payload: z.object({ asset_id: z.uuid() }),
    async handle(payload, { job, logger }) {
      const outcome = await createAssetVariants(deps, payload.asset_id, job.tenantId);
      logger.info('asset variants', { asset_id: payload.asset_id, outcome });
    },
  });
}

/** Planned maintenance of the files (CAP-03): a platform job, without SIS. */
export function fileMaintenanceHandler(deps: { store: FileMaintenanceStore; objects: ObjectStoreAdmin }): JobHandler {
  return defineHandler({
    type: FILE_MAINTENANCE_JOB,
    payloadVersion: 1,
    payload: z.object({ slot: z.string().max(20) }),
    async handle(payload, { logger }) {
      const report = await runFileMaintenance(deps.store, deps.objects);
      logger.info('file maintenance', { slot: payload.slot, ...report });
    },
  });
}

/**
 * Asks for the maintenance every few minutes: one job per hour slot whatever the number of
 * workers (idempotency key in the database). Returns the function stopping the timer.
 */
export function startMaintenanceScheduler(
  store: Pick<FileMaintenanceStore, 'schedule'>,
  logger: Logger,
  options: { intervalMs?: number; now?: () => Date } = {},
): () => void {
  const now = options.now ?? (() => new Date());
  const tick = () =>
    store.schedule(maintenanceSlot(now())).catch((error: unknown) => {
      logger.warn('maintenance not scheduled', { error: error instanceof Error ? error.message : String(error) });
    });
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Re-signs the content in force with the active publication key (SEC-04, ADR-027): a
 * platform job, without SIS. A content the worker cannot vouch for is never re-signed,
 * and is reported as an error.
 */
export function signatureRenewalHandler(deps: SignatureRenewalDependencies): JobHandler {
  return defineHandler({
    type: SIGNATURE_RENEWAL_JOB,
    payloadVersion: 1,
    payload: z.object({ key_id: z.string().max(64), slot: z.string().max(20) }),
    async handle(payload, { logger }) {
      // Another worker of the platform holding another key would sign with it: leave the job to the key it names.
      if (payload.key_id !== deps.signer.keyId) {
        logger.warn('signature renewal for another key', { key_id: payload.key_id, own_key_id: deps.signer.keyId });
        return;
      }
      const report = await renewSignatures(deps);
      const fields = {
        slot: payload.slot,
        key_id: report.keyId,
        publications: report.publications,
        basemaps: report.basemaps,
        unverifiable: report.unverifiable.length,
      };
      if (report.unverifiable.length > 0) {
        logger.error('content not re-signed: stored manifest or signature not verified', {
          ...fields,
          contents: report.unverifiable.slice(0, 20),
        });
      } else if (report.publications + report.basemaps > 0) {
        logger.info('signatures renewed', fields);
      }
    },
  });
}

/** Hourly database maintenance (EXP-03): finished jobs, receipt history, heartbeats, rate-limit windows. */
export function databaseMaintenanceHandler(store: WorkerSupervisionStore): JobHandler {
  return defineHandler({
    type: DATABASE_MAINTENANCE_JOB,
    payloadVersion: 1,
    payload: z.object({ slot: z.string().max(20) }),
    async handle(payload, { logger }) {
      logger.info('database maintenance', { slot: payload.slot, purged: await store.purgeHistory() });
    },
  });
}

/**
 * Supervision of the worker (EXP-03): a heartbeat every [intervalMs] (live workers are counted
 * by the metrics of the platform), and the database maintenance asked for every few minutes.
 * Returns the function stopping both, which records a clean shutdown.
 */
export function startWorkerSupervision(
  store: WorkerSupervisionStore,
  beat: { workerId: string; version: string; handlers: readonly string[]; concurrency: number },
  logger: Logger,
  options: { intervalMs?: number; now?: () => Date } = {},
): () => Promise<void> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const tick = () => {
    store.beat({ ...beat, startedAt }).catch((error: unknown) => {
      logger.warn('heartbeat not recorded', { error: error instanceof Error ? error.message : String(error) });
    });
    store.scheduleMaintenance(maintenanceSlot(now())).catch((error: unknown) => {
      logger.warn('database maintenance not scheduled', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };
  tick();
  const timer = setInterval(tick, options.intervalMs ?? 30_000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await store.beat({ ...beat, startedAt, stopping: true }).catch(() => undefined);
  };
}

/** Asks for the renewal of the signatures every few minutes (one job per key and per hour). */
export function startSignatureRenewalScheduler(
  store: Pick<SignatureRenewalStore, 'schedule'>,
  keyId: string,
  logger: Logger,
  options: { intervalMs?: number; now?: () => Date } = {},
): () => void {
  const now = options.now ?? (() => new Date());
  const tick = () =>
    store.schedule(keyId, maintenanceSlot(now())).catch((error: unknown) => {
      logger.warn('signature renewal not scheduled', { error: error instanceof Error ? error.message : String(error) });
    });
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

/** Prepares the base map of a sector (ADR-024): long, one at a time per worker (exclusive type). */
export function basemapBuildHandler(deps: BasemapBuildDependencies): JobHandler {
  return defineHandler({
    type: BASEMAP_BUILD_JOB,
    payloadVersion: 1,
    payload: z.object({ pack_id: z.uuid() }),
    async handle(payload, { job, logger, signal }) {
      if (!job.tenantId) throw new PermanentJobError('TENANT_REQUIRED');
      const outcome = await buildBasemap(deps, payload.pack_id, job.tenantId, signal);
      logger.info('basemap build', { pack_id: payload.pack_id, outcome });
    },
  });
}

/** Plans the base maps every SIS needs and removes superseded files: a platform job, without SIS. */
export function basemapPlanHandler(deps: {
  store: BasemapBuildStore;
  objects: ObjectStoreAdmin | null;
  source: BasemapSourceInfo | null;
}): JobHandler {
  return defineHandler({
    type: BASEMAP_PLAN_JOB,
    payloadVersion: 1,
    payload: z.object({ slot: z.string().max(20) }),
    async handle(payload, { logger }) {
      const report = await planBasemaps(deps);
      logger.info('basemap planning', { slot: payload.slot, source: deps.source?.id ?? null, ...report });
    },
  });
}

/** Asks for the planning of the base maps every few minutes (one job per quarter of an hour). */
export function startBasemapScheduler(
  store: Pick<BasemapBuildStore, 'schedule'>,
  logger: Logger,
  options: { intervalMs?: number; now?: () => Date } = {},
): () => void {
  const now = options.now ?? (() => new Date());
  const tick = () =>
    store.schedule(basemapPlanningSlot(now())).catch((error: unknown) => {
      logger.warn('basemap planning not scheduled', { error: error instanceof Error ? error.message : String(error) });
    });
  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs ?? 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

/**
 * Sends a notification of the exploitant portal (POR-05): idempotent, each
 * attempt and its error recorded; without mail server the notification fails
 * visibly and can be replayed by the administration of the SIS.
 */
export function notificationHandler(deps: NotificationDependencies): JobHandler {
  return defineHandler({
    type: NOTIFICATION_SEND_JOB,
    payloadVersion: 1,
    payload: z.object({ notification_id: z.uuid() }),
    async handle(payload, { job, logger }) {
      if (!job.tenantId) throw new PermanentJobError('TENANT_REQUIRED');
      const outcome = await sendNotification(deps, payload.notification_id, job.tenantId);
      logger.info('notification', { notification_id: payload.notification_id, outcome });
    },
  });
}
