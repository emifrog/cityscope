// @vitest-environment node
import type { OperationalObject } from '@etare/contracts';
import { describe, expect, it } from 'vitest';
import { objectLayers, siteObjectsData } from './object-layers';

const object = (overrides: Partial<OperationalObject>): OperationalObject => ({
  id: '06000009-0000-4000-8000-000000000004',
  site_id: '06000002-0000-4000-8000-000000000001',
  building_id: null,
  object_type_id: '00000000-0000-4000-8000-00000000000a',
  type_code: 'PEI',
  type_name: 'Point d’eau incendie',
  category: 'water',
  name: 'PEI principal',
  label: 'PEI 1',
  geometry: { type: 'Point', coordinates: [7.2509, 43.7074] },
  properties: { debit_m3h: 120 },
  instructions: null,
  criticality: 'important',
  status: 'active',
  verified_at: null,
  distance_m: 91,
  row_version: 1,
  ...overrides,
});

describe('object layers', () => {
  it('shows the objects placed on the map, not the archived ones nor those placed on plans only', () => {
    const data = siteObjectsData([
      object({}),
      object({ id: 'archived', status: 'archived' }),
      object({ id: 'interior', geometry: null }),
    ]);
    expect(data.features.map((feature) => feature.properties.id)).toEqual(['06000009-0000-4000-8000-000000000004']);
    expect(data.features[0]?.properties).toMatchObject({ category: 'water', label: 'PEI 1' });
  });

  it('draws polygons, lines, points and labels, each filtered by geometry and visible categories', () => {
    const layers = objectLayers('objects', 'objects', ['Source Sans Pro Bold'], 17);
    expect(layers.map((layer) => layer.id)).toEqual([
      'objects-fill',
      'objects-outline',
      'objects-line',
      'objects-point',
      'objects-label',
    ]);
    const point = layers.find((layer) => layer.id === 'objects-point');
    expect(JSON.stringify(point && 'filter' in point ? point.filter : null)).toContain('"Point"');
  });
});
