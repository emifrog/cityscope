import { describe, expect, it } from 'vitest';
import { bboxParamSchema, localGeometrySchema, parseBbox, pointSchema, polygonSchema, surfaceSchema } from './geo';

describe('GeoJSON schemas', () => {
  it('uses longitude then latitude', () => {
    expect(pointSchema.safeParse({ type: 'Point', coordinates: [7.25, 43.7] }).success).toBe(true);
    expect(pointSchema.safeParse({ type: 'Point', coordinates: [43.7, 190] }).success).toBe(false);
  });

  it('requires closed rings', () => {
    const open = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    };
    const closed = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    expect(polygonSchema.safeParse(open).success).toBe(false);
    expect(polygonSchema.safeParse(closed).success).toBe(true);
  });
});

describe('plan coordinates (pixels of the background)', () => {
  it('accepts points, lines and closed polygons', () => {
    expect(localGeometrySchema.safeParse({ type: 'Point', coordinates: [412, 288.5] }).success).toBe(true);
    expect(
      localGeometrySchema.safeParse({
        type: 'Polygon',
        coordinates: [
          [
            [380, 250],
            [460, 250],
            [460, 330],
            [380, 250],
          ],
        ],
      }).success,
    ).toBe(true);
  });

  it('refuses negative pixels and open rings', () => {
    expect(localGeometrySchema.safeParse({ type: 'Point', coordinates: [-1, 10] }).success).toBe(false);
    expect(
      localGeometrySchema.safeParse({
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        ],
      }).success,
    ).toBe(false);
  });
});

describe('map extent parameter', () => {
  it('reads west,south,east,north in WGS 84', () => {
    expect(parseBbox('7.1,43.6,7.4,43.8')).toEqual([7.1, 43.6, 7.4, 43.8]);
    expect(bboxParamSchema.safeParse('-61.9,15.8,-61,16.6').success).toBe(true);
  });

  it.each(['7.4,43.6,7.1,43.8', '7.1,43.8,7.4,43.6', '181,0,182,1', '7,43', 'a,b,c,d', '7.1,43.6,7.4,43.8,1'])(
    'refuses %s',
    (value) => {
      expect(bboxParamSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('drawn surfaces', () => {
  const square = [
    [0, 0],
    [0.001, 0],
    [0.001, 0.001],
    [0, 0],
  ];

  it('accepts a Polygon or a MultiPolygon', () => {
    expect(surfaceSchema.safeParse({ type: 'Polygon', coordinates: [square] }).success).toBe(true);
    expect(surfaceSchema.safeParse({ type: 'MultiPolygon', coordinates: [[square], [square]] }).success).toBe(true);
    expect(surfaceSchema.safeParse({ type: 'Point', coordinates: [0, 0] }).success).toBe(false);
  });

  it('refuses a contour with too many vertices', () => {
    const ring = [...Array.from({ length: 2000 }, (_, index) => [index / 1e6, index / 1e6]), [0, 0]];
    expect(surfaceSchema.safeParse({ type: 'Polygon', coordinates: [ring] }).success).toBe(false);
  });
});
