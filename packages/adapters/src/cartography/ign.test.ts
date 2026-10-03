import { MAP_TILE_ORIGINS } from '@etare/contracts';
import { describe, expect, it } from 'vitest';
import { IGN_WMTS_LAYERS, IgnCartographyCatalog, checkWmtsLayer } from './ign';

/** Excerpt of the Géoplateforme WMTS capabilities (structure of the real document). */
const CAPABILITIES = `<Capabilities><Contents>
<Layer><ows:Title>Plan IGN v2</ows:Title><ows:Identifier>GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2</ows:Identifier>
<Style isDefault="true"><ows:Title>Légende générique</ows:Title><ows:Identifier>normal</ows:Identifier></Style>
<Format>image/png</Format>
<TileMatrixSetLink><TileMatrixSet>PM_0_19</TileMatrixSet><TileMatrixSetLimits>
<TileMatrixLimits><TileMatrix>0</TileMatrix></TileMatrixLimits>
<TileMatrixLimits><TileMatrix>19</TileMatrix></TileMatrixLimits>
</TileMatrixSetLimits></TileMatrixSetLink></Layer>
</Contents></Capabilities>`;

const plan = IGN_WMTS_LAYERS.find((layer) => layer.sourceId === 'ign-plan-v2');

describe('IGN catalogue', () => {
  it('only uses hosts that the CSP of the web application allows', () => {
    const catalog = new IgnCartographyCatalog();
    const urls = [
      ...catalog.sources().flatMap((source) => [source.url, ...('metadataUrl' in source ? [source.metadataUrl] : [])]),
      catalog.glyphs().url,
    ].filter((url): url is string => typeof url === 'string');
    expect(urls.length).toBeGreaterThan(2);
    for (const url of urls) expect(MAP_TILE_ORIGINS, url).toContain(new URL(url.replace(/[{}]/g, '')).origin);
  });

  it('exposes Plan IGN as default base map, with attribution, licence and unverified offline rights', () => {
    const base = new IgnCartographyCatalog().defaultBaseMap();
    expect(base).toMatchObject({ id: 'ign-plan-v2', attribution: '© IGN – Plan IGN' });
    expect(base.url).toContain('TILEMATRIXSET=PM_0_19');
    expect(base.rights.offlinePackaging).toBe('unverified');
  });

  it('accepts a layer declared as the service advertises it', () => {
    expect(plan && checkWmtsLayer(CAPABILITIES, plan)).toEqual([]);
  });

  it('reports a TileMatrixSet, format or layer that the service does not advertise', () => {
    if (!plan) throw new Error('missing definition');
    expect(checkWmtsLayer(CAPABILITIES, { ...plan, tileMatrixSet: 'PM' })).toEqual([
      'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2: TileMatrixSet PM non annoncé',
    ]);
    expect(checkWmtsLayer(CAPABILITIES, { ...plan, format: 'image/jpeg' })).toHaveLength(1);
    expect(checkWmtsLayer(CAPABILITIES, { ...plan, layer: 'ORTHOIMAGERY.ORTHOPHOTOS' })).toEqual([
      'ORTHOIMAGERY.ORTHOPHOTOS: couche absente du service',
    ]);
  });
});
