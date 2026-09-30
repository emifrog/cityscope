import type { MapCatalog, MapSitesQuery, MapSitesResponse } from '@etare/contracts';
import type { RequestContext } from '@etare/domain';
import type { CartographyCatalog } from './cartography';
import type { SessionFactory } from './ports';
import { inTenant } from './use-cases';

/** Base maps allowed by the server-side catalogue (no business data: any signed-in user). */
export function getMapCatalog(catalog: CartographyCatalog): MapCatalog {
  const glyphs = catalog.glyphs();
  return {
    sources: catalog.sources().map((source) => ({
      id: source.id,
      producer: source.producer,
      product: source.product,
      kind: source.kind,
      url: source.url,
      tile_size: source.tileSize,
      min_zoom: source.minZoom,
      max_zoom: source.maxZoom,
      attribution: source.attribution,
      licence: source.licence,
      rights: {
        online_display: source.rights.onlineDisplay,
        offline_packaging: source.rights.offlinePackaging,
        pdf_export: source.rights.pdfExport,
      },
    })),
    default_base: catalog.defaultBaseMap().id,
    glyphs: { url: glyphs.url, font_stack: [...glyphs.fontStack] },
  };
}

/** Positioned sites of the active SIS (working data: site:read, RLS applies). */
export async function listMapSites(
  sessions: SessionFactory,
  context: RequestContext,
  query: MapSitesQuery,
): Promise<MapSitesResponse> {
  return inTenant(sessions, context, 'site:read', (session) => session.sites.mapFeatures(query));
}
