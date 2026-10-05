/**
 * Offline base maps of the tablets (CAR-01 to CAR-03, ADR-024): one file per
 * sector, general view up to zoom 14 over the sites of the sector and a
 * margin, detail up to zoom 18 around the distributed sites. Pure functions:
 * the worker plans the tiles from them, the tests check the volumes.
 */

/** General view: every tile of the sector and its margin, up to this zoom. */
export const BASEMAP_GENERAL_MAX_ZOOM = 14;
/** Detail: tiles around the distributed sites, up to this zoom (street numbers, buildings). */
export const BASEMAP_DETAIL_MAX_ZOOM = 18;
/** Margin around the extent of the sites of the sector (general view). */
export const BASEMAP_MARGIN_METERS = 5_000;
/** Radius of the detail area around a distributed site. */
export const BASEMAP_DETAIL_RADIUS_METERS = 500;
/** Six-month renewal (ADR-024). */
export const BASEMAP_RENEWAL_DAYS = 182;
/** Size of the parts of a file for the transfer: resumable, below the storage limit. */
export const BASEMAP_PART_BYTES = 32 * 1024 * 1024;
/** A sector larger than this is refused (split it), rather than flooding the source and the tablets. */
export const BASEMAP_MAX_TILES = 250_000;
export const BASEMAP_MAX_BYTES = 1024 * 1024 * 1024;
/** Base maps of a tablet, all sectors together (architecture §12). */
export const BASEMAP_DEVICE_BUDGET_BYTES = 2 * 1024 * 1024 * 1024;
export const BASEMAP_MANIFEST_VERSION = 1;
/** Names of the files of a base map on the tablet. */
export const BASEMAP_TILES_FILE = 'tiles.pmtiles';
export const BASEMAP_STYLE_FILE = 'style.json';

/** Files of a base map are flat names (the tablet writes them in one folder). */
export function isSafeBasemapPath(path: string): boolean {
  return /^[a-z0-9][a-z0-9._@-]{0,63}$/.test(path) && !path.includes('..');
}

/** West, south, east, north in WGS 84 degrees. */
export type Bbox = readonly [number, number, number, number];
export type LonLat = readonly [number, number];

export interface BasemapCoverage {
  /** Extent of the located sites of the sector (null: no located site). */
  readonly extent: Bbox | null;
  /** Distributed sites: detail areas. */
  readonly detail: readonly LonLat[];
}

export interface BasemapTilePlanOptions {
  readonly generalMaxZoom: number;
  readonly detailMaxZoom: number;
  readonly marginMeters: number;
  readonly detailRadiusMeters: number;
}

export const DEFAULT_BASEMAP_TILE_PLAN: BasemapTilePlanOptions = {
  generalMaxZoom: BASEMAP_GENERAL_MAX_ZOOM,
  detailMaxZoom: BASEMAP_DETAIL_MAX_ZOOM,
  marginMeters: BASEMAP_MARGIN_METERS,
  detailRadiusMeters: BASEMAP_DETAIL_RADIUS_METERS,
};

export interface PlannedTile {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** PMTiles v3 tile id (Hilbert order): the order of the tiles in the file. */
  readonly id: number;
}

const MAX_LATITUDE = 85.051_128_78;
const METERS_PER_DEGREE = 111_320;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A box grown by a distance in meters (latitude-dependent in longitude). */
export function expandBbox(bbox: Bbox, meters: number): Bbox {
  const [west, south, east, north] = bbox;
  const dLat = meters / METERS_PER_DEGREE;
  const widest = Math.max(Math.abs(south), Math.abs(north)) + dLat;
  const dLon = meters / (METERS_PER_DEGREE * Math.max(Math.cos((Math.min(widest, 89) * Math.PI) / 180), 0.01));
  return [
    clamp(west - dLon, -180, 180),
    clamp(south - dLat, -MAX_LATITUDE, MAX_LATITUDE),
    clamp(east + dLon, -180, 180),
    clamp(north + dLat, -MAX_LATITUDE, MAX_LATITUDE),
  ];
}

/** Web Mercator tile holding a point, at a zoom. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latitude = (clamp(lat, -MAX_LATITUDE, MAX_LATITUDE) * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2) * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1) };
}

/** Bounds of a tile (west, south, east, north). */
export function tileBbox(z: number, x: number, y: number): Bbox {
  const n = 2 ** z;
  const lon = (tx: number) => (tx / n) * 360 - 180;
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

const ZOOM_OFFSETS = Array.from({ length: 27 }, (_, z) => ((4 ** z - 1) / 3) as number);

/** PMTiles v3 tile id: tiles of lower zooms first, then the Hilbert curve within a zoom. */
export function zxyToTileId(z: number, x: number, y: number): number {
  if (!Number.isInteger(z) || z < 0 || z > 26) throw new RangeError('Zoom out of range.');
  const n = 2 ** z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    throw new RangeError('Tile out of range.');
  }
  let tx = x;
  let ty = y;
  let d = 0;
  for (let s = n / 2; s >= 1; s /= 2) {
    const rx = (tx & s) > 0 ? 1 : 0;
    const ry = (ty & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        tx = s - 1 - tx;
        ty = s - 1 - ty;
      }
      [tx, ty] = [ty, tx];
    }
  }
  return (ZOOM_OFFSETS[z] ?? 0) + d;
}

function addRange(tiles: Map<number, PlannedTile>, bbox: Bbox, z: number): void {
  const [west, south, east, north] = bbox;
  const min = lonLatToTile(west, north, z);
  const max = lonLatToTile(east, south, z);
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      const id = zxyToTileId(z, x, y);
      if (!tiles.has(id)) tiles.set(id, { z, x, y, id });
    }
  }
}

/** Area covered by the general view of a base map (extent of the sites and margin). */
export function basemapBounds(coverage: BasemapCoverage, options = DEFAULT_BASEMAP_TILE_PLAN): Bbox | null {
  return coverage.extent ? expandBbox(coverage.extent, options.marginMeters) : null;
}

/**
 * Tiles of a base map, in the order of the file: every tile of the general view
 * up to `generalMaxZoom`, then the tiles of the detail areas up to `detailMaxZoom`.
 */
export function planBasemapTiles(coverage: BasemapCoverage, options = DEFAULT_BASEMAP_TILE_PLAN): PlannedTile[] {
  const bounds = basemapBounds(coverage, options);
  if (!bounds) return [];
  const tiles = new Map<number, PlannedTile>();
  for (let z = 0; z <= options.generalMaxZoom; z++) addRange(tiles, bounds, z);
  for (const [lon, lat] of coverage.detail) {
    const area = expandBbox([lon, lat, lon, lat], options.detailRadiusMeters);
    for (let z = options.generalMaxZoom + 1; z <= options.detailMaxZoom; z++) addRange(tiles, area, z);
  }
  return [...tiles.values()].sort((a, b) => a.id - b.id);
}

/** End of validity of a base map built at an instant (six-month renewal). */
export function basemapRenewAfter(builtAt: Date): Date {
  return new Date(builtAt.getTime() + BASEMAP_RENEWAL_DAYS * 86_400_000);
}
