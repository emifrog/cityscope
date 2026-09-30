import type { CartographyCatalog, MapSource } from '@etare/application';

/**
 * IGN / Géoplateforme is the reference map provider (ADR-006). Endpoints come
 * from the public documentation of data.geopf.fr; layer names, zoom limits and
 * TileMatrixSet must be re-checked against GetCapabilities / metadata.json
 * during the cartography prototype (architecture §14) before any production use.
 * Offline packaging rights are NOT granted by the online service: they stay
 * 'unverified' until a per-product rights sheet is signed off (architecture §13).
 */
const WMTS = 'https://data.geopf.fr/wmts';
const WMTS_CAPABILITIES = `${WMTS}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities`;

function wmtsTileUrl(layer: string, format: 'image/png' | 'image/jpeg'): string {
  return (
    `${WMTS}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal` +
    `&TILEMATRIXSET=PM&FORMAT=${format}&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`
  );
}

const IGN_SOURCES: readonly MapSource[] = [
  {
    id: 'ign-plan-v2',
    producer: 'IGN',
    product: 'Plan IGN',
    kind: 'raster-wmts',
    url: wmtsTileUrl('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
    metadataUrl: WMTS_CAPABILITIES,
    attribution: '© IGN – Plan IGN',
    minZoom: 0,
    maxZoom: 19,
    rights: { onlineDisplay: 'open', offlinePackaging: 'unverified', pdfExport: 'unverified' },
  },
  {
    id: 'ign-plan-vector',
    producer: 'IGN',
    product: 'Plan IGN (tuiles vectorielles)',
    kind: 'vector-tms',
    url: 'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf',
    metadataUrl: 'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/metadata.json',
    attribution: '© IGN – Plan IGN',
    minZoom: 0,
    maxZoom: 18,
    rights: { onlineDisplay: 'open', offlinePackaging: 'unverified', pdfExport: 'unverified' },
  },
  {
    id: 'ign-orthophoto',
    producer: 'IGN',
    product: 'Photographies aériennes',
    kind: 'raster-wmts',
    url: wmtsTileUrl('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
    metadataUrl: WMTS_CAPABILITIES,
    attribution: '© IGN – BD ORTHO',
    minZoom: 0,
    maxZoom: 19,
    rights: { onlineDisplay: 'open', offlinePackaging: 'unverified', pdfExport: 'unverified' },
  },
];

export class IgnCartographyCatalog implements CartographyCatalog {
  sources(): readonly MapSource[] {
    return IGN_SOURCES;
  }

  defaultBaseMap(): MapSource {
    const plan = IGN_SOURCES[0];
    if (!plan) throw new Error('IGN catalogue is empty.');
    return plan;
  }
}
