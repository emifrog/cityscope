// @vitest-environment node
import type { OperationalObject, PlanPosition, Risk, Zone } from '@etare/contracts';
import { OBJECT_CATEGORIES } from '@etare/domain';
import { describe, expect, it } from 'vitest';
import { DEGREES_PER_PIXEL } from './local-frame';
import { PLAN_LAYER_GROUPS, layerOfCategory, planItemsData, ringCentroid } from './plan-layers';

const CURRENT = '06000007-0000-4000-8000-000000000001';
const OLD = '06000007-0000-4000-8000-000000000000';
const position = (revision: string, geometry: PlanPosition['geometry']): PlanPosition => ({
  plan_id: '06000006-0000-4000-8000-000000000001',
  plan_revision_id: revision,
  revision_no: revision === CURRENT ? 2 : 1,
  is_current: revision === CURRENT,
  geometry,
});
const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [100, 100],
      [300, 100],
      [300, 200],
      [100, 200],
      [100, 100],
    ] as [number, number][],
  ],
};

describe('plan layers', () => {
  it('puts every object category in exactly one layer', () => {
    for (const category of OBJECT_CATEGORIES) {
      expect(
        PLAN_LAYER_GROUPS.filter((group) => (group.categories as readonly string[]).includes(category)),
      ).toHaveLength(1);
      expect(layerOfCategory(category)).not.toBe('zones');
    }
  });

  it('places labels at the centroid of surfaces', () => {
    expect(ringCentroid(square.coordinates[0] ?? [])).toEqual([200, 150]);
  });

  it('draws the items of the shown revision only, archived ones left out, in the display frame', () => {
    const zone = {
      id: 'z1',
      status: 'active',
      name: 'Local',
      zone_type: 'technical',
      plan_position: position(CURRENT, square),
    } as unknown as Zone;
    const oldZone = { ...zone, id: 'z0', plan_position: position(OLD, square) } as Zone;
    const object = {
      id: 'o1',
      status: 'active',
      category: 'safety',
      plan_position: position(CURRENT, { type: 'Point', coordinates: [412, 288] }),
    } as unknown as OperationalObject;
    const archived = { ...object, id: 'o2', status: 'archived' } as OperationalObject;
    const risk = {
      id: 'r1',
      status: 'active',
      icon_key: 'risk-oxygen',
      label: null,
      type_name: 'Oxygène',
      plan_position: position(CURRENT, square),
    } as unknown as Risk;

    const data = planItemsData(CURRENT, { zones: [zone, oldZone], objects: [object, archived], risks: [risk] });
    expect(data.zones.features.map((feature) => feature.properties.id)).toEqual(['z1']);
    expect(data.objects.features.map((feature) => feature.properties.id)).toEqual(['o1']);
    expect(data.objects.features[0]?.geometry).toEqual({
      type: 'Point',
      coordinates: [412 * DEGREES_PER_PIXEL, -288 * DEGREES_PER_PIXEL],
    });
    expect(data.riskAreas.features).toHaveLength(1);
    expect(data.risks.features[0]?.properties).toMatchObject({ icon: 'risk-oxygen', label: 'Oxygène' });
    expect(data.risks.features[0]?.geometry).toEqual({
      type: 'Point',
      coordinates: [200 * DEGREES_PER_PIXEL, -150 * DEGREES_PER_PIXEL],
    });
  });
});
