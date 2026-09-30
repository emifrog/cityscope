import { LOCAL_UNITS } from '@etare/domain';
import { z } from 'zod';
import { uuidSchema } from './primitives';

/** GeoJSON position in WGS 84: [longitude, latitude] (RFC 7946 axis order). */
export const positionSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: positionSchema,
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

/**
 * Position drawn on a plan revision, in local coordinates (origin top-left,
 * x to the right, y downwards). Never converted to GPS implicitly.
 */
export const localPointSchema = z
  .object({
    plan_revision_id: uuidSchema,
    unit: z.enum(LOCAL_UNITS),
    x: z.number().finite(),
    y: z.number().finite(),
  })
  .superRefine((point, ctx) => {
    if (point.unit === 'normalized' && (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
      ctx.addIssue({ code: 'custom', message: 'Les coordonnées normalisées sont comprises entre 0 et 1.' });
    }
    if (point.unit === 'pixel' && (point.x < 0 || point.y < 0)) {
      ctx.addIssue({ code: 'custom', message: 'Les coordonnées en pixels sont positives.' });
    }
  });
