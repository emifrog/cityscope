/**
 * Generates the local ES256 JWT signing key used by the local Supabase Auth
 * (supabase/config.toml -> auth.signing_keys_path) if it does not exist yet.
 * The file contains a PRIVATE key: it is gitignored and must never be committed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const target = resolve(import.meta.dirname, '../supabase/signing_keys.json');

if (existsSync(target)) {
  console.log('supabase/signing_keys.json already exists, keeping it.');
} else {
  // Run outside the project: inside it, the CLI tries to read the (missing) configured key file.
  const output = execFileSync('supabase', ['gen', 'signing-key', '--algorithm', 'ES256', '--yes'], {
    cwd: tmpdir(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const jwk: unknown = JSON.parse(output.trim());
  writeFileSync(target, `${JSON.stringify([jwk], null, 2)}\n`, { mode: 0o600 });
  console.log('Generated supabase/signing_keys.json (local development only).');
}
