/**
 * Generates the FireScape identity assets of the web back-office and of the
 * mobile application from the vector masters in assets/brand/ (see its README).
 *
 *   pnpm brand:assets
 *
 * The masters are the SVG files of the brand pack (version 2.0): every output
 * is rasterised straight from the right variant, at the size it is displayed
 * (three times that size for dense screens). Outputs are committed; re-run
 * only after replacing a master.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import sharp, { type Sharp } from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const MASTERS = resolve(ROOT, 'assets/brand');
const WEB = resolve(ROOT, 'apps/web/src');
const MOBILE = resolve(ROOT, 'apps/mobile');

const NAVY = '#012B5C';
const TEAL = '#0E8A7A';
const WHITE = '#FFFFFF';

/** A master, optionally recoloured (the masters are flat fills, so the SVG text is rewritten). */
async function master(path: string, recolor: Record<string, string> = {}): Promise<Buffer> {
  let svg = await readFile(resolve(MASTERS, path), 'utf8');
  for (const [from, to] of Object.entries(recolor)) svg = svg.replaceAll(`fill="${from}"`, `fill="${to}"`);
  return Buffer.from(svg);
}

/** Rasterises an SVG at the resolution of `size` (never upscaled from its nominal size), then fits it exactly. */
async function render(svg: Buffer, size: { width?: number; height?: number }): Promise<Sharp> {
  const { width = 1, height = 1 } = await sharp(svg).metadata();
  const scale = Math.max(size.width ? size.width / width : 0, size.height ? size.height / height : 0);
  return sharp(svg, { density: 72 * scale }).resize({ ...size, fit: 'inside' });
}

/** Rounded corners (legacy Android launcher icon, drawn as is by the launcher). */
async function rounded(image: Sharp, size: number): Promise<Sharp> {
  const radius = Math.round(size * 0.2);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="#ffffff"/></svg>`,
  );
  return sharp(
    await image
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer(),
  );
}

async function write(path: string, image: Sharp) {
  await mkdir(dirname(path), { recursive: true });
  await image.png({ compressionLevel: 9 }).toFile(path);
  console.log(`  ${relative(ROOT, path)}`);
}

const favicon = await master('icons/favicon.svg');
const appIcon = await master('icons/firescape-app-icon.svg');
const foreground = await master('icons/firescape-adaptive-foreground.svg');
const foregroundMono = await master('icons/firescape-adaptive-foreground.svg', { [TEAL]: WHITE });

console.log('Web');
// Favicon (simplified mark on navy, drawn for 16 to 32 px) and Apple touch icon (opaque square).
await write(resolve(WEB, 'app/icon.png'), await render(favicon, { width: 192, height: 192 }));
await write(
  resolve(WEB, 'app/apple-icon.png'),
  (await render(appIcon, { width: 180, height: 180 })).flatten({ background: NAVY }),
);
// Sign-in card, 48 px high: horizontal signature (the tagline is live text under it).
await write(
  resolve(WEB, 'assets/brand/firescape-logo.png'),
  await render(await master('svg/firescape-horizontal-color.svg'), { height: 144 }),
);
// Navy header bars, 32 px high: compact signature (simplified mark), drawn for small sizes.
await write(
  resolve(WEB, 'assets/brand/firescape-logo-inverse.png'),
  await render(await master('svg/firescape-compact-inverse.svg'), { height: 96 }),
);

console.log('Mobile');
// Sign-in screen (light) and splash screen (navy), about 220 dp wide: vertical signature with the baseline.
await write(
  resolve(MOBILE, 'assets/brand/firescape-logo.png'),
  await render(await master('svg/firescape-vertical-color.svg'), { width: 660 }),
);
await write(
  resolve(MOBILE, 'assets/brand/firescape-logo-inverse.png'),
  await render(await master('svg/firescape-vertical-inverse.svg'), { width: 660 }),
);

// Android: legacy icon (API < 26) and adaptive icon layers (108 dp; the pack keeps the mark inside
// the 66 dp safe zone whatever the launcher mask; the navy background is values/colors.xml).
const ANDROID_RES = resolve(MOBILE, 'android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, factor] of Object.entries(DENSITIES)) {
  const folder = resolve(ANDROID_RES, `mipmap-${density}`);
  const legacy = 48 * factor;
  const layer = { width: 108 * factor, height: 108 * factor };
  await write(
    resolve(folder, 'ic_launcher.png'),
    await rounded(await render(appIcon, { width: legacy, height: legacy }), legacy),
  );
  await write(resolve(folder, 'ic_launcher_foreground.png'), await render(foreground, layer));
  await write(resolve(folder, 'ic_launcher_monochrome.png'), await render(foregroundMono, layer));
}

// iOS: opaque square icons (the system draws the rounded corners).
const APP_ICON = resolve(MOBILE, 'ios/Runner/Assets.xcassets/AppIcon.appiconset');
const contents = JSON.parse(await readFile(resolve(APP_ICON, 'Contents.json'), 'utf8')) as {
  images: { size: string; scale: string; filename?: string }[];
};
const written = new Set<string>();
for (const { size, scale, filename } of contents.images) {
  if (!filename || written.has(filename)) continue;
  written.add(filename);
  const pixels = Math.round(Number.parseFloat(size) * Number.parseFloat(scale));
  await write(
    resolve(APP_ICON, filename),
    (await render(appIcon, { width: pixels, height: pixels })).flatten({ background: NAVY }),
  );
}
