'use client';

import type { MapCatalog } from '@etare/contracts';
import type * as MapLibre from 'maplibre-gl';
import type { LngLatBoundsLike, Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { FRANCE_VIEW, MAP_WORKER_URL, baseLayerId, baseMapStyle, baseMaps } from './map-style';

export type MapLibreModule = typeof MapLibre;

export interface InitialView {
  readonly bounds?: LngLatBoundsLike | undefined;
  readonly center?: [number, number] | undefined;
  readonly zoom?: number | undefined;
}

/** Non-geographic uses (plans): own style, no metric scale, movement kept around the content. */
export interface MapOptions {
  readonly style?: StyleSpecification | undefined;
  /** A plan without calibration has no metres: no scale (architecture §08). */
  readonly scale?: boolean | undefined;
  readonly maxBounds?: LngLatBoundsLike | undefined;
}

export interface LoadedMap {
  readonly map: MapLibreMap;
  readonly lib: MapLibreModule;
}

/**
 * Creates a MapLibre map in the container once the catalogue is known
 * (MapLibre needs the browser: loaded on demand), with navigation, metric
 * scale and full attribution. `loaded` is set when the style is ready for
 * business layers. A failing background is reported, never blocking.
 * View and options are read once: remount the component (React key) to change them.
 */
export function useMapLibre(
  container: RefObject<HTMLDivElement | null>,
  catalog: MapCatalog | undefined,
  view: InitialView,
  options: MapOptions = {},
) {
  const [loaded, setLoaded] = useState<LoadedMap | null>(null);
  const [baseUnavailable, setBaseUnavailable] = useState(false);
  const initialView = useRef(view);
  const initialOptions = useRef(options);

  useEffect(() => {
    const element = container.current;
    if (!catalog || !element) return;
    let disposed = false;
    let map: MapLibreMap | undefined;

    void import('maplibre-gl').then((lib) => {
      if (disposed) return;
      lib.setWorkerUrl(MAP_WORKER_URL);
      const start = initialView.current;
      const { style: ownStyle, scale = true, maxBounds } = initialOptions.current;
      const style = ownStyle ?? baseMapStyle(catalog, catalog.default_base);
      const backgroundSources = new Set(Object.keys(style.sources));
      // The style is applied once the listeners are in place: a style given as an object can be
      // loaded synchronously, and its readiness must not depend on its sources (a plan image, tiles).
      const instance = new lib.Map({
        container: element,
        center: start.center ?? FRANCE_VIEW.center,
        zoom: start.zoom ?? FRANCE_VIEW.zoom,
        ...(start.bounds ? { bounds: start.bounds, fitBoundsOptions: { padding: 48, maxZoom: 18 } } : {}),
        ...(maxBounds ? { maxBounds, renderWorldCopies: false } : {}),
        ...(ownStyle ? { maxZoom: 24 } : {}),
        attributionControl: { compact: false },
      });
      map = instance;
      instance.addControl(new lib.NavigationControl({ showCompass: false }), 'top-right');
      if (scale) instance.addControl(new lib.ScaleControl({ unit: 'metric' }), 'bottom-right');
      // A background failure never hides the operational data (architecture §14).
      instance.on('error', (event) => {
        const sourceId = (event as { sourceId?: string }).sourceId;
        if (sourceId && backgroundSources.has(sourceId)) setBaseUnavailable(true);
      });
      // Ready as soon as the style is: 'load' would also wait for the background tiles, and a slow
      // or failing background must never delay the SIS data (architecture §14).
      instance.once('style.load', () => setLoaded({ map: instance, lib }));
      instance.setStyle(style);
    });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [container, catalog]);

  return { loaded, baseUnavailable, clearBaseUnavailable: () => setBaseUnavailable(false) };
}

/** Shows one base map of the catalogue and hides the others. */
export function useBaseMap(loaded: LoadedMap | null, catalog: MapCatalog | undefined, active: string | null) {
  useEffect(() => {
    if (!loaded || !catalog || !active) return;
    for (const source of baseMaps(catalog)) {
      loaded.map.setLayoutProperty(baseLayerId(source.id), 'visibility', source.id === active ? 'visible' : 'none');
    }
  }, [loaded, catalog, active]);
}
