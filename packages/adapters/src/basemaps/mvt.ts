/**
 * Minimal Mapbox Vector Tile 2.1 encoder (protocol buffers written by hand):
 * enough for the synthetic test base map, without a dependency. Coordinates
 * are tile units (extent 4096, y downwards); exterior rings go clockwise.
 */
export type MvtValue = string | number | boolean;
export type MvtPoint = readonly [number, number];

export interface MvtFeature {
  readonly type: 'point' | 'line' | 'polygon';
  /** Points: one list of points; lines: one list per line; polygons: one list per ring (not closed). */
  readonly geometry: readonly (readonly MvtPoint[])[];
  readonly properties: Readonly<Record<string, MvtValue>>;
}

export interface MvtLayer {
  readonly name: string;
  readonly features: readonly MvtFeature[];
  readonly extent?: number;
}

export const MVT_EXTENT = 4096;

class Writer {
  private readonly bytes: number[] = [];

  varint(value: number): this {
    let rest = value;
    while (rest >= 0x80) {
      this.bytes.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.bytes.push(rest);
    return this;
  }

  tag(field: number, wireType: number): this {
    return this.varint(field * 8 + wireType);
  }

  message(field: number, content: Uint8Array): this {
    this.tag(field, 2).varint(content.byteLength);
    for (const byte of content) this.bytes.push(byte);
    return this;
  }

  string(field: number, value: string): this {
    return this.message(field, new TextEncoder().encode(value));
  }

  packed(field: number, values: readonly number[]): this {
    const inner = new Writer();
    for (const value of values) inner.varint(value);
    return this.message(field, inner.toBytes());
  }

  double(field: number, value: number): this {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    this.tag(field, 1);
    for (let index = 0; index < 8; index++) this.bytes.push(view.getUint8(index));
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const zigzag = (value: number) => (value >= 0 ? value * 2 : -value * 2 - 1);
const command = (id: number, count: number) => (count << 3) | id;
const MOVE_TO = 1;
const LINE_TO = 2;
const CLOSE_PATH = 7;

function encodeGeometry(feature: MvtFeature): number[] {
  const out: number[] = [];
  let cursorX = 0;
  let cursorY = 0;
  const push = (point: MvtPoint) => {
    const x = Math.round(point[0]);
    const y = Math.round(point[1]);
    out.push(zigzag(x - cursorX), zigzag(y - cursorY));
    cursorX = x;
    cursorY = y;
  };
  if (feature.type === 'point') {
    const points = feature.geometry[0] ?? [];
    out.push(command(MOVE_TO, points.length));
    points.forEach(push);
    return out;
  }
  for (const part of feature.geometry) {
    const [first, ...rest] = part;
    if (!first || rest.length === 0) continue;
    out.push(command(MOVE_TO, 1));
    push(first);
    out.push(command(LINE_TO, rest.length));
    rest.forEach(push);
    if (feature.type === 'polygon') out.push(command(CLOSE_PATH, 1));
  }
  return out;
}

function encodeValue(value: MvtValue): Uint8Array {
  const writer = new Writer();
  if (typeof value === 'string') writer.string(1, value);
  else if (typeof value === 'boolean') writer.tag(7, 0).varint(value ? 1 : 0);
  else if (Number.isInteger(value) && value >= 0) writer.tag(5, 0).varint(value);
  else if (Number.isInteger(value)) writer.tag(6, 0).varint(zigzag(value));
  else writer.double(3, value);
  return writer.toBytes();
}

const GEOMETRY_TYPES = { point: 1, line: 2, polygon: 3 } as const;

function encodeLayer(layer: MvtLayer): Uint8Array {
  const keys: string[] = [];
  const values: MvtValue[] = [];
  const keyIndex = new Map<string, number>();
  const valueIndex = new Map<string, number>();
  const writer = new Writer();
  writer.tag(15, 0).varint(2);
  writer.string(1, layer.name);
  for (const feature of layer.features) {
    const tags: number[] = [];
    for (const [key, value] of Object.entries(feature.properties)) {
      let k = keyIndex.get(key);
      if (k === undefined) {
        k = keys.push(key) - 1;
        keyIndex.set(key, k);
      }
      const id = `${typeof value}:${String(value)}`;
      let v = valueIndex.get(id);
      if (v === undefined) {
        v = values.push(value) - 1;
        valueIndex.set(id, v);
      }
      tags.push(k, v);
    }
    const encoded = new Writer();
    if (tags.length > 0) encoded.packed(2, tags);
    encoded.tag(3, 0).varint(GEOMETRY_TYPES[feature.type]);
    encoded.packed(4, encodeGeometry(feature));
    writer.message(2, encoded.toBytes());
  }
  for (const key of keys) writer.string(3, key);
  for (const value of values) writer.message(4, encodeValue(value));
  writer.tag(5, 0).varint(layer.extent ?? MVT_EXTENT);
  return writer.toBytes();
}

/** Encodes the layers of a tile (empty layers are left out). */
export function encodeMvt(layers: readonly MvtLayer[]): Uint8Array {
  const writer = new Writer();
  for (const layer of layers) {
    if (layer.features.length > 0) writer.message(3, encodeLayer(layer));
  }
  return writer.toBytes();
}
