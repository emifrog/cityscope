import {
  IgnCartographyCatalog,
  IgnGeocoder,
  PostgresHealthProbe,
  PostgresSessionFactory,
  SupabaseIdentityProvisioner,
  SupabaseObjectStorage,
  createLogger,
  createPool,
  createSupabaseTokenVerifier,
} from '@etare/adapters';
import { readApiEnv, type Env } from '@etare/config';
import { buildOpenApiDocument } from '@etare/contracts/openapi';
import type { ApiDependencies } from './app';

/** Wires the real adapters from the environment (fails fast on a missing or unsafe configuration). */
export function createApiDependencies(env: Env): ApiDependencies {
  const config = readApiEnv(env);
  const version = env['APP_VERSION'] ?? 'dev';
  const pool = createPool({ connectionString: config.databaseUrl, applicationName: 'etare-api' });
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
    logger: createLogger({ component: 'api', version, env: config.appEnv }),
    version,
    openApiDocument: () => (openApi ??= buildOpenApiDocument()),
  };
}
