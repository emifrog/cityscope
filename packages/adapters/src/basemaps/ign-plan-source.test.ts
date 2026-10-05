import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { basemapSourceInfo, basemapTileSource } from './index';
import { IgnPlanBasemapSource, ignPlanSourceInfo, localIgnStyle, tabletFont } from './ign-plan-source';

const signal = new AbortController().signal;

describe('Plan IGN through the agreed flow', () => {
  it('stays locked while the rights sheet is not signed off (ADR-024)', () => {
    const info = ignPlanSourceInfo();
    expect(info.rights).toBe('unverified');
    expect(info.synthetic).toBe(false);
    expect(info.attribution).toBe('© IGN – Plan IGN');
    expect(basemapSourceInfo('ign-plan-vector')?.rights).toBe('unverified');
    expect(basemapSourceInfo('synthetic')?.rights).toBe('approved');
    expect(basemapSourceInfo(null)).toBeNull();
  });

  it('is built from the worker configuration', () => {
    expect(basemapTileSource(null)).toBeNull();
    expect(basemapTileSource({ source: 'synthetic', contact: null, requestsPerSecond: 4 })?.info.id).toBe('synthetic');
    expect(
      basemapTileSource({ source: 'ign-plan-vector', contact: 'sig@sdis.example', requestsPerSecond: 2 })?.info.id,
    ).toBe('ign-plan-vector');
  });

  it('identifies the operator, inflates gzip tiles and maps an absent tile to null', async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/14/1/2.pbf')) return new Response(gzipSync(Buffer.from('tuile')));
      if (url.endsWith('/14/1/3.pbf')) return new Response(Buffer.from('brute'));
      return new Response(null, { status: 404 });
    });
    const source = new IgnPlanBasemapSource({ contact: 'sig@sdis.example', requestsPerSecond: 50, fetch });
    expect(new TextDecoder().decode((await source.tile(14, 1, 2, signal)) ?? undefined)).toBe('tuile');
    expect(new TextDecoder().decode((await source.tile(14, 1, 3, signal)) ?? undefined)).toBe('brute');
    expect(await source.tile(14, 9, 9, signal)).toBeNull();
    const headers = fetch.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['user-agent']).toContain('sig@sdis.example');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://data.geopf.fr/tms/1.0.0/PLAN.IGN/14/1/2.pbf');
  });

  it('retries a refusal of the server, then gives up visibly', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 1_000 });
    try {
      let calls = 0;
      const fetch = vi.fn(async () => {
        calls++;
        return calls < 3 ? new Response(null, { status: 503 }) : new Response(Buffer.from('ok'));
      });
      const source = new IgnPlanBasemapSource({ contact: 'c', requestsPerSecond: 50, fetch });
      expect(new TextDecoder().decode((await source.tile(1, 0, 0, signal)) ?? undefined)).toBe('ok');
      expect(calls).toBe(3);
      const refused = new IgnPlanBasemapSource({
        contact: 'c',
        requestsPerSecond: 50,
        fetch: async () => new Response(null, { status: 403 }),
      });
      await expect(refused.tile(1, 0, 0, signal)).rejects.toThrow('IGN_HTTP_403');
    } finally {
      vi.useRealTimers();
    }
  });

  it('paces its requests', async () => {
    const times: number[] = [];
    const source = new IgnPlanBasemapSource({
      contact: 'c',
      requestsPerSecond: 20,
      fetch: async () => {
        times.push(Date.now());
        return new Response(Buffer.from('t'));
      },
    });
    await Promise.all([0, 1, 2, 3].map((x) => source.tile(5, x, 0, signal)));
    expect((times.at(-1) ?? 0) - (times[0] ?? 0)).toBeGreaterThanOrEqual(140);
  });
});

describe('IGN style made local', () => {
  const remote = {
    version: 8,
    glyphs: 'https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/sprite/PlanIgn',
    sources: {
      plan_ign: { type: 'vector', tiles: ['https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf'] },
      relief: { type: 'raster', tiles: ['https://example.invalid/{z}/{x}/{y}.png'] },
    },
    layers: [
      { id: 'fond', type: 'background' },
      { id: 'routes', type: 'line', source: 'plan_ign', 'source-layer': 'routier_route' },
      { id: 'ombrage', type: 'raster', source: 'relief' },
      {
        id: 'toponymes',
        type: 'symbol',
        source: 'plan_ign',
        layout: { 'text-font': ['Source Sans Pro Italic'], 'text-field': '{texte}' },
      },
      {
        id: 'numeros',
        type: 'symbol',
        source: 'plan_ign',
        layout: { 'text-font': ['literal', ['Source Sans Pro Bold']] },
      },
    ],
  };

  it('reads the tiles, the pictograms and the fonts on the tablet only', () => {
    const style = localIgnStyle(remote, '© IGN – Plan IGN');
    const text = JSON.stringify(style);
    expect(text).not.toMatch(/https?:/);
    expect(style.sources).toEqual({
      plan_ign: {
        type: 'vector',
        url: 'pmtiles://file://{{BASEMAP_DIR}}/tiles.pmtiles',
        attribution: '© IGN – Plan IGN',
      },
    });
    expect(style.sprite).toBe('file://{{BASEMAP_DIR}}/sprite');
    expect(style.glyphs).toBe('file://{{GLYPHS_DIR}}/{fontstack}/{range}.pbf');
    const layers = style.layers as { id: string; layout?: Record<string, unknown> }[];
    expect(layers.map((layer) => layer.id)).toEqual(['fond', 'routes', 'toponymes', 'numeros']);
    expect(layers[2]?.layout?.['text-font']).toEqual(['NotoSans-Italic']);
    expect(layers[3]?.layout?.['text-font']).toEqual(['literal', ['NotoSans-Medium']]);
  });

  it('maps the IGN fonts to the fonts of the application', () => {
    expect(tabletFont('Source Sans Pro Regular')).toBe('NotoSans-Regular');
    expect(tabletFont('Source Sans Pro Semibold')).toBe('NotoSans-Medium');
    expect(tabletFont('Source Sans Pro Italic')).toBe('NotoSans-Italic');
  });

  it('refuses a style without vector source', () => {
    expect(() => localIgnStyle({ sources: {}, layers: [] }, 'x')).toThrow('vector source');
  });
});
