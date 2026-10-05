import { describe, expect, it } from 'vitest';
import { encodeMvt } from './mvt';
import { SYNTHETIC_BASEMAP_SOURCE, SyntheticBasemapSource, syntheticStyle, syntheticTile } from './synthetic-source';

/** Reads the protocol buffer fields of a message (enough to check the encoder). */
function fields(bytes: Uint8Array): { field: number; wire: number; value: number | Uint8Array }[] {
  const out: { field: number; wire: number; value: number | Uint8Array }[] = [];
  let at = 0;
  const varint = () => {
    let result = 0;
    let shift = 1;
    for (;;) {
      const byte = bytes[at++] ?? 0;
      result += (byte & 0x7f) * shift;
      if (byte < 0x80) return result;
      shift *= 0x80;
    }
  };
  while (at < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key % 8;
    if (wire === 0) out.push({ field, wire, value: varint() });
    else if (wire === 2) {
      const length = varint();
      out.push({ field, wire, value: bytes.subarray(at, at + length) });
      at += length;
    } else if (wire === 1) {
      out.push({ field, wire, value: bytes.subarray(at, at + 8) });
      at += 8;
    } else throw new Error(`wire type ${wire}`);
  }
  return out;
}

interface DecodedLayer {
  name: string;
  extent: number;
  features: { type: number; tags: number[]; geometry: number[] }[];
  keys: string[];
  values: unknown[];
}

function decodeTile(bytes: Uint8Array): DecodedLayer[] {
  const text = (value: number | Uint8Array) => new TextDecoder().decode(value as Uint8Array);
  const packed = (value: number | Uint8Array) => decodePacked(value as Uint8Array);
  return fields(bytes)
    .filter((entry) => entry.field === 3)
    .map((entry) => {
      const layer: DecodedLayer = { name: '', extent: 0, features: [], keys: [], values: [] };
      for (const item of fields(entry.value as Uint8Array)) {
        if (item.field === 1) layer.name = text(item.value);
        if (item.field === 5) layer.extent = item.value as number;
        if (item.field === 3) layer.keys.push(text(item.value));
        if (item.field === 4) {
          const value = fields(item.value as Uint8Array)[0];
          layer.values.push(value?.field === 1 ? text(value.value) : value?.value);
        }
        if (item.field === 2) {
          const feature = { type: 0, tags: [] as number[], geometry: [] as number[] };
          for (const part of fields(item.value as Uint8Array)) {
            if (part.field === 3) feature.type = part.value as number;
            if (part.field === 2) feature.tags = packed(part.value);
            if (part.field === 4) feature.geometry = packed(part.value);
          }
          layer.features.push(feature);
        }
      }
      return layer;
    });
}

function decodePacked(bytes: Uint8Array): number[] {
  const out: number[] = [];
  let at = 0;
  while (at < bytes.length) {
    let result = 0;
    let shift = 1;
    for (;;) {
      const byte = bytes[at++] ?? 0;
      result += (byte & 0x7f) * shift;
      if (byte < 0x80) break;
      shift *= 0x80;
    }
    out.push(result);
  }
  return out;
}

describe('vector tile encoder', () => {
  it('writes layers, attributes and geometry commands of the specification', () => {
    const tile = decodeTile(
      encodeMvt([
        {
          name: 'route',
          features: [
            {
              type: 'line',
              geometry: [
                [
                  [0, 0],
                  [10, 0],
                  [10, 5],
                ],
              ],
              properties: { kind: 'rue', name: 'Rue d’essai 1' },
            },
          ],
        },
        { name: 'vide', features: [] },
        {
          name: 'eau',
          features: [
            {
              type: 'polygon',
              geometry: [
                [
                  [0, 0],
                  [4, 0],
                  [4, 4],
                  [0, 4],
                ],
              ],
              properties: { kind: 'plan_d_eau', niveau: 2, profondeur: -1, ratio: 0.5, salee: false },
            },
          ],
        },
      ]),
    );
    expect(tile.map((layer) => layer.name)).toEqual(['route', 'eau']);
    const [route, water] = tile;
    expect(route?.extent).toBe(4096);
    expect(route?.keys).toEqual(['kind', 'name']);
    expect(route?.values).toEqual(['rue', 'Rue d’essai 1']);
    // MoveTo(1) 0,0 ; LineTo(2) +10,0 ; 0,+5 (zigzag).
    expect(route?.features[0]).toEqual({ type: 2, tags: [0, 0, 1, 1], geometry: [9, 0, 0, 18, 20, 0, 0, 10] });
    // MoveTo(1), LineTo(3), ClosePath(1).
    expect(water?.features[0]?.type).toBe(3);
    expect(water?.features[0]?.geometry).toEqual([9, 0, 0, 26, 8, 0, 0, 8, 7, 0, 15]);
    expect(water?.keys).toEqual(['kind', 'niveau', 'profondeur', 'ratio', 'salee']);
  });
});

describe('synthetic test base map', () => {
  it('is a test source, approved, never a real map', () => {
    expect(SYNTHETIC_BASEMAP_SOURCE.synthetic).toBe(true);
    expect(SYNTHETIC_BASEMAP_SOURCE.rights).toBe('approved');
    expect(SYNTHETIC_BASEMAP_SOURCE.attribution).toMatch(/aucune donnée IGN/);
  });

  it('draws avenues at every zoom from 8, streets and buildings in the detail', () => {
    const general = decodeTile(syntheticTile(10, 532, 373));
    expect(general.map((layer) => layer.name)).toContain('route');
    expect(general.find((layer) => layer.name === 'mention')?.features).toHaveLength(1);
    const detail = decodeTile(syntheticTile(15, 17_044, 11_950));
    const names = detail.map((layer) => layer.name);
    expect(names).toContain('route');
    expect(names).toContain('bati');
    expect(names).not.toContain('mention');
    expect(decodeTile(syntheticTile(2, 1, 1))).toEqual([]);
  });

  it('is the same for the same tile (repeatable preparation)', async () => {
    const source = new SyntheticBasemapSource();
    expect(await source.tile(15, 17_044, 11_950)).toEqual(syntheticTile(15, 17_044, 11_950));
  });

  it('has a local style: tiles, fonts on the tablet, nothing remote', async () => {
    const { style, files } = await new SyntheticBasemapSource().styleFiles();
    expect(files).toEqual([]);
    expect(style).toEqual(syntheticStyle());
    const text = JSON.stringify(style);
    expect(text).not.toMatch(/https?:/);
    expect(text).toContain('pmtiles://file://{{BASEMAP_DIR}}/tiles.pmtiles');
    expect(text).toContain('file://{{GLYPHS_DIR}}/{fontstack}/{range}.pbf');
    expect(text).toContain('NotoSans-Regular');
  });
});
