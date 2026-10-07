import { createHash, randomBytes } from 'node:crypto';
import {
  ApiMetrics,
  basemapSourceInfo,
  IgnCartographyCatalog,
  IgnGeocoder,
  PostgresHealthProbe,
  PostgresPlatformMetrics,
  PostgresRateLimiter,
  PostgresSecurityEventRecorder,
  PostgresSessionFactory,
  SupabaseIdentityProvisioner,
  SupabaseObjectStorage,
  createLogger,
  createPool,
  createSupabaseTokenVerifier,
  deviceSignatureVerifier,
  lazySigner,
  loadKeyset,
  openSigner,
} from '@etare/adapters';
import type { LoadedKeyset } from '@etare/application';
import { readApiEnv, type Env } from '@etare/config';
import { ServiceUnavailable } from '@etare/domain';
import { buildOpenApiDocument } from '@etare/contracts/openapi';
import type { ApiDependencies } from './app';

/** Wires the real adapters from the environment (fails fast on a missing or unsafe configuration). */
export function createApiDependencies(env: Env): ApiDependencies {
  const config = readApiEnv(env);
  const version = config.version;
  const logger = createLogger({ component: 'api', version, env: config.appEnv }, { level: config.logLevel });
  const pool = createPool({
    connectionString: config.databaseUrl,
    applicationName: 'etare-api',
    onIdleError: (error) => logger.warn('idle database connection lost', { error: error.message }),
  });
  let openApi: unknown;
  // Key set served to the terminals (SEC-04, ADR-027): read and checked once, at first use.
  let keysetLoading: Promise<LoadedKeyset | null> | null = null;
  const keyset = () =>
    (keysetLoading ??= loadKeyset(config.keyset).catch((error: unknown) => {
      keysetLoading = null;
      logger.error('distribution key set unusable', { error: error instanceof Error ? error.message : String(error) });
      throw new ServiceUnavailable('Jeu de clés de distribution inutilisable.');
    }));
  const catalogSigning = config.catalogSigning;
  return {
    sessions: new PostgresSessionFactory(pool),
    tokens: createSupabaseTokenVerifier(config.auth),
    health: new PostgresHealthProbe(pool),
    // Storage gateway: server-side secret key, only used after an authorization check in PostgreSQL.
    storage: config.supabaseSecretKey
      ? SupabaseObjectStorage.fromSecretKey(config.supabaseUrl, config.supabaseSecretKey)
      : null,
    // Invitations: identities are created with the same server-side secret key.
    identities: config.supabaseSecretKey
      ? SupabaseIdentityProvisioner.fromSecretKey(config.supabaseUrl, config.supabaseSecretKey)
      : null,
    cartography: new IgnCartographyCatalog(),
    // Base maps of the tablets: product and rights of the configured source (ADR-024).
    basemapSource: basemapSourceInfo(config.basemapSource),
    geocoder: new IgnGeocoder(),
    sha256: async (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
    // Catalogue key: server-side only, active in the key set the terminals trust (ADR-015, SEC-04).
    catalogSigner: catalogSigning
      ? lazySigner(async () => {
          try {
            return await openSigner(catalogSigning, 'catalog', (await keyset())?.keyset ?? null);
          } catch (error) {
            logger.error('catalogue signing key unusable', {
              source: catalogSigning.kind,
              error: error instanceof Error ? error.message : String(error),
            });
            throw new ServiceUnavailable('Signature des catalogues indisponible.');
          }
        })
      : null,
    keyset,
    minAppVersion: config.minAppVersion,
    verifier: deviceSignatureVerifier,
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
    now: () => new Date(),
    logger,
    version,
    openApiDocument: () => (openApi ??= buildOpenApiDocument()),
    // SEC-03: counters and refusals in PostgreSQL, outside the transaction of the request.
    rateLimiter: config.rateLimits ? new PostgresRateLimiter(pool) : null,
    securityEvents: new PostgresSecurityEventRecorder(pool),
    trustedProxyHops: config.trustedProxyHops,
    allowedOrigins: config.allowedOrigins,
    // EXP-03: latency per route, SQL pool, and the figures of the platform read at each scrape.
    metrics: new ApiMetrics({ component: 'api', version, pool, platform: new PostgresPlatformMetrics(pool) }),
    metricsToken: config.metricsToken,
  };
}
