import { z } from 'zod';

/** Largest plan coordinate accepted in a request (the background size is checked by the database). */
const MAX_LOCAL_COORDINATE = 100_000;

/** GeoJSON position in WGS 84: [longitude, latitude] (RFC 7946 axis order). */
export const positionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
});

export const lineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(positionSchema).min(2).max(2000),
});

const linearRingSchema = z
  .array(positionSchema)
  .min(4)
  .refine((ring) => {
    const first = ring[0];
    const last = ring.at(-1);
    return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
  }, 'Un anneau doit être fermé.');

export const polygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(linearRingSchema).min(1),
});

export const multiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(linearRingSchema).min(1)).min(1),
});

/** Maximum number of positions of a drawn surface (keeps a request well under the 64 KiB body limit). */
export const MAX_SURFACE_POSITIONS = 2000;

const positionCount = (rings: readonly (readonly unknown[])[]) => rings.reduce((total, ring) => total + ring.length, 0);

/**
 * Positions on a plan, in pixels of its background (origin top-left, x to the
 * right, y downwards), GeoJSON-shaped. Never converted to GPS implicitly; the
 * database checks that they lie inside the background of their revision.
 */
export const localPositionSchema = z.tuple([
  z.number().finite().min(0).max(MAX_LOCAL_COORDINATE),
  z.number().finite().min(0).max(MAX_LOCAL_COORDINATE),
]);

const closedRing = <T extends z.ZodType<readonly [number, number]>>(position: T) =>
  z
    .array(position)
    .min(4)
    .refine((ring) => {
      const first = ring[0];
      const last = ring.at(-1);
      return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
    }, 'Un anneau doit être fermé.');

export const localPointGeometrySchema = z.object({ type: z.literal('Point'), coordinates: localPositionSchema });
export const localLineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(localPositionSchema).min(2).max(MAX_SURFACE_POSITIONS),
});
export const localPolygonSchema = z
  .object({ type: z.literal('Polygon'), coordinates: z.array(closedRing(localPositionSchema)).min(1) })
  .refine(
    (polygon) => positionCount(polygon.coordinates) <= MAX_SURFACE_POSITIONS,
    `Contour trop détaillé (${MAX_SURFACE_POSITIONS} sommets au plus).`,
  );

export const localGeometrySchema = z.union([localPointGeometrySchema, localLineStringSchema, localPolygonSchema]);
export type LocalGeometry = z.infer<typeof localGeometrySchema>;

/** Rectangle in WGS 84: [west, south, east, north] (GeoJSON bbox order). */
export type Bbox = readonly [number, number, number, number];

const BBOX_PATTERN = /^-?\d{1,3}(?:\.\d{1,9})?(?:,-?\d{1,3}(?:\.\d{1,9})?){3}$/;

/** Query parameter "west,south,east,north" (the visible map extent). */
export const bboxParamSchema = z
  .string()
  .regex(BBOX_PATTERN, 'Emprise attendue : ouest,sud,est,nord en degrés WGS 84.')
  .refine((value) => parseBbox(value) !== null, 'Emprise invalide (bornes WGS 84 ou ordre des coins).');

/** Parses a bbox parameter; null when out of WGS 84 bounds or inverted. */
export function parseBbox(value: string): Bbox | null {
  const parts = value.split(',').map(Number);
  const [west, south, east, north] = parts;
  if (parts.length !== 4 || west === undefined || south === undefined || east === undefined || north === undefined) {
    return null;
  }
  const inBounds =
    [west, east].every((lon) => lon >= -180 && lon <= 180) && [south, north].every((lat) => lat >= -90 && lat <= 90);
  return inBounds && west < east && south < north ? [west, south, east, north] : null;
}

/**
 * Footprint drawn on the map: a Polygon or a MultiPolygon (stored as
 * MultiPolygon). Validity (no self-intersection) is checked by PostGIS.
 */
export const surfaceSchema = z
  .union([polygonSchema, multiPolygonSchema])
  .refine(
    (surface) =>
      (surface.type === 'Polygon'
        ? positionCount(surface.coordinates)
        : surface.coordinates.reduce((total, polygon) => total + positionCount(polygon), 0)) <= MAX_SURFACE_POSITIONS,
    `Contour trop détaillé (${MAX_SURFACE_POSITIONS} sommets au plus).`,
  );
export type Surface = z.infer<typeof surfaceSchema>;
