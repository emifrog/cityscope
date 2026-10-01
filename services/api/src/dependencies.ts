import { createHash, randomBytes } from 'node:crypto';
import {
  Ed25519Signer,
  IgnCartographyCatalog,
  IgnGeocoder,
  PostgresHealthProbe,
  PostgresSessionFactory,
  SupabaseIdentityProvisioner,
  SupabaseObjectStorage,
  createLogger,
  createPool,
  createSupabaseTokenVerifier,
  ed25519Verifier,
} from '@etare/adapters';
import { readApiEnv, type Env } from '@etare/config';
import { buildOpenApiDocument } from '@etare/contracts/openapi';
import type { ApiDependencies } from './app';

/** Wires the real adapters from the environment (fails fast on a missing or unsafe configuration). */
export function createApiDependencies(env: Env): ApiDependencies {
  const config = readApiEnv(env);
  const version = env['APP_VERSION'] ?? 'dev';
  const logger = createLogger({ component: 'api', version, env: config.appEnv });
  const pool = createPool({
    connectionString: config.databaseUrl,
    applicationName: 'etare-api',
    onIdleError: (error) => logger.warn('idle database connection lost', { error: error.message }),
  });
  let openApi: unknown;
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
    geocoder: new IgnGeocoder(),
    sha256: async (text) => createHash('sha256').update(text, 'utf8').digest('hex'),
    // Catalogue key: server-side only; terminals trust its public key (ADR-015).
    catalogSigner: config.catalogSigningKey ? Ed25519Signer.fromPkcs8(config.catalogSigningKey) : null,
    verifier: ed25519Verifier,
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
    now: () => new Date(),
    logger,
    version,
    openApiDocument: () => (openApi ??= buildOpenApiDocument()),
  };
}
