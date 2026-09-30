import type { OperationalObject, PlanPosition, Risk, Zone } from '@etare/contracts';
import type { ObjectCategory } from '@etare/domain';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import {
  filterObjectLayers,
  objectLayerId,
  objectLayers,
  type ObjectFeatureCollection,
} from '@/components/map/object-layers';
import { geometryToFrame, type LocalGeometry, type LocalPosition } from './local-frame';
import { RISK_COLOR, riskImageName } from './risk-pictograms';

/**
 * Layers of a plan (PLAN-04): risks, water, access, energy, rescue means,
 * annotations and zones. Each object category belongs to exactly one layer.
 */
export const PLAN_LAYER_GROUPS = [
  { key: 'risks', label: 'Risques', categories: ['risk'] },
  { key: 'water', label: 'Eau', categories: ['water'] },
  { key: 'access', label: 'Accès', categories: ['access'] },
  { key: 'energy', label: 'Énergie', categories: ['energy'] },
  {
    key: 'rescue',
    label: 'Secours',
    categories: ['safety', 'smoke_control', 'refuge', 'vertical', 'communication'],
  },
  { key: 'annotations', label: 'Annotations', categories: ['annotation'] },
  { key: 'zones', label: 'Zones', categories: [] },
] as const satisfies readonly { key: string; label: string; categories: readonly ObjectCategory[] }[];
export type PlanLayerKey = (typeof PLAN_LAYER_GROUPS)[number]['key'];
export const ALL_PLAN_LAYERS: readonly PlanLayerKey[] = PLAN_LAYER_GROUPS.map((group) => group.key);

export function layerOfCategory(category: ObjectCategory): PlanLayerKey {
  const group = PLAN_LAYER_GROUPS.find((candidate) =>
    (candidate.categories as readonly ObjectCategory[]).includes(category),
  );
  return group?.key ?? 'annotations';
}

const SOURCES = {
  zones: 'plan-zones',
  zoneLabels: 'plan-zone-labels',
  objects: 'plan-objects',
  riskAreas: 'plan-risk-areas',
  risks: 'plan-risks',
} as const;
export const PLAN_OBJECTS = 'plan-objects';

/** Layers a click opens (their features carry `kind` and `id`). */
export const CLICKABLE_PLAN_LAYERS = [
  'plan-zones-fill',
  'plan-risk-areas-fill',
  'plan-risks-symbol',
  objectLayerId(PLAN_OBJECTS, 'point'),
  objectLayerId(PLAN_OBJECTS, 'line'),
  objectLayerId(PLAN_OBJECTS, 'fill'),
] as const;

const ZONE_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'zone_type'],
  'refuge',
  '#15803d',
  'technical',
  '#b45309',
  'storage',
  '#7c3aed',
  'circulation',
  '#64748b',
  '#334155',
];

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

