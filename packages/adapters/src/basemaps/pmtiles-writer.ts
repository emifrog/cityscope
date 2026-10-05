import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type {
  BasemapArchive,
  BasemapArchiveFactory,
  BasemapArchiveHeader,
  BasemapArchiveWriter,
} from '@etare/application';

/**
 * PMTiles v3 writer (https://github.com/protomaps/PMTiles, specification v3):
 * one file holding the tiles, read by range on the tablet. Tiles arrive by
 * increasing tile id; identical tiles are stored once (sea, forest) and runs
 * of identical neighbours become one directory entry. The tile data goes to
 * a temporary file of the worker, so a large sector never sits in memory.
 */
const HEADER_BYTES = 127;
/** The header and the root directory must fit in the first 16 KiB (specification). */
const ROOT_TARGET_BYTES = 16_384 - HEADER_BYTES;
const COMPRESSION_GZIP = 2;
const TILE_TYPE_MVT = 1;

interface Entry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

class ByteSink {
  private bytes: number[] = [];

  varint(value: number): void {
    let rest = value;
    while (rest >= 0x80) {
      this.bytes.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.bytes.push(rest);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Directory of the specification: count, delta ids, run lengths, lengths, offsets (gzip). */
export function serializeDirectory(entries: readonly Entry[]): Uint8Array {
  const sink = new ByteSink();
  sink.varint(entries.length);
  let lastId = 0;
  for (const entry of entries) {
    sink.varint(entry.tileId - lastId);
    lastId = entry.tileId;
  }
  for (const entry of entries) sink.varint(entry.runLength);
  for (const entry of entries) sink.varint(entry.length);
  entries.forEach((entry, index) => {
    const previous = entries[index - 1];
    if (previous && entry.offset === previous.offset + previous.length) sink.varint(0);
    else sink.varint(entry.offset + 1);
  });
  return gzipSync(sink.toBytes());
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

function rootAndLeaves(entries: readonly Entry[], leafSize: number): { root: Uint8Array; leaves: Uint8Array } {
  const rootEntries: Entry[] = [];
  const leaves: Uint8Array[] = [];
  let offset = 0;
  for (let index = 0; index < entries.length; index += leafSize) {
    const chunk = entries.slice(index, index + leafSize);
    const first = chunk[0];
    if (!first) break;
    const serialized = serializeDirectory(chunk);
    rootEntries.push({ tileId: first.tileId, offset, length: serialized.byteLength, runLength: 0 });
    leaves.push(serialized);
    offset += serialized.byteLength;
  }
  return { root: serializeDirectory(rootEntries), leaves: concat(leaves) };
}

/** Root directory alone when it fits, otherwise leaf directories under it. */
export function optimizeDirectories(entries: readonly Entry[]): { root: Uint8Array; leaves: Uint8Array } {
  if (entries.length < 16_384) {
    const root = serializeDirectory(entries);
    if (root.byteLength <= ROOT_TARGET_BYTES) return { root, leaves: new Uint8Array(0) };
  }
  let leafSize = Math.max(4_096, Math.floor(entries.length / 3_500));
  for (;;) {
    const built = rootAndLeaves(entries, leafSize);
    if (built.root.byteLength <= ROOT_TARGET_BYTES) return built;
    leafSize = Math.ceil(leafSize * 1.2);
  }
}

const e7 = (degrees: number) => Math.round(degrees * 1e7);

function headerBytes(input: {
  rootOffset: number;
  rootLength: number;
  metadataOffset: number;
  metadataLength: number;
  leafOffset: number;
  leafLength: number;
  dataOffset: number;
  dataLength: number;
  addressedTiles: number;
  tileEntries: number;
  tileContents: number;
  header: BasemapArchiveHeader;
}): Uint8Array {
  const buffer = Buffer.alloc(HEADER_BYTES);
  buffer.write('PMTiles', 0, 'ascii');
  buffer.writeUInt8(3, 7);
  const u64 = [
    input.rootOffset,
    input.rootLength,
    input.metadataOffset,
    input.metadataLength,
    input.leafOffset,
    input.leafLength,
    input.dataOffset,
    input.dataLength,
    input.addressedTiles,
    input.tileEntries,
    input.tileContents,
  ];
  u64.forEach((value, index) => buffer.writeBigUInt64LE(BigInt(value), 8 + index * 8));
  buffer.writeUInt8(1, 96); // clustered: tile data in tile id order
  buffer.writeUInt8(COMPRESSION_GZIP, 97); // directories and metadata
  buffer.writeUInt8(COMPRESSION_GZIP, 98); // tiles
  buffer.writeUInt8(TILE_TYPE_MVT, 99);
  const { bounds, center, centerZoom, minZoom, maxZoom } = input.header;
  buffer.writeUInt8(minZoom, 100);
  buffer.writeUInt8(maxZoom, 101);
  buffer.writeInt32LE(e7(bounds[0]), 102);
  buffer.writeInt32LE(e7(bounds[1]), 106);
  buffer.writeInt32LE(e7(bounds[2]), 110);
  buffer.writeInt32LE(e7(bounds[3]), 114);
  buffer.writeUInt8(centerZoom, 118);
  buffer.writeInt32LE(e7(center[0]), 119);
  buffer.writeInt32LE(e7(center[1]), 123);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

const COPY_CHUNK_BYTES = 4 * 1024 * 1024;

class PmtilesArchiveWriter implements BasemapArchiveWriter {
  private readonly entries: Entry[] = [];
  private readonly contents = new Map<string, { offset: number; length: number }>();
  private written = 0;
  /** Tile data not yet on disk: written by blocks, not one system call per tile. */
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private flushed = 0;
  private lastId = -1;
  private addressed = 0;
  private finished = false;

  private constructor(
    private readonly directory: string,
    private readonly data: FileHandle,
  ) {}

  static async open(parent: string): Promise<PmtilesArchiveWriter> {
    const directory = await mkdtemp(join(parent, 'etare-basemap-'));
    return new PmtilesArchiveWriter(directory, await open(join(directory, 'tiles.data'), 'w+'));
  }

  get dataBytes(): number {
    return this.written;
  }

  async add(tileId: number, content: Uint8Array): Promise<void> {
    if (this.finished) throw new Error('Archive already finished.');
    if (!Number.isSafeInteger(tileId) || tileId <= this.lastId) {
      throw new Error('Tiles must be added by increasing tile id.');
    }
    const compressed = gzipSync(content);
    const hash = createHash('sha256').update(content).digest('hex');
    let stored = this.contents.get(hash);
    if (!stored) {
      stored = { offset: this.written, length: compressed.byteLength };
      this.pending.push(compressed);
      this.pendingBytes += compressed.byteLength;
      this.written += compressed.byteLength;
      this.contents.set(hash, stored);
      if (this.pendingBytes >= COPY_CHUNK_BYTES) await this.flush();
    }
    const last = this.entries.at(-1);
    if (
      last &&
      last.tileId + last.runLength === tileId &&
      last.offset === stored.offset &&
      last.length === stored.length
    ) {
      last.runLength++;
    } else {
      this.entries.push({ tileId, offset: stored.offset, length: stored.length, runLength: 1 });
    }
    this.addressed++;
    this.lastId = tileId;
  }

  private async flush(): Promise<void> {
    if (this.pendingBytes === 0) return;
    const block = Buffer.concat(this.pending, this.pendingBytes);
    await this.data.write(block, 0, block.byteLength, this.flushed);
    this.flushed += block.byteLength;
    this.pending = [];
    this.pendingBytes = 0;
  }

  async finish(header: BasemapArchiveHeader): Promise<BasemapArchive> {
    if (this.finished) throw new Error('Archive already finished.');
    await this.flush();
    this.finished = true;
    const { root, leaves } = optimizeDirectories(this.entries);
    const metadata = gzipSync(Buffer.from(JSON.stringify(header.metadata), 'utf8'));
    const metadataOffset = HEADER_BYTES + root.byteLength;
    const leafOffset = metadataOffset + metadata.byteLength;
    const dataOffset = leafOffset + leaves.byteLength;
    const head = headerBytes({
      rootOffset: HEADER_BYTES,
      rootLength: root.byteLength,
      metadataOffset,
      metadataLength: metadata.byteLength,
      leafOffset,
      leafLength: leaves.byteLength,
      dataOffset,
      dataLength: this.written,
      addressedTiles: this.addressed,
      tileEntries: this.entries.length,
      tileContents: this.contents.size,
      header,
    });

    const path = join(this.directory, 'tiles.pmtiles');
    const output = await open(path, 'w');
    const hash = createHash('sha256');
    let position = 0;
    const append = async (chunk: Uint8Array) => {
      await output.write(chunk, 0, chunk.byteLength, position);
      hash.update(chunk);
      position += chunk.byteLength;
    };
    try {
      for (const chunk of [head, root, metadata, leaves]) await append(chunk);
      const buffer = new Uint8Array(COPY_CHUNK_BYTES);
      for (let at = 0; at < this.written;) {
        const { bytesRead } = await this.data.read(buffer, 0, Math.min(COPY_CHUNK_BYTES, this.written - at), at);
        if (bytesRead === 0) throw new Error('Temporary tile data truncated.');
        await append(buffer.subarray(0, bytesRead));
        at += bytesRead;
      }
    } finally {
      await output.close();
      await this.data.close();
    }
    const sizeBytes = position;
    return {
      sizeBytes,
      sha256: hash.digest('hex'),
      tileCount: this.addressed,
      async *parts(partBytes: number) {
        const input = await open(path, 'r');
        try {
          for (let at = 0; at < sizeBytes; at += partBytes) {
            const part = new Uint8Array(Math.min(partBytes, sizeBytes - at));
            let filled = 0;
            while (filled < part.byteLength) {
              const { bytesRead } = await input.read(part, filled, part.byteLength - filled, at + filled);
              if (bytesRead === 0) throw new Error('Archive truncated.');
              filled += bytesRead;
            }
            yield part;
          }
        } finally {
          await input.close();
        }
      },
    };
  }

  async dispose(): Promise<void> {
    if (!this.finished) await this.data.close().catch(() => undefined);
    await rm(this.directory, { recursive: true, force: true });
  }
}

/** Archives in a temporary folder of the worker (removed after each preparation). */
export class PmtilesArchiveFactory implements BasemapArchiveFactory {
  constructor(private readonly parent: string = tmpdir()) {}

  create(): Promise<BasemapArchiveWriter> {
    return PmtilesArchiveWriter.open(this.parent);
  }
}
