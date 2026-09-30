/**
 * Generates packages/contracts/openapi.json from the endpoint contracts.
 * `--check` fails when the committed document is out of date (used by CI).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApiDocument } from '@etare/contracts/openapi';

const target = resolve(import.meta.dirname, '../packages/contracts/openapi.json');
const generated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing file: reported below as drift.
  }
  if (current.replace(/\r\n/g, '\n') !== generated) {
    console.error('packages/contracts/openapi.json is out of date: run `pnpm contracts:generate`.');
    process.exit(1);
  }
  console.log('OpenAPI document is up to date.');
} else {
  writeFileSync(target, generated);
  console.log(`Wrote ${target}`);
}
