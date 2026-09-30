/**
 * MapLibre and pdf.js load their web workers from a URL next to their own
 * module, which a bundler rewrites. The worker files are therefore served
 * from public/ (same origin), copied from the installed packages so that
 * their version always matches the bundled library. Output is not versioned.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packageDir = (name) => dirname(require.resolve(`${name}/package.json`));
const publicDir = join(import.meta.dirname, '..', 'public');

const copies = [
  {
    from: join(packageDir('maplibre-gl'), 'dist'),
    to: 'maplibre',
    files: ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'],
  },
  { from: join(packageDir('pdfjs-dist'), 'build'), to: 'pdfjs', files: ['pdf.worker.min.mjs'] },
];

for (const { from, to, files } of copies) {
  mkdirSync(join(publicDir, to), { recursive: true });
  for (const file of files) copyFileSync(join(from, file), join(publicDir, to, file));
}
