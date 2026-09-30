// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { siteExtent, toMultiPolygon, toPolygons } from './geometry';

const ring = [
  [7.25160001234, 43.7077],
  [7.252, 43.7077],
  [7.252, 43.7081],
  [7.25160001234, 43.7077],
];

describe('footprint geometry', () => {
  it('turns each part of a MultiPolygon into an editable polygon, and back', () => {
    const stored = { type: 'MultiPolygon' as const, coordinates: [[ring], [ring]] as [number, number][][][] };
    const polygons = toPolygons(stored);
    expect(polygons).toHaveLength(2);
    expect(polygons[0]?.coordinates[0]?.[0]).toEqual([7.2516, 43.7077]);
    expect(toMultiPolygon(polygons)).toEqual({
      type: 'MultiPolygon',
      coordinates: [[polygons[0]?.coordinates[0]], [polygons[1]?.coordinates[0]]],
    });
  });

  it('sends "no footprint" when every polygon was erased', () => {
    expect(toMultiPolygon([])).toBeNull();
    expect(toPolygons(null)).toEqual([]);
  });

  it('frames the point, the footprint and the buildings of a site', () => {
    const extent = siteExtent(
      {
        location: { type: 'Point', coordinates: [7.2518, 43.7079] },
        footprint: { type: 'MultiPolygon', coordinates: [[ring as [number, number][]]] },
      },
      [
        {
          footprint: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [7.26, 43.71],
                  [7.261, 43.71],
                  [7.261, 43.711],
                  [7.26, 43.71],
                ],
              ],
            ],
          },
        },
      ],
    );
    expect(extent).toEqual([7.25160001234, 43.7077, 7.261, 43.711]);
    expect(siteExtent({ location: null, footprint: null }, [{ footprint: null }])).toBeNull();
  });
});
