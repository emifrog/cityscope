import type { MapCatalog, MapSitesResponse } from '@etare/contracts';
import type { FilterSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

/** Where MapLibre finds its worker (copied by scripts/copy-map-worker.mjs, same origin). */
export const MAP_WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

/** Initial view before the sites are known: metropolitan France. */
export const FRANCE_VIEW = { center: [2.35, 46.6] as [number, number], zoom: 5 };

export const SITE_SOURCE = 'sites';
export const SITE_LAYERS = {
  clusters: 'site-clusters',
  clusterCount: 'site-cluster-count',
  verified: 'site-verified',
  points: 'site-points',
  selected: 'site-selected',
  labels: 'site-labels',
} as const;

export interface MapColors {
  readonly published: string;
  readonly known: string;
  readonly verified: string;
  readonly cluster: string;
  readonly selected: string;
}

/** Map colours follow the design tokens (packages/ui/src/styles/globals.css). */
export function mapColors(style: Pick<CSSStyleDeclaration, 'getPropertyValue'> | null): MapColors {
  const read = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback;
  return {
    published: read('--color-brand-accent', '#e8601c'),
    known: read('--color-muted', '#475569'),
    verified: read('--color-success', '#15803d'),
    cluster: read('--color-brand-navy', '#13233f'),
    selected: read('--color-focus', '#1d4ed8'),
  };
}

/** Base maps the web displays today: raster tiles (vector styles come with offline packages). */
export const baseMaps = (catalog: MapCatalog) => catalog.sources.filter((source) => source.kind === 'raster-wmts');

export const baseLayerId = (sourceId: string) => `base-${sourceId}`;

/**
 * Style with every raster base map of the catalogue, only one visible. Tile
 * URLs, zooms and attribution all come from the server-side catalogue.
 */
export function baseMapStyle(catalog: MapCatalog, activeBase: string): StyleSpecification {
  const bases = baseMaps(catalog);
  return {
    version: 8,
    glyphs: catalog.glyphs.url,
    sources: Object.fromEntries(
      bases.map((source) => [
        source.id,
        {
          type: 'raster',
          tiles: [source.url],
          tileSize: source.tile_size,
          minzoom: source.min_zoom,
          maxzoom: source.max_zoom,
          attribution: source.attribution,
        },
      ]),
    ),
    layers: bases.map((source) => ({
      id: baseLayerId(source.id),
      type: 'raster',
      source: source.id,
      layout: { visibility: source.id === activeBase ? 'visible' : 'none' },
    })),
  };
}

/** Clusters, then sites: orange when an ETARE is published, grey otherwise, green ring when recently checked. */
export function siteLayers(colors: MapColors, fontStack: readonly string[]): LayerSpecification[] {
  const isPoint: FilterSpecification = ['!', ['has', 'point_count']];
  return [
    {
      id: SITE_LAYERS.clusters,
      type: 'circle',
      source: SITE_SOURCE,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': colors.cluster,
        'circle-opacity': 0.9,
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    },
    {
      id: SITE_LAYERS.clusterCount,
      type: 'symbol',
      source: SITE_SOURCE,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': [...fontStack],
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    },
    {
      id: SITE_LAYERS.verified,
      type: 'circle',
      source: SITE_SOURCE,
      filter: ['all', isPoint, ['==', ['get', 'verified_recently'], true]],
      paint: {
        'circle-radius': 12,
        'circle-opacity': 0,
        'circle-stroke-color': colors.verified,
        'circle-stroke-width': 3,
      },
    },
    {
      id: SITE_LAYERS.points,
      type: 'circle',
      source: SITE_SOURCE,
      filter: isPoint,
      paint: {
        'circle-radius': 8,
        'circle-color': ['case', ['==', ['get', 'published'], true], colors.published, colors.known],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    },
    {
      id: SITE_LAYERS.selected,
      type: 'circle',
      source: SITE_SOURCE,
      filter: ['==', ['get', 'site_id'], ''],
      paint: {
        'circle-radius': 16,
        'circle-opacity': 0,
        'circle-stroke-color': colors.selected,
        'circle-stroke-width': 3,
      },
    },
    {
      id: SITE_LAYERS.labels,
      type: 'symbol',
      source: SITE_SOURCE,
      minzoom: 14,
      filter: isPoint,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': [...fontStack],
        'text-size': 12,
        'text-offset': [0, 1.4],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': colors.cluster, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
    },
  ];
}

export interface SiteSourceData {
  readonly type: 'FeatureCollection';
  readonly features: readonly {
    readonly type: 'Feature';
    readonly geometry: MapSitesResponse['features'][number]['geometry'];
    readonly properties: MapSitesResponse['features'][number]['properties'] & { readonly site_id: string };
  }[];
}

/** GeoJSON for the clustered source: the site id is copied into the properties (string ids are not kept). */
export function toSourceData(response: MapSitesResponse): SiteSourceData {
  return {
    type: 'FeatureCollection',
    features: response.features.map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: { ...feature.properties, site_id: feature.id },
    })),
  };
}

/** "west,south,east,north" parameter for the API, rounded to about 1 m. */
export function bboxParam(bounds: { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number }) {
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  return [
    clamp(bounds.getWest(), 180),
    clamp(bounds.getSouth(), 90),
    clamp(bounds.getEast(), 180),
    clamp(bounds.getNorth(), 90),
  ]
    .map((value) => value.toFixed(5))
    .join(',');
}
