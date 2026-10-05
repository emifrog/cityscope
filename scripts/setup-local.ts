/**
 * Generates the local environment files from the running local Supabase stack:
 *   .env.local           (API, worker, integration tests)
 *   apps/web/.env.local  (Next.js loads env files from its own directory)
 * Both are gitignored. Local development only: never point these at a shared environment.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ed25519Signer, parseSignedKeyset, signKeyset } from '@etare/adapters/crypto';
import type { KeysetDocument } from '@etare/contracts';
import type { Keyset } from '@etare/domain';

const root = resolve(import.meta.dirname, '..');

function supabaseStatus(): Record<string, string> {
  let output: string;
  try {
    output = execFileSync('supabase', ['status', '-o', 'env'], {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    console.error('Local Supabase is not running: start it with `pnpm db:start`.');
    process.exit(1);
  }
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

const status = supabaseStatus();
const apiUrl = status['API_URL'];
const publishableKey = status['PUBLISHABLE_KEY'];
const dbUrl = status['DB_URL'];
const secretKey = status['SECRET_KEY'];
if (!apiUrl || !publishableKey || !dbUrl || !secretKey) {
  console.error('Unexpected `supabase status` output (API_URL, PUBLISHABLE_KEY, SECRET_KEY or DB_URL missing).');
  process.exit(1);
}

const db = new URL(dbUrl);
const roleUrl = (role: string, password: string) =>
  `postgresql://${role}:${password}@${db.hostname}:${db.port}${db.pathname}`;

// Never silently replace a configuration that targets another (e.g. hosted) project.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** A value of the current .env.local (kept from one run to the next), never one of a remote project. */
function previousValue(name: string): string | undefined {
  const file = resolve(root, '.env.local');
  if (!existsSync(file) || targetsRemoteProject(file)) return undefined;
  const raw = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(file, 'utf8'))?.[1]?.trim();
  return raw?.replace(/^'(.*)'$/, '$1');
}

/**
 * Local distribution keys (ADR-015): kept from one run to the next, so that
 * enrolled terminals and installed packages stay valid. Local development only.
 */
function localSigningKey(name: string): Ed25519Signer {
  const existing = previousValue(name);
  if (existing) {
    signingKeys.set(name, existing);
    return Ed25519Signer.fromPkcs8(existing);
  }
  const { signer, privateKey } = Ed25519Signer.generate();
  signingKeys.set(name, privateKey);
  return signer;
}
const signingKeys = new Map<string, string>();
const publicationKey = localSigningKey('PUBLICATION_SIGNING_KEY');
const catalogKey = localSigningKey('CATALOG_SIGNING_KEY');
// Root key of the key set (SEC-04, ADR-027). Elsewhere it stays offline, with the key ceremony
// (`pnpm keys`); locally it lives here so that the key set can be signed again.
const rootKey = localSigningKey('LOCAL_ROOT_SIGNING_KEY');
const trustedKeys = `publication:${publicationKey.keyId}:${publicationKey.publicKey};catalog:${catalogKey.keyId}:${catalogKey.publicKey}`;
const rootKeys = `root:${rootKey.keyId}:${rootKey.publicKey}`;

/**
 * The local key set: the publication and catalogue keys active. Kept while they do not change;
 * otherwise the next sequence, the former keys retired (a tablet installed earlier still reads
 * what they signed).
 */
function localKeyset(): string {
  const current = [
    { purpose: 'publication' as const, signer: publicationKey },
    { purpose: 'catalog' as const, signer: catalogKey },
  ];
  let previous: Keyset | null = null;
  try {
    const raw = previousValue('DISTRIBUTION_KEYSET');
    previous = raw ? parseSignedKeyset(raw).keyset : null;
  } catch {
    previous = null;
  }
  const unchanged =
    previous !== null &&
    current.every(({ purpose, signer }) =>
      previous?.keys.some((key) => key.purpose === purpose && key.key_id === signer.keyId && key.status === 'active'),
    );
  const raw = previousValue('DISTRIBUTION_KEYSET');
  if (unchanged && raw) return raw;
  const retired = (previous?.keys ?? [])
    .filter((key) => !current.some(({ signer }) => signer.keyId === key.key_id))
    .map((key) => ({ ...key, status: key.status === 'revoked' ? ('revoked' as const) : ('retired' as const) }));
  const keyset: KeysetDocument = {
    keyset_version: 1,
    sequence: (previous?.sequence ?? 0) + 1,
    issued_at: new Date().toISOString(),
    keys: [
      ...current.map(({ purpose, signer }) => ({
        purpose,
        key_id: signer.keyId,
        public_key: signer.publicKey,
        status: 'active' as const,
      })),
      ...retired,
    ],
  };
  return JSON.stringify(signKeyset(keyset, rootKey));
}
const distributionKeyset = localKeyset();

