import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { antivirusNotConfigured } from '@etare/application';
import { createLogger } from '@etare/adapters/logging';
import {
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  createPool,
} from '@etare/adapters/postgres';
import { SupabaseObjectStorage } from '@etare/adapters/storage';
import { readWorkerEnv } from '@etare/config';
import { HandlerRegistry, assetVerificationHandler, noopHandler, publicationBuildHandler } from './handlers';
import { createWorker } from './runner';

const env = readWorkerEnv(process.env);
const workerId = env.workerId ?? `${hostname()}-${process.pid}`;
const logger = createLogger({ component: 'worker', worker_id: workerId, env: env.appEnv });
const pool = createPool({
  connectionString: env.databaseUrl,
  applicationName: 'etare-worker',
  max: env.concurrency + 2,
});

const sha256 = async (content: Uint8Array | string) => createHash('sha256').update(content).digest('hex');
const registry = new HandlerRegistry([
  noopHandler,
  publicationBuildHandler({
    store: new PostgresPublicationBuildStore(pool),
    tools: { sha256, byteLength: (text) => Buffer.byteLength(text, 'utf8'), now: () => new Date() },
  }),
]);
if (env.storage) {
  registry.register(
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(pool),
      objects: SupabaseObjectStorage.fromSecretKey(env.storage.url, env.storage.secretKey),
      scanner: antivirusNotConfigured,
      sha256,
    }),
  );
  logger.warn('antivirus engine not configured: files are checked for size, SHA-256 and real type only');
} else {
  logger.warn('object storage not configured: file verification jobs are not handled by this worker');
}

const worker = createWorker({
  queue: new PostgresJobQueue(pool, workerId),
  registry,
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
