import { z } from 'zod';

export const uuidSchema = z.uuid();

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Opaque pagination cursor (never interpreted by clients). */
export const cursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, 'Curseur invalide.');

export const pageLimitSchema = z.coerce.number().int().min(1).max(100).default(25);

export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
