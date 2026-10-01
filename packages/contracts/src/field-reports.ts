import {
  MAX_REPORT_DECISION,
  MAX_REPORT_DESCRIPTION,
  MAX_REPORT_PHOTOS,
  REPORT_CATEGORIES,
  REPORT_ITEM_TYPES,
  REPORT_SEVERITIES,
  REPORT_STATUSES,
} from '@etare/domain';
import { cursorSchema, isoDateTimeSchema, pageLimitSchema, sha256Schema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';
import { assetSchema, fileDeclarationSchema, uploadTicketSchema } from './documents';
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from './objects';

// ------------------------------------------------------------------ field reports (OPS-04, ADR-017)
const photoDeclarationSchema = fileDeclarationSchema
  .refine((file) => (PHOTO_MIME_TYPES as readonly string[]).includes(file.mime_type), {
    message: 'Une photo est une image PNG, JPEG ou WebP.',
    path: ['mime_type'],
  })
  .refine((file) => file.size_bytes <= MAX_PHOTO_BYTES, {
    message: `Photo trop volumineuse (maximum ${MAX_PHOTO_BYTES / 1024 / 1024} Mo).`,
    path: ['size_bytes'],
  });

/** A report as recorded on the terminal and sent when the network is back. */
export const fieldReportSubmitSchema = z
  .object({
    /** Identifier given by the terminal: a replay returns the same report. */
    client_report_id: uuidSchema,
    site_id: uuidSchema,
    /** Published version consulted when the discrepancy was observed. */
    publication_id: uuidSchema,
    category: z.enum(REPORT_CATEGORIES),
    severity: z.enum(REPORT_SEVERITIES),
    description: z.string().trim().min(1, 'Décrivez le constat.').max(MAX_REPORT_DESCRIPTION),
    observed_at: isoDateTimeSchema,
    item: z.object({ type: z.enum(REPORT_ITEM_TYPES), id: uuidSchema }).nullable(),
    /** Point on a plan of that version, in pixels of its background. */
    plan_position: z.object({ plan_revision_id: uuidSchema, x: z.number().min(0), y: z.number().min(0) }).nullable(),
    photos: z.array(photoDeclarationSchema).max(MAX_REPORT_PHOTOS, `${MAX_REPORT_PHOTOS} photos au plus.`),
  })
  .meta({ id: 'FieldReportSubmit' });
export type FieldReportSubmit = z.infer<typeof fieldReportSubmitSchema>;

/** Acknowledgement: server identifier, hash of the accepted content, files still to send. */
export const fieldReportReceiptSchema = z
  .object({
    report_id: uuidSchema,
    client_report_id: uuidSchema,
    content_hash: sha256Schema,
    received_at: isoDateTimeSchema,
    /** False when the report had already been received (replay). */
    created: z.boolean(),
    uploads: z.array(z.object({ sha256: sha256Schema, upload: uploadTicketSchema })),
  })
  .meta({ id: 'FieldReportReceipt' });
export type FieldReportReceipt = z.infer<typeof fieldReportReceiptSchema>;

export const fieldReportUploadedSchema = z
  .object({ report_id: uuidSchema, verifications: z.number().int().min(0) })
  .meta({ id: 'FieldReportUploaded' });
export type FieldReportUploaded = z.infer<typeof fieldReportUploadedSchema>;

/** What became of the reports of the agent (feedback, TER-05). */
export const syncReportStatusSchema = z
  .object({
    report_id: uuidSchema,
    client_report_id: uuidSchema,
    status: z.enum(REPORT_STATUSES),
    decision_comment: z.string().nullable(),
    decided_at: isoDateTimeSchema.nullable(),
    received_at: isoDateTimeSchema,
    photos: z.object({
      pending: z.number().int().min(0),
      clean: z.number().int().min(0),
      rejected: z.number().int().min(0),
    }),
    /** Working revision that integrates the correction, and its publication once published. */
    resolution: z
      .object({ revision_no: z.number().int().positive(), publication_number: z.number().int().positive().nullable() })
      .nullable(),
  })
  .meta({ id: 'SyncReportStatus' });
export type SyncReportStatus = z.infer<typeof syncReportStatusSchema>;

export const syncReportsSchema = z.object({ items: z.array(syncReportStatusSchema) }).meta({ id: 'SyncReports' });
export type SyncReports = z.infer<typeof syncReportsSchema>;

// ------------------------------------------------------------------ instruction by the Prévision (TER-04)
const personSchema = z.object({ id: uuidSchema, name: z.string() });

export const fieldReportSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    site_name: z.string(),
    etare_number: z.string().nullable(),
    category: z.enum(REPORT_CATEGORIES),
    severity: z.enum(REPORT_SEVERITIES),
    description: z.string(),
    status: z.enum(REPORT_STATUSES),
    observed_at: isoDateTimeSchema,
    received_at: isoDateTimeSchema,
    reporter: personSchema,
    assigned_to: personSchema.nullable(),
    decision_comment: z.string().nullable(),
    decided_by: personSchema.nullable(),
    decided_at: isoDateTimeSchema.nullable(),
    /** Version consulted by the agent, and the version published now (to compare). */
    publication: z.object({ id: uuidSchema, publication_number: z.number().int().positive() }),
    current_publication_number: z.number().int().positive().nullable(),
    /** Element as it was in the version consulted; `current_status` from the working data (null: gone). */
    item: z
      .object({
        type: z.enum(REPORT_ITEM_TYPES),
        id: uuidSchema,
        label: z.string(),
        current_status: z.string().nullable(),
      })
      .nullable(),
    plan_position: z
      .object({
        plan_revision_id: uuidSchema,
        plan_id: uuidSchema.nullable(),
        plan_title: z.string().nullable(),
        x: z.number(),
        y: z.number(),
      })
      .nullable(),
    photos: z.array(assetSchema),
    resolution: z
      .object({
        revision_id: uuidSchema,
        revision_no: z.number().int().positive(),
        revision_status: z.string(),
        publication_number: z.number().int().positive().nullable(),
      })
      .nullable(),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'FieldReport' });
