import type { MapFeaturesResponse, OperationalObject } from '@etare/contracts';
import { OBJECT_CATEGORIES, type ObjectCategory } from '@etare/domain';
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';

/**
 * One colour per category. Colour is never the only cue: labels, the
 * legend and the object card name the category and the type.
 */
export const CATEGORY_COLORS: Readonly<Record<ObjectCategory, string>> = {
  access: '#15803d',
  water: '#1d4ed8',
  energy: '#b45309',
  safety: '#b91c1c',
  smoke_control: '#7c3aed',
  vertical: '#0f766e',
  risk: '#be185d',
  refuge: '#0891b2',
  communication: '#475569',
  annotation: '#64748b',
};

const categoryColor: ExpressionSpecification = [
  'match',
  ['get', 'category'],
  ...OBJECT_CATEGORIES.flatMap((category) => [category, CATEGORY_COLORS[category]]),
  '#475569',
] as unknown as ExpressionSpecification;

const GEOMETRY_TYPES = {
  fill: 'Polygon',
  outline: 'Polygon',
  line: 'LineString',
  point: 'Point',
  label: null,
} as const;
type ObjectLayerRole = keyof typeof GEOMETRY_TYPES;

export const objectLayerId = (prefix: string, role: ObjectLayerRole) => `${prefix}-${role}`;

function filterFor(
  role: ObjectLayerRole,
  visible: readonly ObjectCategory[],
  hiddenId: string | null,
): FilterSpecification {
  const geometryType = GEOMETRY_TYPES[role];
  return [
    'all',
    ...(geometryType ? [['==', ['geometry-type'], geometryType]] : []),
    ['in', ['get', 'category'], ['literal', [...visible]]],
    ['!=', ['get', 'id'], hiddenId ?? ''],
  ] as unknown as FilterSpecification;
}

/** Polygons, lines, points and labels of operational objects, coloured by category; out-of-service ones are marked. */
export function objectLayers(
  prefix: string,
  source: string,
  fontStack: readonly string[],
  labelMinZoom: number,
): LayerSpecification[] {
  const all = [...OBJECT_CATEGORIES];
  const outOfService: ExpressionSpecification = ['==', ['get', 'status'], 'out_of_service'];
  return [
    {
      id: objectLayerId(prefix, 'fill'),
      type: 'fill',
      source,
      filter: filterFor('fill', all, null),
      paint: { 'fill-color': categoryColor, 'fill-opacity': 0.25 },
    },
    {
      id: objectLayerId(prefix, 'outline'),
      type: 'line',
      source,
      filter: filterFor('outline', all, null),
      paint: { 'line-color': categoryColor, 'line-width': 2 },
    },
    {
      id: objectLayerId(prefix, 'line'),
      type: 'line',
      source,
      filter: filterFor('line', all, null),
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': categoryColor, 'line-width': 4, 'line-opacity': ['case', outOfService, 0.45, 1] },
    },
    {
      id: objectLayerId(prefix, 'point'),
      type: 'circle',
      source,
      filter: filterFor('point', all, null),
      paint: {
        'circle-radius': ['case', ['==', ['get', 'criticality'], 'critical'], 9, 7],
        'circle-color': categoryColor,
        'circle-stroke-color': ['case', outOfService, '#b91c1c', '#ffffff'],
        'circle-stroke-width': ['case', outOfService, 3, 2],
      },
    },
    {
      id: objectLayerId(prefix, 'label'),
      type: 'symbol',
      source,
      minzoom: labelMinZoom,
      filter: filterFor('label', all, null),
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ['get', 'type_name']],
        'text-font': [...fontStack],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
  ];
}

/** Shows the chosen categories (calques) and hides the object being edited. */
export function filterObjectLayers(
  map: MapLibreMap,
  prefix: string,
  visible: readonly ObjectCategory[],
  hiddenId: string | null = null,
) {
  for (const role of Object.keys(GEOMETRY_TYPES) as ObjectLayerRole[]) {
    map.setFilter(objectLayerId(prefix, role), filterFor(role, visible, hiddenId));
  }
}

export interface ObjectFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: {
    readonly type: 'Feature';
    readonly geometry: NonNullable<OperationalObject['geometry']>;
    readonly properties: {
      readonly id: string;
      readonly category: ObjectCategory;
      readonly label: string | null;
      readonly name: string | null;
      readonly type_name: string;
      readonly status: string;
      readonly criticality: string;
    };
  }[];
}

/** Objects of a site placed on the map (plan-only objects have no map geometry). */
export function siteObjectsData(objects: readonly OperationalObject[]): ObjectFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: objects.flatMap((object) =>
      object.geometry && object.status !== 'archived'
        ? [
            {
              type: 'Feature' as const,
              geometry: object.geometry,
              properties: {
                id: object.id,
                category: object.category,
                label: object.label,
                name: object.name,
                type_name: object.type_name,
                status: object.status,
                criticality: object.criticality,
              },
            },
          ]
        : [],
    ),
  };
}

/** Map details answer as a source: the object id is copied into the properties. */
export function detailObjectsData(response: MapFeaturesResponse): ObjectFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: response.objects.features.map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: { ...feature.properties, id: feature.id },
    })),
  };
}
