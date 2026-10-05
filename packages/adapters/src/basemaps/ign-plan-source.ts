import { setTimeout as delay } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import type { BasemapSourceInfo, BasemapStyleFile, BasemapTileSource } from '@etare/application';
import { IgnCartographyCatalog } from '../cartography/ign';

/**
 * Plan IGN vector tiles through the flow agreed with the IGN (ADR-024): the
 * IGN offers no file of the vector product, only its tile service, whose
 * caching is allowed. Pace, identification and retries are set here; the
 * worker calls it only once the rights of the product are approved (rights
 * sheet signed off by the SIG referent): never as a harvest of the public flow.
 */
const PLAN_IGN_ID = 'ign-plan-vector';
const STYLE_URL = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json';
const SPRITE_URL = 'https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/sprite/PlanIgn';
const MAX_ATTEMPTS = 4;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Rights of the product as the cartography catalogue records them (rights sheet). */
export function ignPlanSourceInfo(): BasemapSourceInfo {
  const source = new IgnCartographyCatalog().sources().find((candidate) => candidate.id === PLAN_IGN_ID);
  if (!source) throw new Error('Plan IGN vector source missing from the catalogue.');
  return {
    id: PLAN_IGN_ID,
    product: 'Plan IGN (tuiles vectorielles)',
    attribution: source.attribution,
    licenceName: source.licence.name,
    licenceUrl: source.licence.url,
    synthetic: false,
    rights: source.rights.offlinePackaging,
    rightsReference: source.rights.reference ?? null,
  };
}

/** Fonts of the tablet replacing the remote fonts of the IGN style (the application embeds them). */
export function tabletFont(font: string): string {
  if (/italic/i.test(font)) return 'NotoSans-Italic';
  if (/bold|semibold|black|medium/i.test(font)) return 'NotoSans-Medium';
  return 'NotoSans-Regular';
}

/** A font stack (font names), as opposed to an expression (lower-case operator first). */
const isFontStack = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((item) => typeof item === 'string') &&
  /[A-Z ]/.test(String(value[0]));

/** Fonts inside an expression: only the literal font stacks, the other strings are values. */
function mapFontsInExpression(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (value[0] === 'literal' && isFontStack(value[1])) return ['literal', [tabletFont(value[1][0] ?? '')]];
  return value.map(mapFontsInExpression);
}

/** The first font stands for the stack: one font per stack on the tablet. */
function mapFonts(value: unknown): unknown {
  if (isFontStack(value)) return [tabletFont(value[0] ?? '')];
  return mapFontsInExpression(value);
}

/**
 * The IGN style made local: one vector source read from the PMTiles file, the
 * pictograms and fonts installed on the tablet, nothing fetched from a server.
 */
export function localIgnStyle(style: Record<string, unknown>, attribution: string): Record<string, unknown> {
  const sources = (style.sources ?? {}) as Record<string, { type?: string }>;
  const vectorIds = Object.keys(sources).filter((id) => sources[id]?.type === 'vector');
  const vectorId = vectorIds[0];
  if (!vectorId) throw new Error('The IGN style has no vector source.');
  const layers = Array.isArray(style.layers) ? (style.layers as Record<string, unknown>[]) : [];
  return {
    ...style,
    glyphs: 'file://{{GLYPHS_DIR}}/{fontstack}/{range}.pbf',
    sprite: 'file://{{BASEMAP_DIR}}/sprite',
    sources: {
      [vectorId]: { type: 'vector', url: 'pmtiles://file://{{BASEMAP_DIR}}/tiles.pmtiles', attribution },
    },
    layers: layers
      .filter((layer) => layer.type === 'background' || layer.source === vectorId)
      .map((layer) => {
        const layout = layer.layout as Record<string, unknown> | undefined;
        if (!layout || !('text-font' in layout)) return layer;
        return { ...layer, layout: { ...layout, 'text-font': mapFonts(layout['text-font']) } };
      }),
  };
}

export interface IgnPlanSourceOptions {
  /** Contact of the operator, sent with each request (identification agreed with the IGN). */
  readonly contact: string;
  /** Requests per second at most. */
  readonly requestsPerSecond: number;
  readonly fetch?: Fetch;
  readonly tileUrl?: string;
}

export class IgnPlanBasemapSource implements BasemapTileSource {
  readonly info: BasemapSourceInfo = ignPlanSourceInfo();
  private readonly fetch: Fetch;
  private readonly interval: number;
  private nextSlot = 0;

  constructor(private readonly options: IgnPlanSourceOptions) {
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.interval = 1_000 / Math.max(0.1, options.requestsPerSecond);
  }

  /** One request per interval, whatever the number of tiles fetched in parallel. */
  private async pace(signal: AbortSignal): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.interval;
    if (slot > now) await delay(slot - now, undefined, { signal });
  }

  private async get(url: string, signal: AbortSignal): Promise<Uint8Array | null> {
    for (let attempt = 1; ; attempt++) {
      await this.pace(signal);
      let response: Response | null = null;
      try {
        response = await this.fetch(url, {
          signal,
          headers: { 'user-agent': `FireScape-fonds-hors-ligne/1.0 (+${this.options.contact})` },
        });
      } catch (error) {
        if (signal.aborted || attempt >= MAX_ATTEMPTS) throw error;
      }
      if (response) {
        if (response.status === 404 || response.status === 204) return null;
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          return bytes[0] === 0x1f && bytes[1] === 0x8b ? new Uint8Array(gunzipSync(bytes)) : bytes;
        }
        if (attempt >= MAX_ATTEMPTS || (response.status !== 429 && response.status < 500)) {
          throw new Error(`IGN_HTTP_${response.status}`);
        }
      }
      await delay(500 * 2 ** attempt, undefined, { signal });
    }
  }

  tile(z: number, x: number, y: number, signal: AbortSignal): Promise<Uint8Array | null> {
    const template = this.options.tileUrl ?? 'https://data.geopf.fr/tms/1.0.0/PLAN.IGN/{z}/{x}/{y}.pbf';
    return this.get(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), signal);
  }

  async styleFiles(signal: AbortSignal): Promise<{ style: Record<string, unknown>; files: BasemapStyleFile[] }> {
    const styleBytes = await this.get(STYLE_URL, signal);
    if (!styleBytes) throw new Error('IGN_STYLE_MISSING');
    const style = JSON.parse(new TextDecoder().decode(styleBytes)) as Record<string, unknown>;
    const files: BasemapStyleFile[] = [];
    for (const [suffix, extension, mediaType] of [
      ['', 'json', 'application/json'],
      ['', 'png', 'image/png'],
      ['@2x', 'json', 'application/json'],
      ['@2x', 'png', 'image/png'],
    ] as const) {
      const content = await this.get(`${SPRITE_URL}${suffix}.${extension}`, signal);
      if (!content) throw new Error('IGN_SPRITE_MISSING');
      files.push({ path: `sprite${suffix}.${extension}`, content, mediaType });
    }
    return { style: localIgnStyle(style, this.info.attribution), files };
  }
}
