import type { BasemapSourceInfo, BasemapTileSource } from '@etare/application';
import { MVT_EXTENT, encodeMvt, type MvtFeature, type MvtPoint } from './mvt';

/**
 * Synthetic test base map: a grid of avenues and streets, ponds and blocks of
 * buildings computed from the tile coordinates, without any real data. It
 * proves the whole chain (preparation, transfer, local rendering) in
 * development, in the CI and on the emulator while the rights sheet of the
 * IGN product is pending (ADR-024). Refused in production by the configuration.
 */
export const SYNTHETIC_BASEMAP_SOURCE: BasemapSourceInfo = {
  id: 'synthetic',
  product: 'Fond d’essai synthétique',
  attribution: 'Fond d’essai FireScape — aucune donnée IGN',
  licenceName: 'Données générées pour les essais',
  licenceUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
  synthetic: true,
  rights: 'approved',
  rightsReference: 'Données générées par la plateforme, sans produit tiers.',
};

const BUFFER = 64;
const LOW = -BUFFER;
const HIGH = MVT_EXTENT + BUFFER;

const hash = (a: number, b: number) => (Math.imul(a, 73_856_093) ^ Math.imul(b, 19_349_663)) >>> 0;

/** Position, in the tile, of a coordinate of the grid of zoom `level`. */
const toTile = (value: number, level: number, z: number, origin: number) =>
  (value / 2 ** (level - z) - origin) * MVT_EXTENT;

/** Grid lines of a zoom level crossing the tile (with its buffer). */
function gridLines(level: number, z: number, x: number, y: number, kind: string, prefix: string): MvtFeature[] {
  const features: MvtFeature[] = [];
  const scale = 2 ** (level - z);
  const first = Math.ceil((x - BUFFER / MVT_EXTENT) * scale);
  const last = Math.floor((x + 1 + BUFFER / MVT_EXTENT) * scale);
  for (let k = first; k <= last; k++) {
    const at = toTile(k, level, z, x);
    features.push({
      type: 'line',
      geometry: [
        [
          [at, LOW],
          [at, HIGH],
        ],
      ],
      properties: { kind, name: `${prefix} d’essai ${(Math.abs(k) % 997) + 1}` },
    });
  }
  const firstRow = Math.ceil((y - BUFFER / MVT_EXTENT) * scale);
  const lastRow = Math.floor((y + 1 + BUFFER / MVT_EXTENT) * scale);
  for (let k = firstRow; k <= lastRow; k++) {
    const at = toTile(k, level, z, y);
    features.push({
      type: 'line',
      geometry: [
        [
          [LOW, at],
          [HIGH, at],
        ],
      ],
      properties: { kind, name: `${kind === 'principale' ? 'Boulevard' : 'Rue'} d’essai ${(Math.abs(k) % 997) + 1}` },
    });
  }
  return features;
}

