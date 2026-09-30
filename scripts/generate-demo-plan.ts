/**
 * Generates the synthetic level plan used by the demo seed
 * (supabase/seed-assets/plan-batiment-a-rdc.png, 1600 × 1000 px): outer
 * walls, corridor, rooms and the two technical rooms of façade C whose
 * zones and objects are seeded in local coordinates. Pure TypeScript PNG
 * encoder: no native dependency. Re-run only when the drawing changes.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const WIDTH = 1600;
const HEIGHT = 1000;
type Rgb = readonly [number, number, number];

const pixels = Buffer.alloc(WIDTH * HEIGHT * 3, 0xff);

function fill(x0: number, y0: number, x1: number, y1: number, [r, g, b]: Rgb) {
  for (let y = Math.max(0, y0); y < Math.min(HEIGHT, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(WIDTH, x1); x += 1) {
      const offset = (y * WIDTH + x) * 3;
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
    }
  }
}

const WALL: Rgb = [51, 65, 85];
const CORRIDOR: Rgb = [241, 245, 249];
const TECHNICAL: Rgb = [254, 243, 199];
const STAIRS: Rgb = [226, 232, 240];
const wall = (x0: number, y0: number, x1: number, y1: number, thickness = 6) =>
  x0 === x1
    ? fill(x0 - thickness / 2, y0, x0 + thickness / 2, y1, WALL)
    : fill(x0, y0 - thickness / 2, x1, y0 + thickness / 2, WALL);

// Corridor and rooms.
fill(100, 450, 1500, 550, CORRIDOR);
fill(370, 240, 570, 340, TECHNICAL);
fill(1320, 560, 1490, 890, STAIRS);
for (let y = 580; y < 880; y += 24) fill(1330, y, 1480, y + 4, WALL);

// Outer walls with entrances (gaps) on façade A (south) and façade C (west).
wall(100, 100, 1500, 100, 12);
wall(100, 900, 700, 900, 12);
wall(820, 900, 1500, 900, 12);
wall(100, 100, 100, 460, 12);
wall(100, 540, 100, 900, 12);
wall(1500, 100, 1500, 900, 12);

// Rooms north of the corridor, with door gaps on the corridor.
wall(100, 450, 180, 450);
for (const [from, to] of [
  [240, 460],
  [520, 780],
  [840, 1080],
  [1140, 1360],
  [1420, 1500],
] as const) {
  wall(from, 450, to, 450);
}
for (const x of [380, 700, 1000, 1300]) wall(x, 100, x, 450);

// Rooms south of the corridor.
for (const [from, to] of [
  [100, 200],
  [260, 560],
  [620, 960],
  [1020, 1260],
  [1320, 1500],
] as const) {
  wall(from, 550, to, 550);
}
for (const x of [500, 900, 1320]) wall(x, 550, x, 900);

// Technical rooms of façade C (seeded zones: 380–460 and 480–560, 250–330).
wall(370, 240, 570, 240);
wall(370, 340, 420, 340);
wall(450, 340, 570, 340);
wall(370, 240, 370, 340);
wall(470, 240, 470, 340);
wall(570, 240, 570, 340);

// PNG encoding (RGB, 8 bits, no filter).
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (data: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header.set([8, 2, 0, 0, 0], 8);
const rows = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  pixels.copy(rows, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(rows, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = resolve(import.meta.dirname, '../supabase/seed-assets/plan-batiment-a-rdc.png');
writeFileSync(target, png);
console.log(`${target} (${png.length} octets)`);
