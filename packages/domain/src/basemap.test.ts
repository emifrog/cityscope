import { describe, expect, it } from 'vitest';
import {
  BASEMAP_DETAIL_MAX_ZOOM,
  BASEMAP_GENERAL_MAX_ZOOM,
  basemapBounds,
  basemapRenewAfter,
  expandBbox,
  isSafeBasemapPath,
  lonLatToTile,
  planBasemapTiles,
  tileBbox,
  zxyToTileId,
} from './basemap';

const NICE = [7.2518, 43.7079] as const;

describe('PMTiles tile ids', () => {
  it('follow the zooms, then the Hilbert curve (specification values)', () => {
    expect(zxyToTileId(0, 0, 0)).toBe(0);
    expect(zxyToTileId(1, 0, 0)).toBe(1);
    expect(zxyToTileId(1, 0, 1)).toBe(2);
    expect(zxyToTileId(1, 1, 1)).toBe(3);
    expect(zxyToTileId(1, 1, 0)).toBe(4);
    expect(zxyToTileId(2, 0, 0)).toBe(5);
    expect(zxyToTileId(12, 3423, 1763)).toBe(19_078_479);
  });

  it('refuse tiles outside their zoom', () => {
    expect(() => zxyToTileId(2, 4, 0)).toThrow(RangeError);
    expect(() => zxyToTileId(27, 0, 0)).toThrow(RangeError);
  });
});

describe('tile geometry', () => {
  it('finds the tile holding a point, whose bounds contain it', () => {
    const { x, y } = lonLatToTile(NICE[0], NICE[1], 14);
    expect({ x, y }).toEqual({ x: 8522, y: 5975 });
    const [west, south, east, north] = tileBbox(14, x, y);
    expect(NICE[0]).toBeGreaterThanOrEqual(west);
    expect(NICE[0]).toBeLessThan(east);
    expect(NICE[1]).toBeGreaterThanOrEqual(south);
    expect(NICE[1]).toBeLessThan(north);
  });

  it('grows a box by a distance in meters', () => {
    const [west, south, east, north] = expandBbox([NICE[0], NICE[1], NICE[0], NICE[1]], 1_000);
    expect(north - south).toBeCloseTo(2 / 111.32, 4);
    // A degree of longitude is shorter than a degree of latitude at 43.7°.
    expect(east - west).toBeGreaterThan(north - south);
  });
});

describe('tiles of a base map', () => {
  const coverage = { extent: [NICE[0], NICE[1], NICE[0], NICE[1]] as const, detail: [NICE] };
  const tiles = planBasemapTiles(coverage);

  it('are sorted by tile id, without duplicates', () => {
    const ids = tiles.map((tile) => tile.id);
    expect(ids).toEqual([...new Set(ids)].sort((a, b) => a - b));
    expect(tiles.every((tile) => tile.id === zxyToTileId(tile.z, tile.x, tile.y))).toBe(true);
  });

  it('hold every zoom up to the general view, then the detail around the sites', () => {
    const zooms = new Set(tiles.map((tile) => tile.z));
    for (let z = 0; z <= BASEMAP_DETAIL_MAX_ZOOM; z++) expect(zooms.has(z)).toBe(true);
    const bounds = basemapBounds(coverage);
    expect(bounds).not.toBeNull();
    const detail = tiles.filter((tile) => tile.z > BASEMAP_GENERAL_MAX_ZOOM);
    const nearSite = expandBbox([NICE[0], NICE[1], NICE[0], NICE[1]], 700);
    for (const tile of detail) {
      const [west, south, east, north] = tileBbox(tile.z, tile.x, tile.y);
      expect(east).toBeGreaterThan(nearSite[0]);
      expect(west).toBeLessThan(nearSite[2]);
      expect(north).toBeGreaterThan(nearSite[1]);
      expect(south).toBeLessThan(nearSite[3]);
    }
  });

  it('stay small for one site (volume order of magnitude)', () => {
    expect(tiles.length).toBeGreaterThan(100);
    expect(tiles.length).toBeLessThan(600);
  });

  it('are empty without located site; a site without publication gets no detail', () => {
    expect(planBasemapTiles({ extent: null, detail: [] })).toEqual([]);
    const general = planBasemapTiles({ extent: coverage.extent, detail: [] });
    expect(general.every((tile) => tile.z <= BASEMAP_GENERAL_MAX_ZOOM)).toBe(true);
  });
});

describe('base map files and renewal', () => {
  it('accepts flat file names only', () => {
    expect(isSafeBasemapPath('tiles.pmtiles')).toBe(true);
    expect(isSafeBasemapPath('sprite@2x.png')).toBe(true);
    expect(isSafeBasemapPath('../style.json')).toBe(false);
    expect(isSafeBasemapPath('fonts/a.pbf')).toBe(false);
    expect(isSafeBasemapPath('Style.json')).toBe(false);
  });

  it('renews six months after the build', () => {
    expect(basemapRenewAfter(new Date('2026-10-05T00:00:00Z')).toISOString()).toBe('2027-04-05T00:00:00.000Z');
  });
});
