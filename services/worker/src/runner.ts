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
  const shutdown = new AbortController();
  let loop: Promise<void> | undefined;

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
    }
  }

  async function runOnce(): Promise<number> {
    const jobs = await queue.claim(concurrency, leaseSeconds);
    await Promise.all(jobs.map(process));
    return jobs.length;
  }

  return {
    runOnce,
    start() {
      logger.info('worker started', { handlers: registry.types(), concurrency, lease_seconds: leaseSeconds });
      loop = (async () => {
        while (!shutdown.signal.aborted) {
          let handled = 0;
          try {
            handled = await runOnce();
          } catch (error) {
            logger.error('queue unavailable', { error });
          }
          if (handled === 0) await sleep(pollIntervalMs, shutdown.signal);
        }
      })();
      return Promise.resolve();
    },
    async stop() {
      shutdown.abort();
      await loop;
      logger.info('worker stopped');
    },
  };
}