export type FieldReport = z.infer<typeof fieldReportSchema>;

/** `open`: new or taken in charge (default); `closed`: resolved or rejected. */
export const FIELD_REPORT_VIEWS = ['open', 'closed', 'all'] as const;

export const fieldReportListQuerySchema = z.object({
  limit: pageLimitSchema,
  cursor: cursorSchema.optional(),
  view: z.enum(FIELD_REPORT_VIEWS).default('open'),
  site_id: uuidSchema.optional(),
  /** Reports integrated into this working revision (validation screen). */
  revision_id: uuidSchema.optional(),
});
export type FieldReportListQuery = z.infer<typeof fieldReportListQuerySchema>;

export const fieldReportListSchema = z
  .object({
    items: z.array(fieldReportSchema),
    next_cursor: cursorSchema.nullable(),
    /** Reports to instruct in the SIS, whatever the filters. */
    open_count: z.number().int().min(0),
  })
  .meta({ id: 'FieldReportList' });
export type FieldReportList = z.infer<typeof fieldReportListSchema>;

export const fieldReportUpdateSchema = z
  .object({
    status: z.enum(['triaged', 'resolved', 'rejected']).optional(),
    assigned_to: uuidSchema.nullable().optional(),
    decision_comment: z.string().trim().min(1).max(MAX_REPORT_DECISION).nullable().optional(),
    /** Draft revision of the site that integrates the correction. */
    resolution_revision_id: uuidSchema.nullable().optional(),
  })
  .refine((patch) => patch.status === undefined || patch.status === 'triaged' || Boolean(patch.decision_comment), {
    message: 'Motivez la décision.',
    path: ['decision_comment'],
  })
  .meta({ id: 'FieldReportUpdate' });
export type FieldReportUpdate = z.infer<typeof fieldReportUpdateSchema>;
