/**
 * MapLibre loads its worker next to its own module URL, which a bundler
 * rewrites. The worker and the module it imports are therefore served from
 * public/maplibre/ (same origin), copied from the installed package so that
 * their version always matches the bundled library. Output is not versioned.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist');
const target = join(import.meta.dirname, '..', 'public', 'maplibre');

mkdirSync(target, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(dist, file), join(target, file));
}
