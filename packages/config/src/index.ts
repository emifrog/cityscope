import { z } from 'zod';

export type Env = Readonly<Record<string, string | undefined>>;

// Distinct environments with their own database, buckets and keys (architecture §26).
const APP_ENVS = ['development', 'test', 'integration', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * Application processes must connect with their dedicated, least-privileged
 * role — never postgres, supabase_admin or a service role. Accepts the bare
 * role, a per-environment login (etare_api_prod) or the pooler form
 * (etare_api.<project-ref>).
 */
export function assertDedicatedDatabaseRole(connectionString: string, role: 'etare_api' | 'etare_worker'): string {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(`Invalid database URL for ${role}.`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`Database URL for ${role} must use the postgres protocol.`);
  }
  const user = decodeURIComponent(url.username);
  if (!new RegExp(`^${role}([._][A-Za-z0-9_]+)?$`).test(user)) {
    throw new Error(`Database URL must use the dedicated ${role} login (got "${user || 'none'}").`);
  }
  return connectionString;
}

const appEnvSchema = z.enum(APP_ENVS).default('development');

const authSchema = z.object({
  SUPABASE_URL: z.url(),
  /** Defaults to {SUPABASE_URL}/auth/v1. */
  AUTH_ISSUER: z.url().optional(),
  /** Defaults to {AUTH_ISSUER}/.well-known/jwks.json (asymmetric keys only). */
  AUTH_JWKS_URL: z.url().optional(),
  AUTH_AUDIENCE: z.string().min(1).default('authenticated'),
});

const apiEnvSchema = authSchema.extend({
  APP_ENV: appEnvSchema,
  DATABASE_URL: z.string().min(1),
  /** Server-side only: signs short-lived download URLs after authorization (storage gateway). */
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
});

export interface ApiEnv {
  readonly appEnv: AppEnv;
  readonly databaseUrl: string;
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string | undefined;
  readonly auth: { readonly issuer: string; readonly jwksUrl: string; readonly audience: string };
}

export function readApiEnv(env: Env): ApiEnv {
  const parsed = apiEnvSchema.parse(env);
  const issuer = parsed.AUTH_ISSUER ?? `${parsed.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: assertDedicatedDatabaseRole(parsed.DATABASE_URL, 'etare_api'),
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseSecretKey: parsed.SUPABASE_SECRET_KEY,
    auth: {
      issuer,
      jwksUrl: parsed.AUTH_JWKS_URL ?? `${issuer}/.well-known/jwks.json`,
      audience: parsed.AUTH_AUDIENCE,
    },
  };
}

const workerEnvSchema = z.object({
  APP_ENV: appEnvSchema,
  WORKER_DATABASE_URL: z.string().min(1),
  WORKER_ID: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,64}$/)
    .optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  WORKER_LEASE_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(2),
});

export interface WorkerEnv {
  readonly appEnv: AppEnv;
  readonly databaseUrl: string;
  readonly workerId: string | undefined;
  readonly pollIntervalMs: number;
  readonly leaseSeconds: number;
  readonly concurrency: number;
}

export function readWorkerEnv(env: Env): WorkerEnv {
  const parsed = workerEnvSchema.parse(env);
  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: assertDedicatedDatabaseRole(parsed.WORKER_DATABASE_URL, 'etare_worker'),
    workerId: parsed.WORKER_ID,
    pollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
    leaseSeconds: parsed.WORKER_LEASE_SECONDS,
    concurrency: parsed.WORKER_CONCURRENCY,
  };
}

/** Values exposed to the browser. Publishable by design: never put a secret here. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});
export type PublicEnv = z.infer<typeof publicEnvSchema>;
