/**
 * Generates the FireScape identity assets of the web back-office and of the
 * mobile application from the masters in assets/brand/ (see its README).
 *
 *   pnpm brand:assets
 *
 * The masters are flat renders on a white background: white becomes
 * transparent (anti-aliased edges are un-blended so they stay clean on any
 * background), and navy becomes white for the variants shown on the navy
 * bars. Outputs are committed; re-run only after replacing a master.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import sharp, { type Sharp } from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const MASTERS = resolve(ROOT, 'assets/brand');
const WEB = resolve(ROOT, 'apps/web/src');
const MOBILE = resolve(ROOT, 'apps/mobile');

/** Below this distance from white a pixel is paper, above `INK` it is fully opaque. */
const PAPER = 24;
const INK = 200;
/** Horizontal master: the tagline (right of the mark, under the wordmark) is set as live text. */
const HORIZONTAL_TAGLINE = { left: 440, top: 647 };

interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

const clamp = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

async function readMaster(name: string): Promise<Rgba> {
  const { data, info } = await sharp(resolve(MASTERS, name)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0, q = 0; p < data.length; p += 3, q += 4) {
    const rgb = [data.readUInt8(p), data.readUInt8(p + 1), data.readUInt8(p + 2)];
    const alpha = Math.min(1, Math.max(0, (255 - Math.min(...rgb) - PAPER) / (INK - PAPER)));
    if (alpha === 0) continue;
    rgb.forEach((value, c) => out.writeUInt8(clamp((value - 255 * (1 - alpha)) / alpha), q + c));
    out.writeUInt8(clamp(alpha * 255), q + 3);
  }
  return { data: out, width: info.width, height: info.height };
}

function erase(image: Rgba, { left, top }: { left: number; top: number }): Rgba {
  for (let y = top; y < image.height; y += 1) {
    for (let x = left; x < image.width; x += 1) image.data.writeUInt8(0, (y * image.width + x) * 4 + 3);
  }
  return image;
}

/** Crops to the visible pixels. */
function trim(image: Rgba): Rgba {
  let [left, top, right, bottom] = [image.width, image.height, -1, -1];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.data.readUInt8((y * image.width + x) * 4 + 3) === 0) continue;
      [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
    }
  }
  const width = right - left + 1;
  const height = bottom - top + 1;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    image.data.copy(
      data,
      y * width * 4,
      ((top + y) * image.width + left) * 4,
      ((top + y) * image.width + right + 1) * 4,
    );
  }
  return { data, width, height };
}

/** Same shapes, other colors: `navy` replaces the blue pixels, `orange` the others (unchanged if omitted). */
function recolor(image: Rgba, { navy, orange }: { navy: number[]; orange?: number[] }): Rgba {
  const data = Buffer.from(image.data);
  for (let q = 0; q < data.length; q += 4) {
    if (data.readUInt8(q + 3) === 0) continue;
    const color = data.readUInt8(q + 2) > data.readUInt8(q) ? navy : orange;
    color?.forEach((value, c) => data.writeUInt8(value, q + c));
  }
  return { ...image, data };
}

const WHITE = [255, 255, 255];
const raw = (image: Rgba) => sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } });

async function write(path: string, image: Sharp) {
  await mkdir(dirname(path), { recursive: true });
  await image.png({ compressionLevel: 9 }).toFile(path);
  console.log(`  ${relative(ROOT, path)}`);
}

const scaled = (image: Rgba, size: { width?: number; height?: number }) =>
  raw(image).resize({ ...size, kernel: 'lanczos3' });

/** Square icon: the mark centered on `scale` of the side, over a plate (white square, rounded or not) or nothing. */
async function icon(mark: Rgba, size: number, options: { scale: number; plate?: 'square' | 'rounded' }) {
  const box = Math.round(size * options.scale);
  const glyph = await raw(mark).resize({ width: box, height: box, fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  const radius = options.plate === 'rounded' ? Math.round(size * 0.22) : 0;
  const plate = options.plate
    ? Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
          `<rect width="${size}" height="${size}" rx="${radius}" fill="#ffffff"/></svg>`,
      )
    : null;
  const base = sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
  });
  return sharp(
    await base
      .composite([...(plate ? [{ input: plate }] : []), { input: glyph, gravity: 'center' }])
      .png()
      .toBuffer(),
  );
}

const mark = trim(await readMaster('firescape-mark.webp'));
const horizontal = trim(erase(await readMaster('firescape-logo-horizontal.webp'), HORIZONTAL_TAGLINE));
const stacked = trim(await readMaster('firescape-logo-stacked.webp'));

console.log('Web');
await write(resolve(WEB, 'app/icon.png'), await icon(mark, 192, { scale: 0.76, plate: 'rounded' }));
await write(
  resolve(WEB, 'app/apple-icon.png'),
  (await icon(mark, 180, { scale: 0.7, plate: 'square' })).flatten({ background: '#ffffff' }),
);
// Shown 48 px high on the sign-in card and 32 px high in the navy header (3× for dense screens).
await write(resolve(WEB, 'assets/brand/firescape-logo.png'), scaled(horizontal, { height: 144 }));
await write(
  resolve(WEB, 'assets/brand/firescape-logo-inverse.png'),
  scaled(recolor(horizontal, { navy: WHITE }), { height: 96 }),
);

console.log('Mobile');
// Shown about 220 dp wide on the sign-in screen and the splash screen (3×).
await write(resolve(MOBILE, 'assets/brand/firescape-logo.png'), scaled(stacked, { width: 660 }));
await write(
  resolve(MOBILE, 'assets/brand/firescape-logo-inverse.png'),
  scaled(recolor(stacked, { navy: WHITE }), { width: 660 }),
);

// Android: legacy icon (API < 26) and adaptive icon layers (108 dp; the mark stays
// inside the 66 dp safe circle whatever the launcher mask).
const ANDROID_RES = resolve(MOBILE, 'android/app/src/main/res');
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, factor] of Object.entries(DENSITIES)) {
  const folder = resolve(ANDROID_RES, `mipmap-${density}`);
  await write(resolve(folder, 'ic_launcher.png'), await icon(mark, 48 * factor, { scale: 0.72, plate: 'rounded' }));
  await write(resolve(folder, 'ic_launcher_foreground.png'), await icon(mark, 108 * factor, { scale: 0.42 }));
  await write(
    resolve(folder, 'ic_launcher_monochrome.png'),
    await icon(recolor(mark, { navy: WHITE, orange: WHITE }), 108 * factor, { scale: 0.42 }),
  );
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
    (await icon(mark, pixels, { scale: 0.7, plate: 'square' })).flatten({ background: '#ffffff' }),
  );
}
