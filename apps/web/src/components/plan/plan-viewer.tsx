'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapCatalog, PlanRevision } from '@etare/contracts';
import { Alert } from '@etare/ui';
import type { StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, type ReactNode } from 'react';
import { useMapLibre, type LoadedMap } from '@/components/map/use-map';
import { planBounds, planCorners } from './local-frame';

export const PLAN_SOURCE = 'plan-background';

/** Style of a plan: its background image placed in the display frame, fonts from the catalogue. */
export function planStyle(catalog: MapCatalog, revision: PlanRevision, imageUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: catalog.glyphs.url,
    sources: {
      [PLAN_SOURCE]: { type: 'image', url: imageUrl, coordinates: planCorners(revision.width, revision.height) },
    },
    layers: [
      { id: 'paper', type: 'background', paint: { 'background-color': '#f1f5f9' } },
      { id: PLAN_SOURCE, type: 'raster', source: PLAN_SOURCE, paint: { 'raster-fade-duration': 0 } },
    ],
  };
}

/**
 * Zoomable view of a plan revision (mouse, keyboard and touch). Children and
 * `onLoaded` add business layers (objects, zones, risks) in plan pixels
 * converted to the display frame. Remount (key) to show another revision.
 */
export function PlanViewer({
  catalog,
  revision,
  imageUrl,
  label,
  onLoaded,
  children,
}: {
  catalog: MapCatalog;
  revision: PlanRevision;
  imageUrl: string;
  label: string;
  onLoaded?: ((loaded: LoadedMap) => void) | undefined;
  children?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { loaded, baseUnavailable } = useMapLibre(
    containerRef,
    catalog,
    { bounds: planBounds(revision.width, revision.height) },
    {
      style: planStyle(catalog, revision, imageUrl),
      scale: false,
      maxBounds: planBounds(revision.width, revision.height, 0.75),
    },
  );
  const notified = useRef<LoadedMap | null>(null);

  useEffect(() => {
    if (!loaded || notified.current === loaded) return;
    notified.current = loaded;
    onLoaded?.(loaded);
  }, [loaded, onLoaded]);

  return (
    <div
      className="relative h-[70dvh] min-h-[420px] overflow-hidden rounded-card border border-border bg-subtle"
      role="region"
      aria-label={label}
    >
      {/* MapLibre's stylesheet (unlayered) makes its container position:relative: size it, do not position it. */}
      <div ref={containerRef} className="h-full w-full" />
      {baseUnavailable ? (
        <Alert tone="important" className="absolute top-3 left-3 z-10 max-w-xs">
          Fond du plan indisponible : rechargez la page ; les objets du plan restent affichés.
        </Alert>
      ) : null}
      <p className="absolute bottom-2 left-2 z-10 rounded bg-surface/90 px-2 py-0.5 text-[11px] text-muted">
        Plan non calibré : aucune mesure en mètres.
      </p>
      {children}
    </div>
  );
}
