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

/** Shared environments distribute to terminals: their signing keys are mandatory (ADR-015). */
function requiredOutsideDevelopment(
  appEnv: AppEnv,
  name: string,
  value: string | undefined,
  purpose = 'offline distribution',
): void {
  if ((appEnv === 'staging' || appEnv === 'production') && !value) {
    throw new Error(`${name} is required in ${appEnv} (${purpose}).`);
  }
}

/**
 * Source of the offline base maps of the tablets (ADR-024): the synthetic test map, the Plan
 * IGN through the flow agreed with the IGN, or none. The synthetic map is never a real map:
 * refused in production; it is the default of the development and test environments.
 */
export const BASEMAP_SOURCES = ['synthetic', 'ign-plan-vector', 'none'] as const;
export type BasemapSourceId = Exclude<(typeof BASEMAP_SOURCES)[number], 'none'>;
const basemapSourceSchema = z.enum(BASEMAP_SOURCES).optional();

function basemapSourceSetting(
  appEnv: AppEnv,
  value: (typeof BASEMAP_SOURCES)[number] | undefined,
): BasemapSourceId | null {
  const chosen = value ?? (appEnv === 'staging' || appEnv === 'production' ? 'none' : 'synthetic');
  if (chosen === 'synthetic' && appEnv === 'production') {
    throw new Error('BASEMAP_SOURCE=synthetic is a test map: refused in production.');
  }
  return chosen === 'none' ? null : chosen;
}

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
  /** Server-side only: Ed25519 key (PKCS#8 DER, base64) signing the catalogues of the terminals. */
  CATALOG_SIGNING_KEY: z.string().min(1).optional(),
  /** Oldest OPS application (x.y.z) allowed to install publications (SYN-02); unset: no minimum. */
  MOBILE_MIN_APP_VERSION: z
    .string()
    .regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'MOBILE_MIN_APP_VERSION must look like 1.2.0')
    .optional(),
  /** Rate limiting of the API (SEC-03): 'on' by default; 'off' only for automated tests. */
  RATE_LIMITS: z.enum(['on', 'off']).default('on'),
  /**
   * Trusted reverse proxies in front of the web server: the client address is the entry of
   * X-Forwarded-For that many positions from the right. 0 (default): unknown, since Next.js
   * keeps an X-Forwarded-For sent by the client itself.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Other origins allowed to call the API from a browser (comma-separated); none by default. */
  ALLOWED_ORIGINS: z.string().optional(),
  /** Source of the offline base maps (ADR-024); the worker reads the same setting. */
  BASEMAP_SOURCE: basemapSourceSchema,
});

export interface ApiEnv {
  readonly appEnv: AppEnv;
  readonly databaseUrl: string;
  readonly supabaseUrl: string;
  readonly supabaseSecretKey: string | undefined;
  /** Null when offline distribution is not configured (terminal endpoints answer 503). */
  readonly catalogSigningKey: string | null;
  /** Minimum OPS application version announced in the signed catalogues (null: none). */
  readonly minAppVersion: string | null;
  readonly auth: { readonly issuer: string; readonly jwksUrl: string; readonly audience: string };
  readonly rateLimits: boolean;
  readonly trustedProxyHops: number;
  readonly allowedOrigins: readonly string[];
  /** Source of the offline base maps; null: none on this platform. */
  readonly basemapSource: BasemapSourceId | null;
}

