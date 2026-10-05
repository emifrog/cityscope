import type { Logger } from '@etare/adapters/logging';
import { setTimeout as delay } from 'node:timers/promises';
import { PermanentJobError, type Job, type JobQueue } from '@etare/application';
import { retryDelaySeconds } from './backoff';
import type { HandlerRegistry } from './handlers';

export interface WorkerOptions {
  readonly queue: JobQueue;
  readonly registry: HandlerRegistry;
  readonly logger: Logger;
  readonly concurrency: number;
  readonly leaseSeconds: number;
  readonly pollIntervalMs: number;
  readonly retryDelay?: (attempt: number) => number;
  /**
   * Long job types (preparation of a base map) of which a worker runs one at a time, so that
   * they never take every slot from the publications and the files.
   */
  readonly exclusiveTypes?: readonly string[];
}

export interface Worker {
  /** Claims and processes one batch; returns the number of jobs handled. */
  runOnce(): Promise<number>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  try {
    // The timer removes its abort listener on completion, even after many idle polls.
    await delay(ms, undefined, { signal });
  } catch (error) {
    if (!signal.aborted) throw error;
  }
}

export function createWorker(options: WorkerOptions): Worker {
  const { queue, registry, logger, concurrency, leaseSeconds, pollIntervalMs } = options;
  const retryDelay = options.retryDelay ?? retryDelaySeconds;
  const exclusive = new Set(options.exclusiveTypes ?? []);
  const running = new Map<string, number>();
  const shutdown = new AbortController();
  let slots: Promise<void>[] = [];
  // One claim at a time in this worker: an exclusive type is marked running before the next claim.
  let claiming: Promise<unknown> = Promise.resolve();

  const excluded = () => [...exclusive].filter((type) => (running.get(type) ?? 0) > 0);

  function claimOne(): Promise<Job[]> {
    const claim = claiming.then(async () => {
      const jobs = await queue.claim(1, leaseSeconds, excluded());
      for (const job of jobs) running.set(job.type, (running.get(job.type) ?? 0) + 1);
      return jobs;
    });
    claiming = claim.catch(() => undefined);
    return claim;
  }

  async function process(job: Job): Promise<void> {
    const jobLogger = logger.child({
      job_id: job.id,
      job_type: job.type,
      tenant_id: job.tenantId,
      attempt: job.attempts,
    });
    const lease = new AbortController();
    const stopLease = () => lease.abort();
    shutdown.signal.addEventListener('abort', stopLease);
    // Heartbeat at a third of the lease: a crashed worker lets its lease expire.
    const heartbeat = setInterval(
      () => {
        queue.heartbeat(job.id, leaseSeconds).then(
          (kept) => {
            if (!kept) {
              jobLogger.warn('lease lost');
              lease.abort();
            }
          },
          (error: unknown) => jobLogger.warn('heartbeat failed', { error }),
        );
      },
      Math.max(1_000, (leaseSeconds * 1_000) / 3),
    );

    try {
      await registry.execute({ job, logger: jobLogger, signal: lease.signal });
      if (await queue.complete(job.id)) jobLogger.info('job succeeded');
      else jobLogger.warn('job completion ignored: lease lost');
    } catch (error) {
      const permanent = error instanceof PermanentJobError;
      const code = permanent ? error.code : 'HANDLER_ERROR';
      const status = await queue.fail(job.id, code, permanent ? null : retryDelay(job.attempts));
      jobLogger.warn('job failed', { code, status, ...(permanent ? {} : { error }) });
    } finally {
      clearInterval(heartbeat);
      shutdown.signal.removeEventListener('abort', stopLease);
      running.set(job.type, Math.max(0, (running.get(job.type) ?? 1) - 1));
    }
  }

  async function runOnce(): Promise<number> {
    const jobs = await queue.claim(concurrency, leaseSeconds, excluded());
    for (const job of jobs) running.set(job.type, (running.get(job.type) ?? 0) + 1);
    await Promise.all(jobs.map(process));
    return jobs.length;
  }

  /** A slot works on its own: a long job only holds its slot. */
  async function slot(): Promise<void> {
    while (!shutdown.signal.aborted) {
      let jobs: Job[] = [];
      try {
        jobs = await claimOne();
      } catch (error) {
        logger.error('queue unavailable', { error });
      }
      const job = jobs[0];
      if (job) await process(job);
      else await sleep(pollIntervalMs, shutdown.signal);
    }
  }

  return {
    runOnce,
    start() {
      logger.info('worker started', {
        handlers: registry.types(),
        concurrency,
        lease_seconds: leaseSeconds,
        exclusive: [...exclusive],
      });
      slots = Array.from({ length: concurrency }, () => slot());
      return Promise.resolve();
    },
    async stop() {
      shutdown.abort();
      await Promise.all(slots);
      logger.info('worker stopped');
    },
  };
}
