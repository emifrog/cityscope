import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zxyToTileId } from '@etare/domain';
import { PMTiles, tileIdToZxy, zxyToTileId as referenceTileId, type RangeResponse, type Source } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import { PmtilesArchiveFactory, optimizeDirectories } from './pmtiles-writer';

class BufferSource implements Source {
  constructor(private readonly bytes: Uint8Array) {}

  getKey(): string {
    return 'memory';
  }

  getBytes(offset: number, length: number): Promise<RangeResponse> {
    const slice = this.bytes.slice(offset, offset + length);
    return Promise.resolve({ data: slice.buffer });
  }
}

const header = {
  bounds: [7.1, 43.5, 7.4, 43.8] as const,
  center: [7.25, 43.65] as const,
  centerZoom: 12,
  minZoom: 0,
  maxZoom: 18,
  metadata: { name: 'Secteur d’essai', attribution: 'Essai' },
};

async function collect(parts: AsyncIterable<Uint8Array>): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const part of parts) out.push(part);
  return out;
}

const join_ = (chunks: Uint8Array[]) => {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
};

describe('PMTiles writer', () => {
  it('uses the tile ids of the reference implementation', () => {
    for (const [z, x, y] of [
      [0, 0, 0],
      [5, 17, 11],
      [14, 8522, 5975],
      [18, 136_357, 95_605],
    ] as const) {
      expect(zxyToTileId(z, x, y)).toBe(referenceTileId(z, x, y));
    }
  });

  it('writes an archive the reference reader opens: header, tiles, metadata', async () => {
    const writer = await new PmtilesArchiveFactory().create();
    const sea = new TextEncoder().encode('mer');
    const tiles: [number, number, number, string][] = [
      [0, 0, 0, 'monde'],
      [1, 1, 0, 'nord-est'],
      [14, 8522, 5975, 'nice'],
      [14, 8522, 5976, 'nice-sud'],
    ];
    const entries = tiles
      .map(([z, x, y, text]) => ({ id: zxyToTileId(z, x, y), z, x, y, content: new TextEncoder().encode(text) }))
      .sort((a, b) => a.id - b.id);
    // Three identical neighbours: stored once, one run in the directory.
    const run = zxyToTileId(14, 8000, 5000);
    const added = [
      ...entries.map((entry) => ({ id: entry.id, content: entry.content })),
      ...[0, 1, 2].map((offset) => ({ id: run + offset, content: sea })),
    ].sort((a, b) => a.id - b.id);
    for (const tile of added) await writer.add(tile.id, tile.content);
    const archive = await writer.finish(header);
    const bytes = join_(await collect(archive.parts(64)));

    expect(bytes.byteLength).toBe(archive.sizeBytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(archive.sha256);
    expect(archive.tileCount).toBe(7);

    const reader = new PMTiles(new BufferSource(bytes));
    const read = await reader.getHeader();
    expect(read.specVersion).toBe(3);
    expect(read.minZoom).toBe(0);
    expect(read.maxZoom).toBe(18);
    expect(read.numAddressedTiles).toBe(7);
    expect(read.numTileContents).toBe(5);
    expect(read.numTileEntries).toBe(5);
    expect(read.minLon).toBeCloseTo(7.1, 6);
    expect(read.maxLat).toBeCloseTo(43.8, 6);
    expect(read.centerZoom).toBe(12);

    for (const entry of entries) {
      const tile = await reader.getZxy(entry.z, entry.x, entry.y);
      expect(new TextDecoder().decode(tile?.data)).toBe(new TextDecoder().decode(entry.content));
    }
    const third = await reader.getZxy(...tileIdToZxy(run + 2));
    expect(new TextDecoder().decode(third?.data)).toBe('mer');
    expect(await reader.getZxy(3, 0, 0)).toBeUndefined();
    expect(await reader.getMetadata()).toEqual(header.metadata);
    await writer.dispose();
  });

  it('splits the file in parts whose concatenation is the archive', async () => {
    const writer = await new PmtilesArchiveFactory().create();
    for (let id = 0; id < 50; id++) await writer.add(id, new TextEncoder().encode(`tuile ${id} `.repeat(40)));
    const archive = await writer.finish(header);
    const parts = await collect(archive.parts(1_000));
    expect(parts.length).toBe(Math.ceil(archive.sizeBytes / 1_000));
    expect(parts.slice(0, -1).every((part) => part.byteLength === 1_000)).toBe(true);
    expect(createHash('sha256').update(join_(parts)).digest('hex')).toBe(archive.sha256);
    await writer.dispose();
  });

  it('puts leaf directories under the root when the tiles are many', async () => {
    const entries = Array.from({ length: 40_000 }, (_, index) => ({
      tileId: index * 3,
      offset: index * 100,
      length: 100 + (index % 7),
      runLength: 1,
    }));
    const { root, leaves } = optimizeDirectories(entries);
    expect(root.byteLength).toBeLessThanOrEqual(16_384 - 127);
    expect(leaves.byteLength).toBeGreaterThan(0);

    const writer = await new PmtilesArchiveFactory().create();
    for (let index = 0; index < 20_000; index++) {
      await writer.add(index * 2, new TextEncoder().encode(`t${index}`));
    }
    const archive = await writer.finish(header);
    const reader = new PMTiles(new BufferSource(join_(await collect(archive.parts(1 << 20)))));
    expect((await reader.getHeader()).leafDirectoryLength).toBeGreaterThan(0);
    // Tile id 39 998 = 2 × 19 999: the last tile, found through a leaf.
    const tile = await reader.getZxy(...tileIdToZxy(19_999 * 2));
    expect(new TextDecoder().decode(tile?.data)).toBe('t19999');
    await writer.dispose();
  }, 20_000);

  it('refuses tiles out of order and removes its temporary files', async () => {
    const before = (await readdir(tmpdir())).filter((name) => name.startsWith('etare-basemap-')).length;
    const writer = await new PmtilesArchiveFactory().create();
    await writer.add(5, new Uint8Array([1]));
    await expect(writer.add(5, new Uint8Array([2]))).rejects.toThrow('increasing');
    await writer.dispose();
    const after = (await readdir(tmpdir())).filter((name) => name.startsWith('etare-basemap-')).length;
    expect(after).toBe(before);
    expect(join(tmpdir(), 'x')).toContain(tmpdir());
  });
});