export function readApiEnv(env: Env): ApiEnv {
  const parsed = apiEnvSchema.parse(env);
  requiredOutsideDevelopment(parsed.APP_ENV, 'CATALOG_SIGNING_KEY', parsed.CATALOG_SIGNING_KEY);
  const issuer = parsed.AUTH_ISSUER ?? `${parsed.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: assertDedicatedDatabaseRole(parsed.DATABASE_URL, 'etare_api'),
    supabaseUrl: parsed.SUPABASE_URL,
    supabaseSecretKey: parsed.SUPABASE_SECRET_KEY,
    catalogSigningKey: parsed.CATALOG_SIGNING_KEY ?? null,
    minAppVersion: parsed.MOBILE_MIN_APP_VERSION ?? null,
    rateLimits: parsed.RATE_LIMITS === 'on',
    trustedProxyHops: parsed.TRUSTED_PROXY_HOPS,
    allowedOrigins: (parsed.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => new URL(origin).origin),
    basemapSource: basemapSourceSetting(parsed.APP_ENV, parsed.BASEMAP_SOURCE),
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
  /** Object storage access for file verification (server-side secret, never exposed). */
  SUPABASE_URL: z.url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  /** Ed25519 key (PKCS#8 DER, base64) signing the manifests of publications (never given to the API). */
  PUBLICATION_SIGNING_KEY: z.string().min(1).optional(),
  /** ClamAV daemon checking every uploaded file, `tcp://host:3310` (SEC-01). */
  ANTIVIRUS_URL: z
    .string()
    .regex(/^tcp:\/\/[^/\s]+:\d{1,5}$/, 'ANTIVIRUS_URL must look like tcp://host:3310')
    .optional(),
  /** Mail server of the notifications, `smtp://host:port` or `smtps://user:password@host:port` (POR-05). */
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\/\S+$/, 'SMTP_URL must look like smtp://host:587')
    .optional(),
  /** Sender of the notifications. */
  MAIL_FROM: z.string().min(3).max(200).default('FireScape <ne-pas-repondre@firescape.invalid>'),
  /** Public address of the web application, for the links of the notifications. */
  APP_BASE_URL: z.url().optional(),
  /** Source of the offline base maps (ADR-024), the same as the API. */
  BASEMAP_SOURCE: basemapSourceSchema,
  /** Contact of the operator, sent to the IGN with each request of the agreed flow. */
  BASEMAP_CONTACT: z.string().min(3).max(200).optional(),
  /** Pace of the requests to the source of the base maps. */
  BASEMAP_REQUESTS_PER_SECOND: z.coerce.number().min(0.1).max(50).default(4),
});

export interface WorkerEnv {
  readonly appEnv: AppEnv;
  readonly databaseUrl: string;
  readonly workerId: string | undefined;
  readonly pollIntervalMs: number;
  readonly leaseSeconds: number;
  readonly concurrency: number;
  /** Null when the worker cannot reach the object storage (file verification disabled). */
  readonly storage: { readonly url: string; readonly secretKey: string } | null;
  /** Null when publications are built without a signature (not distributable offline). */
  readonly publicationSigningKey: string | null;
  /** Null in development only: files are then checked without antivirus (said at startup). */
  readonly antivirusUrl: string | null;
  /** Null when no mail server is configured: notifications fail visibly and can be replayed. */
  readonly mail: { readonly smtpUrl: string; readonly from: string; readonly appBaseUrl: string } | null;
  /** Source of the offline base maps; null: none. */
  readonly basemap: {
    readonly source: BasemapSourceId;
    readonly contact: string | null;
    readonly requestsPerSecond: number;
  } | null;
}

export function readWorkerEnv(env: Env): WorkerEnv {
  const parsed = workerEnvSchema.parse(env);
  requiredOutsideDevelopment(parsed.APP_ENV, 'PUBLICATION_SIGNING_KEY', parsed.PUBLICATION_SIGNING_KEY);
  // A file is never admitted without antivirus outside development (SEC-01).
  requiredOutsideDevelopment(parsed.APP_ENV, 'ANTIVIRUS_URL', parsed.ANTIVIRUS_URL, 'antivirus of uploaded files');
  const basemapSource = basemapSourceSetting(parsed.APP_ENV, parsed.BASEMAP_SOURCE);
  if (basemapSource === 'ign-plan-vector' && !parsed.BASEMAP_CONTACT) {
    throw new Error(
      'BASEMAP_CONTACT is required with BASEMAP_SOURCE=ign-plan-vector (identification agreed with the IGN).',
    );
  }
  return {
    appEnv: parsed.APP_ENV,
    databaseUrl: assertDedicatedDatabaseRole(parsed.WORKER_DATABASE_URL, 'etare_worker'),
    workerId: parsed.WORKER_ID,
    pollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
    leaseSeconds: parsed.WORKER_LEASE_SECONDS,
    concurrency: parsed.WORKER_CONCURRENCY,
    storage:
      parsed.SUPABASE_URL && parsed.SUPABASE_SECRET_KEY
        ? { url: parsed.SUPABASE_URL, secretKey: parsed.SUPABASE_SECRET_KEY }
        : null,
    publicationSigningKey: parsed.PUBLICATION_SIGNING_KEY ?? null,
    antivirusUrl: parsed.ANTIVIRUS_URL ?? null,
    mail:
      parsed.SMTP_URL && parsed.APP_BASE_URL
        ? { smtpUrl: parsed.SMTP_URL, from: parsed.MAIL_FROM, appBaseUrl: parsed.APP_BASE_URL }
        : null,
    basemap: basemapSource
      ? {
          source: basemapSource,
          contact: parsed.BASEMAP_CONTACT ?? null,
          requestsPerSecond: parsed.BASEMAP_REQUESTS_PER_SECOND,
        }
      : null,
  };
}

/** Values exposed to the browser. Publishable by design: never put a secret here. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});
export type PublicEnv = z.infer<typeof publicEnvSchema>;
