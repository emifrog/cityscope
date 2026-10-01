// @vitest-environment node
import type { OperationalObject } from '@etare/contracts';
import { describe, expect, it } from 'vitest';
import { describeWaterPoint, nearestWaterPoint } from './nearest-water';

const water = (id: string, distance: number | null, overrides: Partial<OperationalObject> = {}): OperationalObject => ({
  id,
  site_id: '06000002-0000-4000-8000-000000000001',
  building_id: null,
  level_id: null,
  zone_id: null,
  object_type_id: '00000000-0000-4000-8000-00000000000a',
  type_code: 'PEI',
  type_name: 'Point d’eau incendie',
  category: 'water',
  name: null,
  label: id,
  geometry: { type: 'Point', coordinates: [7.25, 43.7] },
  plan_position: null,
  properties: {},
  instructions: null,
  criticality: 'important',
  status: 'active',
  verified_at: null,
  distance_m: distance,
  row_version: 1,
  photos: [],
  ...overrides,
});

describe('nearest water point', () => {
  it('picks the closest water point in service', () => {
    const nearest = nearestWaterPoint([
      water('PEI 2', 72, { status: 'out_of_service' }),
      water('PEI 1', 91, { properties: { debit_m3h: 120 } }),
      water('PEI 3', 140),
      water('Plan', null),
      water('TGBT', 10, { category: 'energy' }),
    ]);
    expect(nearest?.label).toBe('PEI 1');
    expect(nearest && describeWaterPoint(nearest)).toBe('PEI 1 · 91 m · 120 m³/h');
  });

  it('finds nothing when no water point is in service', () => {
    expect(nearestWaterPoint([water('PEI 2', 72, { status: 'out_of_service' })])).toBeNull();
  });
});
