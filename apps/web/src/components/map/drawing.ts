'use client';

import type { GeometryKind } from '@etare/domain';
import type { TerraDraw } from 'terra-draw';
import type { LoadedMap } from './use-map';

type Hex = `#${string}`;
type Position = [number, number];

export type DrawnGeometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] };

const MODE_OF_KIND = { point: 'point', line: 'linestring', polygon: 'polygon' } as const;
const GEOMETRY_OF_KIND = { point: 'Point', line: 'LineString', polygon: 'Polygon' } as const;

/**
 * Terra Draw session on the map for one kind of geometry. Existing
 * geometries are loaded in selection mode (drag points and vertices);
 * otherwise the session starts drawing. Lines and polygons cannot cross
 * themselves.
 */
export async function startDrawing(
  loaded: LoadedMap,
  color: string,
  kind: GeometryKind,
  initial: readonly DrawnGeometry[],
): Promise<TerraDraw> {
  const [lib, { TerraDrawMapLibreGLAdapter }] = await Promise.all([
    import('terra-draw'),
    import('terra-draw-maplibre-gl-adapter'),
  ]);
  const noCrossing = (feature: Parameters<typeof lib.ValidateNotSelfIntersecting>[0], updateType?: unknown) =>
    String(updateType) === 'provisional' ? { valid: true } : lib.ValidateNotSelfIntersecting(feature);
  const editable = { midpoints: true, draggable: true, deletable: true };

  const draw = new lib.TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map: loaded.map }),
    modes: [
      new lib.TerraDrawSelectMode({
        flags: {
          polygon: {
            feature: { draggable: true, validation: (feature) => noCrossing(feature), coordinates: editable },
          },
          linestring: {
            feature: { draggable: true, validation: (feature) => noCrossing(feature), coordinates: editable },
          },
          point: { feature: { draggable: true } },
        },
      }),
      new lib.TerraDrawPolygonMode({
        validation: (feature, context) => noCrossing(feature, context.updateType),
        styles: { fillColor: color as Hex, fillOpacity: 0.25, outlineColor: color as Hex, outlineWidth: 2 },
      }),
      new lib.TerraDrawLineStringMode({
        validation: (feature, context) => noCrossing(feature, context.updateType),
        styles: { lineStringColor: color as Hex, lineStringWidth: 4 },
      }),
      new lib.TerraDrawPointMode({ styles: { pointColor: color as Hex, pointWidth: 8 } }),
    ],
  });
  draw.start();
  const mode = MODE_OF_KIND[kind];
  if (initial.length > 0) {
    draw.addFeatures(initial.map((geometry) => ({ type: 'Feature', geometry, properties: { mode } })));
  }
  draw.setMode(initial.length > 0 ? 'select' : mode);
  return draw;
}

export const drawModeOf = (kind: GeometryKind) => MODE_OF_KIND[kind];

/** Geometries of the expected kind currently drawn in the session. */
export function drawnGeometries(draw: TerraDraw, kind: GeometryKind): DrawnGeometry[] {
  return draw
    .getSnapshot()
    .filter(
      (feature) =>
        feature.properties['mode'] === MODE_OF_KIND[kind] && feature.geometry.type === GEOMETRY_OF_KIND[kind],
    )
    .map((feature) => feature.geometry as DrawnGeometry);
}
