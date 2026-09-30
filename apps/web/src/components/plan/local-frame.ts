/**
 * Plans are displayed with MapLibre in a synthetic frame (ADR-011): plan
 * pixels (origin top-left, x to the right, y downwards) become tiny degree
 * offsets near (0, 0), where the Web Mercator projection is linear far below
 * a pixel. Positions are always STORED in plan pixels; these degrees exist
 * only on screen and never mean a place on Earth.
 */
export type LocalPosition = [number, number];
type Frame = [number, number];

/** 1e-5 degree per plan pixel: a 12 000 px plan spans 0.12°, non-linearity below 1e-7. */
export const DEGREES_PER_PIXEL = 1e-5;

/** A tenth of a pixel: finer than any click. */
const round = (value: number) => Math.round(value * 10) / 10;

export const toFrame = ([x, y]: readonly number[]): Frame => [
  (x ?? 0) * DEGREES_PER_PIXEL,
  -(y ?? 0) * DEGREES_PER_PIXEL,
];

export const toLocal = ([lng, lat]: readonly number[]): LocalPosition => [
  round((lng ?? 0) / DEGREES_PER_PIXEL),
  round(-(lat ?? 0) / DEGREES_PER_PIXEL) || 0,
];

/** Corners of the background image (top-left, top-right, bottom-right, bottom-left), as MapLibre expects them. */
export function planCorners(width: number, height: number): [Frame, Frame, Frame, Frame] {
  return [toFrame([0, 0]), toFrame([width, 0]), toFrame([width, height]), toFrame([0, height])];
}

/** [[west, south], [east, north]] of the plan, widened by a margin (fraction of its size). */
export function planBounds(width: number, height: number, margin = 0): [Frame, Frame] {
  const [west, north] = toFrame([-width * margin, -height * margin]);
  const [east, south] = toFrame([width * (1 + margin), height * (1 + margin)]);
  return [
    [west, south],
    [east, north],
  ];
}

export type LocalGeometry =
  | { type: 'Point'; coordinates: LocalPosition }
  | { type: 'LineString'; coordinates: LocalPosition[] }
  | { type: 'Polygon'; coordinates: LocalPosition[][] };

/** Geometry in plan pixels → geometry in the display frame. */
export function geometryToFrame(geometry: LocalGeometry): LocalGeometry {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: toFrame(geometry.coordinates) };
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(toFrame) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(toFrame)) };
  }
}

/** Geometry drawn in the display frame → geometry in plan pixels (rounded to a tenth of a pixel). */
export function geometryToLocal(geometry: LocalGeometry): LocalGeometry {
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: toLocal(geometry.coordinates) };
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(toLocal) };
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => ring.map(toLocal)) };
  }
}
