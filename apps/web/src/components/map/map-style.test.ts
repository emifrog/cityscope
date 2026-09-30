// @vitest-environment node
import type { MapCatalog, MapSitesResponse } from '@etare/contracts';
import { describe, expect, it } from 'vitest';
import { baseLayerId, baseMapStyle, bboxParam, mapColors, siteLayers, toSourceData } from './map-style';

const source = (id: string, product: string) => ({
  id,
  producer: 'IGN',
  product,
  kind: 'raster-wmts' as const,
  url: `https://data.geopf.fr/wmts?LAYER=${id}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
  tile_size: 256,
  min_zoom: 0,
  max_zoom: 19,
  attribution: `© IGN – ${product}`,
  licence: { name: 'Licence Ouverte 2.0 (Etalab)', url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/' },
  rights: {
    online_display: 'open' as const,
    offline_packaging: 'unverified' as const,
    pdf_export: 'unverified' as const,
  },
});

const catalog: MapCatalog = {
  sources: [
    source('plan', 'Plan IGN'),
    source('ortho', 'Photographies aériennes'),
    { ...source('vector', 'Plan IGN vecteur'), kind: 'vector-tms' },
  ],
  default_base: 'plan',
  glyphs: { url: 'https://data.geopf.fr/fonts/{fontstack}/{range}.pbf', font_stack: ['Source Sans Pro Bold'] },
};

describe('map style', () => {
  it('builds the base maps from the catalogue: tiles, zooms, attribution, one visible layer', () => {
    const style = baseMapStyle(catalog, 'ortho');
    expect(Object.keys(style.sources)).toEqual(['plan', 'ortho']);
    expect(style.sources['plan']).toMatchObject({ type: 'raster', tileSize: 256, attribution: '© IGN – Plan IGN' });
    expect(style.glyphs).toBe(catalog.glyphs.url);
    expect(style.layers.map((layer) => [layer.id, layer.layout?.visibility])).toEqual([
      [baseLayerId('plan'), 'none'],
      [baseLayerId('ortho'), 'visible'],
    ]);
  });

  it('uses the design tokens when available', () => {
    const tokens = { getPropertyValue: (name: string) => (name === '--color-brand-accent' ? ' #ff0000 ' : '') };
    expect(mapColors(tokens)).toMatchObject({ published: '#ff0000', known: '#475569' });
    const labels = siteLayers(mapColors(null), ['Source Sans Pro Bold']).find((layer) => layer.id === 'site-labels');
    expect(labels?.layout).toMatchObject({ 'text-font': ['Source Sans Pro Bold'] });
  });

  it('keeps the site id in the properties of the clustered source', () => {
    const response: MapSitesResponse = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: '06000002-0000-4000-8000-000000000001',
          geometry: { type: 'Point', coordinates: [7.2518, 43.7079] },
          properties: {
            name: 'EHPAD Les Oliviers',
            site_type: 'health',
            status: 'active',
            etare_number: null,
            city: 'Nice',
            published: true,
            publication_number: 1,
            verified_recently: false,
          },
        },
      ],
      truncated: false,
      extent: [7.2518, 43.7079, 7.2518, 43.7079],
      unlocated: 0,
    };
    expect(toSourceData(response).features[0]?.properties.site_id).toBe('06000002-0000-4000-8000-000000000001');
  });

  it('writes the visible extent as west,south,east,north within WGS 84 bounds', () => {
    const bounds = { getWest: () => -200, getSouth: () => 43.123456789, getEast: () => 7.5, getNorth: () => 95 };
    expect(bboxParam(bounds)).toBe('-180.00000,43.12346,7.50000,90.00000');
  });
});
