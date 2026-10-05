import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { BASEMAP_BUILD_JOB, antivirusNotConfigured } from '@etare/application';
import { ClamAvScanner, parseClamAvUrl } from '@etare/adapters/antivirus';
import { PmtilesArchiveFactory, basemapTileSource } from '@etare/adapters/basemaps';
import { loadKeyset, openSigner, verifyEd25519 } from '@etare/adapters/crypto';
import { SharpImageResizer } from '@etare/adapters/images';
import { createLogger } from '@etare/adapters/logging';
import { SmtpMailer } from '@etare/adapters/mail';
import { PdfLibEtareRenderer } from '@etare/adapters/pdf';
import {
  PostgresAssetVariantStore,
  PostgresAssetVerificationStore,
  PostgresBasemapBuildStore,
  PostgresFileMaintenanceStore,
  PostgresJobQueue,
  PostgresNotificationStore,
  PostgresPublicationBuildStore,
  PostgresSignatureRenewalStore,
  createPool,
} from '@etare/adapters/postgres';
import { SupabaseObjectStorage } from '@etare/adapters/storage';
import { readWorkerEnv } from '@etare/config';
import {
  HandlerRegistry,
  assetVariantsHandler,
  assetVerificationHandler,
  basemapBuildHandler,
  basemapPlanHandler,
  startBasemapScheduler,
  fileMaintenanceHandler,
  startMaintenanceScheduler,
  noopHandler,
  notificationHandler,
  publicationBuildHandler,
  signatureRenewalHandler,
  startSignatureRenewalScheduler,
} from './handlers';
import { createWorker } from './runner';

const env = readWorkerEnv(process.env);
const workerId = env.workerId ?? `${hostname()}-${process.pid}`;
const logger = createLogger({ component: 'worker', worker_id: workerId, env: env.appEnv });
const pool = createPool({
  connectionString: env.databaseUrl,
  applicationName: 'etare-worker',
  max: env.concurrency + 2,
  onIdleError: (error) => logger.warn('idle database connection lost', { error: error.message }),
});

const sha256 = async (content: Uint8Array | string) => createHash('sha256').update(content).digest('hex');
const objects = env.storage ? SupabaseObjectStorage.fromSecretKey(env.storage.url, env.storage.secretKey) : null;
// Key set of the platform (SEC-04, ADR-027): checked against the root keys, the worker signs only
// with a key it lists as active.
const loadedKeyset = await loadKeyset(env.keyset);
// Publication key: signs manifests for the terminals; it never leaves the worker (ADR-015), and stays
// in the Transit engine when one is configured.
const signer = env.publicationSigning
  ? await openSigner(env.publicationSigning, 'publication', loadedKeyset?.keyset ?? null)
  : null;
// Antivirus of uploaded files (SEC-01): required outside development.
const antivirus = env.antivirusUrl ? new ClamAvScanner(parseClamAvUrl(env.antivirusUrl)) : null;
// Reduced images: thumbnails of the back-office and photos of the PDF annex (CAP-03, ADR-026).
const images = new SharpImageResizer();
// Base maps of the tablets (ADR-024): synthetic test map or the Plan IGN through the agreed flow.
const basemaps = new PostgresBasemapBuildStore(pool);
const basemapSource = basemapTileSource(env.basemap);
const registry = new HandlerRegistry([
  noopHandler,
  publicationBuildHandler({
    store: new PostgresPublicationBuildStore(pool),
    tools: { sha256, byteLength: (text) => Buffer.byteLength(text, 'utf8'), now: () => new Date(), signer },
    // Without storage, publications are built without their PDF (said at startup).
    artifacts: objects ? { renderer: new PdfLibEtareRenderer(), objects, sha256Bytes: sha256, images } : null,
  }),
  // Notifications of the exploitant portal (POR-05); without mail server they fail visibly, replayable.
  notificationHandler({
    store: new PostgresNotificationStore(pool),
    mailer: env.mail ? new SmtpMailer(env.mail.smtpUrl, env.mail.from) : null,
    appBaseUrl: env.mail?.appBaseUrl ?? null,
  }),
]);
if (env.mail) {
  logger.info('notifications sent by e-mail', { links: env.mail.appBaseUrl });
} else {
  logger.warn('mail server not configured (SMTP_URL, APP_BASE_URL): notifications are not sent');
}
if (objects) {
  registry.register(
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(pool),
      objects,
      scanner: antivirus ?? antivirusNotConfigured,
      sha256,
    }),
  );
  // CAP-03: reduced images of clean images, and the hourly maintenance of the files.
  registry.register(assetVariantsHandler({ store: new PostgresAssetVariantStore(pool), objects, images }));
  registry.register(fileMaintenanceHandler({ store: new PostgresFileMaintenanceStore(pool), objects }));
  // ADR-024: base maps of the tablets, from the configured source, once its rights are approved.
  registry.register(
    basemapBuildHandler({
      store: basemaps,
      source: basemapSource,
      archives: new PmtilesArchiveFactory(),
      objects,
      signer,
      sha256,
      utf8: (text) => new TextEncoder().encode(text),
      now: () => new Date(),
    }),
  );
  if (antivirus) {
    logger.info('uploaded files checked by ClamAV', { antivirus: env.antivirusUrl });
  } else {
    logger.warn('antivirus engine not configured: files are checked for size, SHA-256 and real type only');
  }
} else {
  logger.warn('object storage not configured: no file verification, publications are built without their PDF');
}

registry.register(basemapPlanHandler({ store: basemaps, objects, source: basemapSource?.info ?? null }));
// SEC-04: after a rotation, the content in force is re-signed with the active key.
const signatures = new PostgresSignatureRenewalStore(pool);
if (signer) {
  registry.register(
    signatureRenewalHandler({
      store: signatures,
      signer,
      keyset: loadedKeyset?.keyset ?? null,
      verify: verifyEd25519,
      sha256: async (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
    }),
  );
}
if (!basemapSource) {
  logger.warn('no base map source configured (BASEMAP_SOURCE): the tablets get no map');
} else if (basemapSource.info.rights !== 'approved') {
  logger.warn('base map source without approved offline rights: no preparation until the rights sheet', {
    source: basemapSource.info.id,
  });
} else {
  logger.info('base maps prepared for the tablets', {
    source: basemapSource.info.id,
    synthetic: basemapSource.info.synthetic,
  });
}

if (signer) {
  logger.info('publication manifests signed for offline distribution', {
    key_id: signer.keyId,
    source: env.publicationSigning?.kind,
    keyset: loadedKeyset?.keyset.sequence ?? null,
  });
} else {
  logger.warn('publication signing key not configured: new publications cannot be distributed to terminals');
}

const worker = createWorker({
  queue: new PostgresJobQueue(pool, workerId),
  registry,
  logger,
  concurrency: env.concurrency,
  leaseSeconds: env.leaseSeconds,
  pollIntervalMs: env.pollIntervalMs,
  // A preparation of a base map lasts long: one at a time, the other slots stay free.
  exclusiveTypes: [BASEMAP_BUILD_JOB],
});

const stopMaintenance = objects ? startMaintenanceScheduler(new PostgresFileMaintenanceStore(pool), logger) : () => {};
const stopBasemaps = startBasemapScheduler(basemaps, logger);
const stopSignatures = signer ? startSignatureRenewalScheduler(signatures, signer.keyId, logger) : () => {};
const stopScheduler = () => {
  stopMaintenance();
  stopBasemaps();
  stopSignatures();
};

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info('shutdown requested', { signal });
  stopScheduler();
  await worker.stop();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await worker.start();
