import type { BasemapSourceInfo, BasemapTileSource } from '@etare/application';
import type { BasemapSourceId, WorkerEnv } from '@etare/config';
import { IgnPlanBasemapSource, ignPlanSourceInfo } from './ign-plan-source';
import { SYNTHETIC_BASEMAP_SOURCE, SyntheticBasemapSource } from './synthetic-source';

export { PmtilesArchiveFactory } from './pmtiles-writer';
export { IgnPlanBasemapSource, localIgnStyle, tabletFont } from './ign-plan-source';
export { SyntheticBasemapSource, syntheticStyle, syntheticTile } from './synthetic-source';

/** Product and rights of the configured source (API: administration and request gate). */
export function basemapSourceInfo(id: BasemapSourceId | null): BasemapSourceInfo | null {
  if (id === 'synthetic') return SYNTHETIC_BASEMAP_SOURCE;
  if (id === 'ign-plan-vector') return ignPlanSourceInfo();
  return null;
}

/** Tile source of the worker for the configured source (null: none). */
export function basemapTileSource(config: WorkerEnv['basemap']): BasemapTileSource | null {
  if (!config) return null;
  if (config.source === 'synthetic') return new SyntheticBasemapSource();
  return new IgnPlanBasemapSource({
    contact: config.contact ?? 'contact non renseigné',
    requestsPerSecond: config.requestsPerSecond,
  });
}