// Role passwords come from supabase/seed.sql (local-only values).
const content = `# Generated by \`pnpm setup:local\` — LOCAL DEVELOPMENT ONLY, never commit.
APP_ENV=development
NEXT_PUBLIC_SUPABASE_URL=${apiUrl}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishableKey}
SUPABASE_URL=${apiUrl}
# Server-side only (storage gateway and file verification): never in a NEXT_PUBLIC_ variable.
SUPABASE_SECRET_KEY=${secretKey}
DATABASE_URL=${roleUrl('etare_api', 'etare_api_local_only')}
WORKER_DATABASE_URL=${roleUrl('etare_worker', 'etare_worker_local_only')}
LOCAL_DATABASE_ADMIN_URL=${dbUrl}
# Offline distribution (ADR-015), local keys: the worker signs manifests, the API signs catalogues.
# Terminals trust the public keys: ${trustedKeys}
PUBLICATION_SIGNING_KEY=${signingKeys.get('PUBLICATION_SIGNING_KEY') ?? ''}
CATALOG_SIGNING_KEY=${signingKeys.get('CATALOG_SIGNING_KEY') ?? ''}
# Key set served to the tablets (SEC-04, ADR-027), signed by the local root key; the tablets embed
# its public key. Never on a server: LOCAL_ROOT_SIGNING_KEY (local development only).
LOCAL_ROOT_SIGNING_KEY=${signingKeys.get('LOCAL_ROOT_SIGNING_KEY') ?? ''}
DISTRIBUTION_ROOT_KEYS=${rootKeys}
DISTRIBUTION_KEYSET='${distributionKeyset}'
# Notifications of the exploitant portal (POR-05): Mailpit of the local stack, read on http://127.0.0.1:54324.
SMTP_URL=smtp://127.0.0.1:54325
APP_BASE_URL=http://localhost:3000
`;

function targetsRemoteProject(file: string): boolean {
  if (!existsSync(file)) return false;
  return [...readFileSync(file, 'utf8').matchAll(/^[A-Z_]+=\s*((?:https?|postgres(?:ql)?):\/\/\S+)/gm)].some(
    ([, url]) => {
      try {
        return !LOCAL_HOSTS.has(new URL(url ?? '').hostname);
      } catch {
        return false;
      }
    },
  );
}

const force = process.argv.includes('--force');
for (const target of ['.env.local', 'apps/web/.env.local']) {
  const file = resolve(root, target);
  if (!force && targetsRemoteProject(file)) {
    console.warn(`Skipped ${target}: it targets a non-local project. Re-run with --force to overwrite it.`);
    continue;
  }
  writeFileSync(file, content, { mode: 0o600 });
  console.log(`Wrote ${target}`);
}

// OPS application (Android emulator: the host machine is 10.0.2.2). Ignored by git; values set by
// hand (API address of a physical device, ENV) are kept, the local keys and ports are refreshed.
const mobileFile = resolve(root, 'apps/mobile/dart_defines.local.json');
const mobileDefines = existsSync(mobileFile)
  ? (JSON.parse(readFileSync(mobileFile, 'utf8')) as Record<string, string>)
  : {};
const authUrl = new URL(mobileDefines['AUTH_URL'] ?? 'http://10.0.2.2/auth/v1');
authUrl.port = new URL(apiUrl).port;
const mobile = {
  ENV: 'dev',
  API_BASE_URL: 'http://10.0.2.2:3000/api/v1',
  ...mobileDefines,
  AUTH_URL: authUrl.toString().replace(/\/$/, ''),
  AUTH_PUBLISHABLE_KEY: publishableKey,
  // Root of the key sets (SEC-04) first; the service keys serve the first contact only.
  TRUSTED_SIGNING_KEYS: `${rootKeys};${trustedKeys}`,
};
writeFileSync(mobileFile, `${JSON.stringify(mobile, null, 2)}\n`);
console.log('Wrote apps/mobile/dart_defines.local.json');
