import { LOCAL_UNITS, MAX_PLAN_SIDE_PX, PLAN_TYPES, RECORD_STATUSES } from '@etare/domain';
import { isoDateTimeSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';
import { assetSchema, fileDeclarationSchema, uploadTicketSchema } from './documents';

const side = z.number().positive().max(MAX_PLAN_SIDE_PX, `Plan trop grand (${MAX_PLAN_SIDE_PX} px par côté au plus).`);

/**
 * A plan revision is an immutable background (image) with its size in
 * pixels: positions drawn on it are local coordinates, origin top-left,
 * x to the right, y downwards (architecture §08).
 */
export const planRevisionSchema = z
  .object({
    id: uuidSchema,
    revision_no: z.number().int().positive(),
    page_number: z.number().int().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    local_unit: z.enum(LOCAL_UNITS),
    is_current: z.boolean(),
    created_at: isoDateTimeSchema,
    asset: assetSchema,
  })
  .meta({ id: 'PlanRevision' });
export type PlanRevision = z.infer<typeof planRevisionSchema>;

export const planSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    building_id: uuidSchema.nullable(),
    building_name: z.string().nullable(),
    level_id: uuidSchema.nullable(),
    level_label: z.string().nullable(),
    plan_type: z.enum(PLAN_TYPES),
    title: z.string(),
    status: z.enum(RECORD_STATUSES),
    row_version: z.number().int().positive(),
    /** Newest first; exactly one is current. */
    revisions: z.array(planRevisionSchema),
  })
  .meta({ id: 'Plan' });
export type Plan = z.infer<typeof planSchema>;

export const planListResponseSchema = z.object({ items: z.array(planSchema) }).meta({ id: 'PlanList' });

/** Backgrounds are images: a PDF page is rendered to an image before upload. */
const backgroundFile = fileDeclarationSchema.refine((file) => file.mime_type !== 'application/pdf', {
  message: 'Le fond d’un plan est une image (PNG, JPEG ou WebP) : convertissez d’abord la page du PDF.',
  path: ['mime_type'],
});

const background = {
  width: side,
  height: side,
  /** Page of the source PDF, when the image comes from a PDF. */
  page_number: z.number().int().positive().max(9999).default(1),
  file: backgroundFile,
};

export const planCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    plan_type: z.enum(PLAN_TYPES),
    building_id: uuidSchema.nullable().optional(),
    level_id: uuidSchema.nullable().optional(),
    ...background,
  })
  .refine((plan) => plan.plan_type !== 'level' || Boolean(plan.level_id), {
    message: 'Un plan de niveau est rattaché à un niveau.',
    path: ['level_id'],
  })
  .meta({ id: 'PlanCreate' });
export type PlanCreateInput = z.input<typeof planCreateSchema>;
export type PlanCreate = z.infer<typeof planCreateSchema>;

export const planRevisionCreateSchema = z.object(background).meta({ id: 'PlanRevisionCreate' });
export type PlanRevisionCreateInput = z.input<typeof planRevisionCreateSchema>;
export type PlanRevisionCreate = z.infer<typeof planRevisionCreateSchema>;

export const planUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(RECORD_STATUSES).optional(),
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, {
    message: 'Aucune modification à enregistrer.',
  })
  .meta({ id: 'PlanUpdate' });
export type PlanUpdate = z.infer<typeof planUpdateSchema>;

export const planUploadResponseSchema = z
  .object({ plan: planSchema, upload: uploadTicketSchema })
  .meta({ id: 'PlanUpload' });
export type PlanUploadResponse = z.infer<typeof planUploadResponseSchema>;