/** Rectangle given in cells of a zoom level, clipped to the tile; null when outside. */
function rectangle(
  level: number,
  z: number,
  x: number,
  y: number,
  [west, north, east, south]: readonly [number, number, number, number],
): MvtPoint[] | null {
  const left = Math.max(LOW, toTile(west, level, z, x));
  const right = Math.min(HIGH, toTile(east, level, z, x));
  const top = Math.max(LOW, toTile(north, level, z, y));
  const bottom = Math.min(HIGH, toTile(south, level, z, y));
  if (right - left < 1 || bottom - top < 1) return null;
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

/** Cells of a zoom level overlapping the tile (bounded). */
function cells(level: number, z: number, x: number, y: number): [number, number][] {
  const scale = 2 ** (level - z);
  const out: [number, number][] = [];
  for (let cx = Math.floor(x * scale); cx < Math.ceil((x + 1) * scale); cx++) {
    for (let cy = Math.floor(y * scale); cy < Math.ceil((y + 1) * scale); cy++) out.push([cx, cy]);
  }
  return out;
}

export function syntheticTile(z: number, x: number, y: number): Uint8Array {
  const water: MvtFeature[] = [];
  if (z >= 9) {
    for (const [cx, cy] of cells(12, z, x, y)) {
      if (hash(cx, cy) % 5 !== 0) continue;
      const ring = rectangle(12, z, x, y, [cx + 0.35, cy + 0.4, cx + 0.62, cy + 0.66]);
      if (ring) water.push({ type: 'polygon', geometry: [ring], properties: { kind: 'plan_d_eau' } });
    }
  }
  const roads: MvtFeature[] = [];
  if (z >= 8) roads.push(...gridLines(13, z, x, y, 'principale', 'Avenue'));
  if (z >= 14) roads.push(...gridLines(17, z, x, y, 'rue', 'Allée'));
  const buildings: MvtFeature[] = [];
  if (z >= 15) {
    for (const [cx, cy] of cells(18, z, x, y)) {
      if (hash(cx, cy) % 3 === 0 || cx % 2 === 0 || cy % 2 === 0) continue;
      const ring = rectangle(18, z, x, y, [cx + 0.15, cy + 0.15, cx + 0.85, cy + 0.85]);
      if (ring) buildings.push({ type: 'polygon', geometry: [ring], properties: { kind: 'bati' } });
    }
  }
  const notice: MvtFeature[] =
    z >= 8 && z <= 13
      ? [
          {
            type: 'point',
            geometry: [[[MVT_EXTENT / 2, MVT_EXTENT / 2]]],
            properties: { name: 'Fond d’essai — aucune donnée IGN' },
          },
        ]
      : [];
  return encodeMvt([
    { name: 'eau', features: water },
    { name: 'bati', features: buildings },
    { name: 'route', features: roads },
    { name: 'mention', features: notice },
  ]);
}

/** Style of the tablet: the placeholders are replaced by the folders of the installed files. */
export function syntheticStyle(): Record<string, unknown> {
  const font = ['NotoSans-Regular'];
  return {
    version: 8,
    name: 'FireScape — fond d’essai',
    glyphs: 'file://{{GLYPHS_DIR}}/{fontstack}/{range}.pbf',
    sources: {
      fond: {
        type: 'vector',
        url: 'pmtiles://file://{{BASEMAP_DIR}}/tiles.pmtiles',
        attribution: SYNTHETIC_BASEMAP_SOURCE.attribution,
      },
    },
    layers: [
      { id: 'arriere-plan', type: 'background', paint: { 'background-color': '#f1eee8' } },
      { id: 'eau', type: 'fill', source: 'fond', 'source-layer': 'eau', paint: { 'fill-color': '#aacde8' } },
      {
        id: 'bati',
        type: 'fill',
        source: 'fond',
        'source-layer': 'bati',
        minzoom: 15,
        paint: { 'fill-color': '#dcd3cb', 'fill-outline-color': '#bfb2a6' },
      },
      {
        id: 'rue',
        type: 'line',
        source: 'fond',
        'source-layer': 'route',
        filter: ['==', ['get', 'kind'], 'rue'],
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 1, 18, 12],
        },
      },
      {
        id: 'principale',
        type: 'line',
        source: 'fond',
        'source-layer': 'route',
        filter: ['==', ['get', 'kind'], 'principale'],
        paint: {
          'line-color': '#f3c26b',
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 8, 0.8, 18, 24],
        },
      },
      {
        id: 'nom-de-voie',
        type: 'symbol',
        source: 'fond',
        'source-layer': 'route',
        minzoom: 15,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': font,
          'text-size': 12,
        },
        paint: { 'text-color': '#4a4a4a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      {
        id: 'mention',
        type: 'symbol',
        source: 'fond',
        'source-layer': 'mention',
        layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 13 },
        paint: { 'text-color': '#8a6d3b', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
    ],
  };
}

export class SyntheticBasemapSource implements BasemapTileSource {
  readonly info = SYNTHETIC_BASEMAP_SOURCE;

  tile(z: number, x: number, y: number): Promise<Uint8Array | null> {
    return Promise.resolve(syntheticTile(z, x, y));
  }

  styleFiles(): Promise<{ style: Record<string, unknown>; files: [] }> {
    return Promise.resolve({ style: syntheticStyle(), files: [] });
  }
}
