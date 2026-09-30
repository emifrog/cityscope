/**
 * Runs a command with the variables of an env file, which take precedence over
 * the .env.local files (Next.js never overrides variables already present in
 * the environment). Used by `pnpm dev:integration`.
 *
 *   tsx scripts/with-env.ts .env.integration -- <command> [args...]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [file, separator, executable, ...args] = process.argv.slice(2);
if (!file || separator !== '--' || !executable) {
  console.error('usage: tsx scripts/with-env.ts <env-file> -- <command> [args...]');
  process.exit(1);
}

const path = resolve(process.cwd(), file);
if (!existsSync(path)) {
  console.error(`${file} not found (see docs/development.md, "Environnement d'intégration partagé").`);
  process.exit(1);
}
process.loadEnvFile(path);

// Windows needs a shell to run .cmd shims (pnpm, npx): quote arguments so that the shell keeps them intact.
const quote = (value: string) => (/^[\w@%+=:,./-]+$/.test(value) ? value : `"${value.replace(/"/g, '\\"')}"`);
const child =
  process.platform === 'win32'
    ? spawn([executable, ...args].map(quote).join(' '), { stdio: 'inherit', shell: true, env: process.env })
    : spawn(executable, args, { stdio: 'inherit', env: process.env });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
