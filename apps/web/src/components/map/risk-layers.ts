import type { Risk } from '@etare/contracts';
import type { ExpressionSpecification, FilterSpecification, LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';

/**
 * Risks located on the map (MET-02): a point or a surface, red from severity
 * 4, orange below. Colour is never the only cue: the label shows the type or
 * the short text of the risk, and the side list gives the severity in words.
 */
export const RISK_COLORS = { high: '#b91c1c', other: '#c2410c' } as const;

const severityColor: ExpressionSpecification = [
  'case',
  ['>=', ['get', 'severity'], 4],
  RISK_COLORS.high,
  RISK_COLORS.other,
] as unknown as ExpressionSpecification;

const ROLES = { fill: 'Polygon', outline: 'Polygon', point: 'Point', label: null } as const;
type RiskLayerRole = keyof typeof ROLES;

export const riskLayerId = (prefix: string, role: RiskLayerRole) => `${prefix}-${role}`;
export const RISK_LAYER_ROLES = Object.keys(ROLES) as RiskLayerRole[];

function filterFor(role: RiskLayerRole, hiddenId: string | null): FilterSpecification {
  const geometryType = ROLES[role];
  return [
    'all',
    ...(geometryType ? [['==', ['geometry-type'], geometryType]] : []),
    ['!=', ['get', 'id'], hiddenId ?? ''],
  ] as unknown as FilterSpecification;
}

/** Surfaces (hatched by transparency), outlines, points (a square marker) and labels of the risks. */
export function riskLayers(
  prefix: string,
  source: string,
  fontStack: readonly string[],
  labelMinZoom: number,
): LayerSpecification[] {
  return [
    {
      id: riskLayerId(prefix, 'fill'),
      type: 'fill',
      source,
      filter: filterFor('fill', null),
      paint: { 'fill-color': severityColor, 'fill-opacity': 0.18 },
    },
    {
      id: riskLayerId(prefix, 'outline'),
      type: 'line',
      source,
      filter: filterFor('outline', null),
      paint: { 'line-color': severityColor, 'line-width': 2, 'line-dasharray': [3, 2] },
    },
    {
      id: riskLayerId(prefix, 'point'),
      type: 'circle',
      source,
      filter: filterFor('point', null),
      paint: {
        'circle-radius': 8,
        'circle-color': severityColor,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      },
    },
    {
      id: riskLayerId(prefix, 'label'),
      type: 'symbol',
      source,
      minzoom: labelMinZoom,
      filter: filterFor('label', null),
      layout: {
        'text-field': ['coalesce', ['get', 'label'], ['get', 'type_name']],
        'text-font': [...fontStack],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': RISK_COLORS.high, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
  ];
}

/** Hides the risk being edited (drawn by the editor instead). */
export function filterRiskLayers(map: MapLibreMap, prefix: string, hiddenId: string | null) {
  for (const role of RISK_LAYER_ROLES) map.setFilter(riskLayerId(prefix, role), filterFor(role, hiddenId));
}

/** Active risks of a site that have a location on the map. */
export function siteRisksData(risks: readonly Risk[]) {
  return {
    type: 'FeatureCollection' as const,
    features: risks.flatMap((risk) =>
      risk.geometry && risk.status === 'active'
        ? [
            {
              type: 'Feature' as const,
              geometry: risk.geometry,
              properties: { id: risk.id, label: risk.label, type_name: risk.type_name, severity: risk.severity },
            },
          ]
        : [],
    ),
  };
}
