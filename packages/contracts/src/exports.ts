import { isoDateTimeSchema, sha256Schema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

/**
 * Reversibility export of a SIS (ADMIN-04, ADR-033): every datum (JSON and CSV) and every
 * verified file of the SIS, prepared by the worker as ZIP parts, downloadable 7 days by the
 * administration through short-lived signed URLs. Audited at each step.
 */
export const EXPORT_STATUSES = ['queued', 'building', 'ready', 'failed', 'expired'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** One file to download: the data (JSON, CSV, manifest), a ZIP of files, or a file too big for a ZIP. */
export const EXPORT_PART_KINDS = ['data', 'files', 'file'] as const;

export const exportPartSchema = z
  .object({
    index: z.number().int().nonnegative(),
    kind: z.enum(EXPORT_PART_KINDS),
    filename: z.string(),
    media_type: z.string(),
    size_bytes: z.number().int().nonnegative(),
    sha256: sha256Schema,
  })
  .meta({ id: 'ExportPart' });
export type ExportPart = z.infer<typeof exportPartSchema>;

export const exportRunSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(EXPORT_STATUSES),
    requested_by_name: z.string().nullable(),
    requested_at: isoDateTimeSchema,
    started_at: isoDateTimeSchema.nullable(),
    finished_at: isoDateTimeSchema.nullable(),
    /** Until when the parts can be downloaded (7 days after the build). */
    expires_at: isoDateTimeSchema.nullable(),
    parts: z.array(exportPartSchema),
    total_bytes: z.number().int().nonnegative().nullable(),
    file_count: z.number().int().nonnegative().nullable(),
    row_count: z.number().int().nonnegative().nullable(),
    error_code: z.string().nullable(),
    error_detail: z.string().nullable(),
  })
  .meta({ id: 'ExportRun' });
export type ExportRun = z.infer<typeof exportRunSchema>;

export const exportListSchema = z.object({ items: z.array(exportRunSchema) }).meta({ id: 'ExportList' });

export const exportPartParamsSchema = z.object({ id: uuidSchema, index: z.coerce.number().int().nonnegative() });