/** Sources and layers of plan items, above the background. */
export function addPlanLayers(map: MapLibreMap, fontStack: readonly string[]) {
  for (const source of Object.values(SOURCES)) map.addSource(source, { type: 'geojson', data: EMPTY });
  const font = [...fontStack];
  map.addLayer({
    id: 'plan-zones-fill',
    type: 'fill',
    source: SOURCES.zones,
    paint: { 'fill-color': ZONE_COLOR, 'fill-opacity': 0.12 },
  });
  map.addLayer({
    id: 'plan-zones-outline',
    type: 'line',
    source: SOURCES.zones,
    paint: { 'line-color': ZONE_COLOR, 'line-width': 2, 'line-dasharray': [3, 2] },
  });
  // Room names under the items: objects and risks keep the priority when labels collide.
  map.addLayer({
    id: 'plan-zone-labels',
    type: 'symbol',
    source: SOURCES.zoneLabels,
    layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': 11, 'text-optional': true },
    paint: { 'text-color': '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  });
  map.addLayer({
    id: 'plan-risk-areas-fill',
    type: 'fill',
    source: SOURCES.riskAreas,
    paint: { 'fill-color': RISK_COLOR, 'fill-opacity': 0.14 },
  });
  map.addLayer({
    id: 'plan-risk-areas-outline',
    type: 'line',
    source: SOURCES.riskAreas,
    paint: { 'line-color': RISK_COLOR, 'line-width': 2, 'line-dasharray': [2, 1.5] },
  });
  for (const layer of objectLayers(PLAN_OBJECTS, SOURCES.objects, fontStack, 0)) map.addLayer(layer);
  map.addLayer({
    id: 'plan-risks-symbol',
    type: 'symbol',
    source: SOURCES.risks,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-allow-overlap': true,
      'text-field': ['get', 'label'],
      'text-font': font,
      'text-size': 11,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': RISK_COLOR, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
  });
}

/** Area-weighted centroid of the outer ring (label and pictogram position of a surface). */
export function ringCentroid(ring: readonly LocalPosition[]): LocalPosition {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x0, y0] = ring[index] ?? [0, 0];
    const [x1, y1] = ring[index + 1] ?? [0, 0];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    const count = Math.max(ring.length, 1);
    return [ring.reduce((sum, [px]) => sum + px, 0) / count, ring.reduce((sum, [, py]) => sum + py, 0) / count];
  }
  return [x / (3 * area), y / (3 * area)];
}

const onRevision = (position: PlanPosition | null, revisionId: string): position is PlanPosition =>
  position?.plan_revision_id === revisionId;

const frame = (geometry: PlanPosition['geometry']) => geometryToFrame(geometry as LocalGeometry);

export interface PlanItems {
  readonly objects: readonly OperationalObject[];
  readonly zones: readonly Zone[];
  readonly risks: readonly Risk[];
}

/** GeoJSON sources of the items drawn on one background revision (display frame, archived items left out). */
export function planItemsData(revisionId: string, items: PlanItems) {
  const zones = items.zones.filter((zone) => zone.status !== 'archived' && onRevision(zone.plan_position, revisionId));
  const objects = items.objects.filter(
    (object) => object.status !== 'archived' && onRevision(object.plan_position, revisionId),
  );
  const risks = items.risks.filter((risk) => risk.status !== 'archived' && onRevision(risk.plan_position, revisionId));
  const surfaces = risks.filter((risk) => risk.plan_position?.geometry.type === 'Polygon');

  const objectData: ObjectFeatureCollection = {
    type: 'FeatureCollection',
    features: objects.map((object) => ({
      type: 'Feature' as const,
      geometry: frame((object.plan_position as PlanPosition).geometry),
      properties: {
        id: object.id,
        kind: 'object',
        category: object.category,
        label: object.label,
        name: object.name,
        type_name: object.type_name,
        status: object.status,
        criticality: object.criticality,
      },
    })),
  };
  const outerRing = (geometry: PlanPosition['geometry']) =>
    geometry.type === 'Polygon' ? (geometry.coordinates[0] as LocalPosition[]) : [];

  return {
    zones: {
      type: 'FeatureCollection' as const,
      features: zones.map((zone) => ({
        type: 'Feature' as const,
        geometry: frame((zone.plan_position as PlanPosition).geometry),
        properties: { id: zone.id, kind: 'zone', name: zone.name, zone_type: zone.zone_type },
      })),
    },
    zoneLabels: {
      type: 'FeatureCollection' as const,
      features: zones.map((zone) => ({
        type: 'Feature' as const,
        geometry: frame({
          type: 'Point',
          coordinates: ringCentroid(outerRing((zone.plan_position as PlanPosition).geometry)),
        }),
        properties: { id: zone.id, name: zone.name },
      })),
    },
    objects: objectData,
    riskAreas: {
      type: 'FeatureCollection' as const,
      features: surfaces.map((risk) => ({
        type: 'Feature' as const,
        geometry: frame((risk.plan_position as PlanPosition).geometry),
        properties: { id: risk.id, kind: 'risk' },
      })),
    },
    risks: {
      type: 'FeatureCollection' as const,
      features: risks.map((risk) => {
        const geometry = (risk.plan_position as PlanPosition).geometry;
        const anchor = geometry.type === 'Point' ? geometry.coordinates : ringCentroid(outerRing(geometry));
        return {
          type: 'Feature' as const,
          geometry: frame({ type: 'Point', coordinates: anchor as LocalPosition }),
          properties: {
            id: risk.id,
            kind: 'risk',
            icon: riskImageName(risk.icon_key),
            label: risk.label ?? risk.type_name,
          },
        };
      }),
    },
  };
}

export type PlanItemsData = ReturnType<typeof planItemsData>;

export function setPlanItemsData(map: MapLibreMap, data: PlanItemsData) {
  for (const key of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) {
    map.getSource<GeoJSONSource>(SOURCES[key])?.setData(data[key] as Parameters<GeoJSONSource['setData']>[0]);
  }
}

const notId = (hiddenId: string | null): FilterSpecification => ['!=', ['get', 'id'], hiddenId ?? ''];

/** Shows the chosen layers and hides the item being edited (drawn by Terra Draw instead). */
export function filterPlanLayers(map: MapLibreMap, visible: readonly PlanLayerKey[], hiddenId: string | null) {
  const categories = PLAN_LAYER_GROUPS.filter((group) => visible.includes(group.key)).flatMap(
    (group) => group.categories as readonly ObjectCategory[],
  );
  filterObjectLayers(map, PLAN_OBJECTS, categories, hiddenId);
  const show = (key: PlanLayerKey) => (visible.includes(key) ? 'visible' : 'none');
  for (const id of ['plan-zones-fill', 'plan-zones-outline', 'plan-zone-labels']) {
    map.setLayoutProperty(id, 'visibility', show('zones'));
    map.setFilter(id, notId(hiddenId));
  }
  for (const id of ['plan-risk-areas-fill', 'plan-risk-areas-outline', 'plan-risks-symbol']) {
    map.setLayoutProperty(id, 'visibility', show('risks'));
    map.setFilter(id, notId(hiddenId));
  }
}
