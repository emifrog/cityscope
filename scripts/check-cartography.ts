/**
 * Checks the cartography catalogue against the live Géoplateforme services
 * (architecture §14: parameters are checked at deployment, then monitored):
 * WMTS layers against GetCapabilities, vector tile metadata and label fonts.
 * Needs network access to data.geopf.fr; not part of `pnpm check`.
 */
import {
  IGN_WMTS_CAPABILITIES_URL,
  IGN_WMTS_LAYERS,
  IgnCartographyCatalog,
  checkWmtsLayer,
} from '@etare/adapters/cartography';

const TIMEOUT_MS = 30_000;

async function fetchChecked(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response;
}

const catalog = new IgnCartographyCatalog();
const problems: string[] = [];

const capabilities = await (await fetchChecked(IGN_WMTS_CAPABILITIES_URL)).text();
for (const layer of IGN_WMTS_LAYERS) {
  const found = checkWmtsLayer(capabilities, layer);
  problems.push(...found);
  console.log(`${found.length === 0 ? 'OK ' : 'KO '} WMTS ${layer.layer} (${layer.tileMatrixSet}, ${layer.format})`);
}

for (const source of catalog.sources().filter((candidate) => candidate.kind === 'vector-tms')) {
  try {
    const metadata = (await (await fetchChecked(source.metadataUrl)).json()) as { maxzoom?: number };
    if (typeof metadata.maxzoom === 'number' && metadata.maxzoom < source.maxZoom) {
      problems.push(`${source.id}: zoom maximal annoncé ${metadata.maxzoom}, catalogue ${source.maxZoom}`);
    }
    console.log(`OK  tuiles vectorielles ${source.id}`);
  } catch (error) {
    problems.push(`${source.id}: ${(error as Error).message}`);
  }
}

const glyphs = catalog.glyphs();
for (const font of glyphs.fontStack) {
  try {
    await fetchChecked(glyphs.url.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', '0-255'));
    console.log(`OK  police ${font}`);
  } catch (error) {
    problems.push(`police ${font}: ${(error as Error).message}`);
  }
}

if (problems.length > 0) {
  console.error(`\n${problems.length} écart(s) avec le service :\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('\nCatalogue cartographique conforme aux services Géoplateforme.');
