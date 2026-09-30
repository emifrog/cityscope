/**
 * Uploads the files referenced by supabase/seed.sql (demo plan background) to
 * the LOCAL storage, at the keys the seed declares. Run by `pnpm db:reset`
 * (a reset empties the storage metadata) and on demand with `pnpm seed:assets`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SupabaseObjectStorage } from '@etare/adapters/storage';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env['SUPABASE_URL'];
const secretKey = process.env['SUPABASE_SECRET_KEY'];
if (!url || !secretKey) {
  console.error('SUPABASE_URL / SUPABASE_SECRET_KEY missing: run `pnpm setup:local` first.');
  process.exit(1);
}
// Demo files never go to a shared or hosted project.
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
  console.error(`SUPABASE_URL points to ${new URL(url).hostname}: demo assets are for the local stack only.`);
  process.exit(1);
}

const SEED_ASSETS = [
  {
    file: 'supabase/seed-assets/plan-batiment-a-rdc.png',
    key: 'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000001/06000005-0000-4000-8000-0000000000a1',
    contentType: 'image/png',
  },
] as const;

const storage = SupabaseObjectStorage.fromSecretKey(url, secretKey);
for (const asset of SEED_ASSETS) {
  await storage.upload(asset.key, readFileSync(resolve(root, asset.file)), asset.contentType, { upsert: true });
  console.log(`Déposé : ${asset.file}`);
}
