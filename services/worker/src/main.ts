import { hostname } from 'node:os';
import { createLogger } from '@etare/adapters/logging';
import { PostgresJobQueue, createPool } from '@etare/adapters/postgres';
import { readWorkerEnv } from '@etare/config';
import { HandlerRegistry, noopHandler } from './handlers';
import { createWorker } from './runner';

const env = readWorkerEnv(process.env);
const workerId = env.workerId ?? `${hostname()}-${process.pid}`;
const logger = createLogger({ component: 'worker', worker_id: workerId, env: env.appEnv });
const pool = createPool({
  connectionString: env.databaseUrl,
  applicationName: 'etare-worker',
  max: env.concurrency + 2,
});

const worker = createWorker({
  queue: new PostgresJobQueue(pool, workerId),
  registry: new HandlerRegistry([noopHandler]),
  logger,
  concurrency: env.concurrency,
  leaseSeconds: env.leaseSeconds,
  pollIntervalMs: env.pollIntervalMs,
});

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info('shutdown requested', { signal });
  await worker.stop();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await worker.start();
