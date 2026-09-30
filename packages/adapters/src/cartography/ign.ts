import type { CartographyCatalog, MapGlyphs, MapSource } from '@etare/application';

/**
 * IGN / Géoplateforme is the reference map provider (ADR-006). Layer names,
 * TileMatrixSet, formats and zoom limits below were checked against the WMTS
 * GetCapabilities on 30/09/2026; `pnpm cartography:check` re-checks them.
 * Offline packaging rights are NOT granted by the online service: they stay
 * 'unverified' until a per-product rights sheet is signed off (architecture §13).
 */
const WMTS = 'https://data.geopf.fr/wmts';
export const IGN_WMTS_CAPABILITIES_URL = `${WMTS}?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetCapabilities`;

const OPEN_LICENCE = {
  name: 'Licence Ouverte 2.0 (Etalab)',
  url: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
};
const UNVERIFIED = { onlineDisplay: 'open', offlinePackaging: 'unverified', pdfExport: 'unverified' } as const;

/** WMTS layer as declared by the service (what `cartography:check` compares). */
export interface WmtsLayerDefinition {
  readonly sourceId: string;
  readonly layer: string;
  readonly style: string;
  readonly tileMatrixSet: string;
  readonly format: 'image/png' | 'image/jpeg';
  readonly minZoom: number;
  readonly maxZoom: number;
}

export const IGN_WMTS_LAYERS: readonly WmtsLayerDefinition[] = [
  {
    sourceId: 'ign-plan-v2',
    layer: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
    style: 'normal',
    tileMatrixSet: 'PM_0_19',
    format: 'image/png',
    minZoom: 0,
    maxZoom: 19,
  },
  {
    sourceId: 'ign-orthophoto',
    layer: 'ORTHOIMAGERY.ORTHOPHOTOS',
    style: 'normal',
    tileMatrixSet: 'PM_0_19',
    format: 'image/jpeg',
    minZoom: 0,
    maxZoom: 19,
  },
];

function wmtsTileUrl(definition: WmtsLayerDefinition): string {
  return (
    `${WMTS}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${definition.layer}&STYLE=${definition.style}` +
    `&TILEMATRIXSET=${definition.tileMatrixSet}&FORMAT=${definition.format}` +
    '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
  );
}

function wmtsSource(sourceId: string, product: string, attribution: string): MapSource {
  const definition = IGN_WMTS_LAYERS.find((candidate) => candidate.sourceId === sourceId);
  if (!definition) throw new Error(`Unknown IGN layer ${sourceId}.`);
  return {
    id: sourceId,
    producer: 'IGN',
    product,
    kind: 'raster-wmts',
    url: wmtsTileUrl(definition),
    tileSize: 256,
    metadataUrl: IGN_WMTS_CAPABILITIES_URL,
    attribution,
    licence: OPEN_LICENCE,
    minZoom: definition.minZoom,
    maxZoom: definition.maxZoom,
    rights: UNVERIFIED,
  };
}

const IGN_SOURCES: readonly MapSource[] = [
  wmtsSource('ign-plan-v2', 'Plan IGN', '© IGN – Plan IGN'),
  wmtsSource('ign-orthophoto', 'Photographies aériennes', '© IGN – BD ORTHO'),
  {
    id: 'ign-plan-vector',
    producer: 'IGN',
    product: 'Plan IGN (tuiles vectorielles)',
    kind: 'vector-tms',
    url: 'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf',
    tileSize: 512,
    metadataUrl: 'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/metadata.json',
    attribution: '© IGN – Plan IGN',
    licence: OPEN_LICENCE,
    minZoom: 0,
    maxZoom: 18,
    rights: UNVERIFIED,
  },
];

const IGN_GLYPHS: MapGlyphs = {
  url: 'https://data.geopf.fr/annexes/ressources/vectorTiles/fonts/{fontstack}/{range}.pbf',
  fontStack: ['Source Sans Pro Bold'],
};

export class IgnCartographyCatalog implements CartographyCatalog {
  sources(): readonly MapSource[] {
    return IGN_SOURCES;
  }

  defaultBaseMap(): MapSource {
    const plan = IGN_SOURCES[0];
    if (!plan) throw new Error('IGN catalogue is empty.');
    return plan;
  }

  glyphs(): MapGlyphs {
    return IGN_GLYPHS;
  }
}

/**
 * Compares a layer definition with the WMTS capabilities document: the layer
 * exists, and advertises the style, format, TileMatrixSet and zoom limits used.
 * Returns the list of discrepancies (empty when conforming).
 */
export function checkWmtsLayer(capabilitiesXml: string, definition: WmtsLayerDefinition): string[] {
  const marker = `<ows:Identifier>${definition.layer}</ows:Identifier>`;
  const at = capabilitiesXml.indexOf(marker);
  if (at < 0) return [`${definition.layer}: couche absente du service`];
  const block = capabilitiesXml.slice(
    capabilitiesXml.lastIndexOf('<Layer>', at),
    capabilitiesXml.indexOf('</Layer>', at),
  );
  const values = (tag: string) =>
    [...block.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'))].map((match) => match[1]);

  const problems: string[] = [];
  if (!values('Format').includes(definition.format))
    problems.push(`${definition.layer}: format ${definition.format} non annoncé`);
  if (!values('TileMatrixSet').includes(definition.tileMatrixSet)) {
    problems.push(`${definition.layer}: TileMatrixSet ${definition.tileMatrixSet} non annoncé`);
  }
  const style = /<Style[^>]*>[\s\S]*?<ows:Identifier>([^<]+)<\/ows:Identifier>/.exec(block)?.[1];
  if (style !== definition.style) problems.push(`${definition.layer}: style ${definition.style} non annoncé`);
  const zooms = values('TileMatrix').map(Number).filter(Number.isFinite);
  if (zooms.length > 0 && (Math.min(...zooms) > definition.minZoom || Math.max(...zooms) < definition.maxZoom)) {
    problems.push(`${definition.layer}: zooms annoncés ${Math.min(...zooms)}–${Math.max(...zooms)}`);
  }
  return problems;
}
