import { describe, expect, it } from 'vitest';
import { localPointSchema, pointSchema, polygonSchema } from './geo';

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

describe('local plan coordinates', () => {
  const plan = '06000007-0000-4000-8000-000000000001';

  it('accepts pixel positions tied to a plan revision', () => {
    expect(localPointSchema.safeParse({ plan_revision_id: plan, unit: 'pixel', x: 412, y: 288 }).success).toBe(true);
  });

  it('bounds normalized coordinates', () => {
    expect(localPointSchema.safeParse({ plan_revision_id: plan, unit: 'normalized', x: 1.2, y: 0.5 }).success).toBe(
      false,
    );
  });

  it('requires the plan revision', () => {
    expect(localPointSchema.safeParse({ unit: 'pixel', x: 1, y: 1 }).success).toBe(false);
  });
});
