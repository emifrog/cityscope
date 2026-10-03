import { CLASSIFICATION_TYPES, CONTACT_VISIBILITIES, EXTERNAL_ENTITY_TYPES, RECORD_STATUSES } from '@etare/domain';
import {
  etareNumberSchema,
  isoDateTimeSchema,
  multiPolygonSchema,
  pointSchema,
  sensitivitySchema,
  siteNameSchema,
  siteTypeSchema,
  surfaceSchema,
  uuidSchema,
} from '@etare/schemas';
import { z } from 'zod';

/** Optional text: trimmed, bounded; null clears the value in updates. */
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const isoDate = z.iso.date();
const rowVersion = z.number().int().positive();
const recordStatusSchema = z.enum(RECORD_STATUSES);

/** At least one field must be sent in a partial update. */
function nonEmptyPatch<T extends z.ZodObject>(schema: T) {
  return schema.refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Aucune modification à enregistrer.',
  });
}

// ------------------------------------------------------------------ sites (write)
export const addressInputSchema = z
  .object({
    street: optionalText(200),
    postal_code: z
      .string()
      .regex(/^[0-9]{5}$/, 'Code postal à 5 chiffres.')
      .nullable()
      .optional(),
    city: text(120),
    insee_code: z
      .string()
      .regex(/^[0-9][0-9AB][0-9]{3}$/, 'Code INSEE invalide.')
      .nullable()
      .optional(),
  })
  .meta({ id: 'AddressInput' });
export type AddressInput = z.infer<typeof addressInputSchema>;

export const siteCreateSchema = z
  .object({
    name: siteNameSchema,
    short_name: optionalText(80),
    site_type: siteTypeSchema,
    status: z.enum(['draft', 'active']).default('draft'),
    sensitivity: sensitivitySchema.default('normal'),
    etare_number: etareNumberSchema.nullable().optional(),
    address: addressInputSchema.nullable().optional(),
    location: pointSchema.nullable().optional(),
  })
  .meta({ id: 'SiteCreate' });
export type SiteCreateInput = z.input<typeof siteCreateSchema>;
export type SiteCreate = z.infer<typeof siteCreateSchema>;

export const siteUpdateSchema = nonEmptyPatch(
  z.object({
    name: siteNameSchema.optional(),
    short_name: optionalText(80),
    site_type: siteTypeSchema.optional(),
    /** Archiving goes through POST /sites/{id}/archive (reason, nothing in force). */
    status: z
      .enum(['draft', 'active', 'inactive'], { message: 'Archivez le site depuis son dossier ETARE.' })
      .optional(),
    sensitivity: sensitivitySchema.optional(),
    etare_number: etareNumberSchema.nullable().optional(),
    address: addressInputSchema.nullable().optional(),
    location: pointSchema.nullable().optional(),
    /** Site footprint drawn on the map (Polygon or MultiPolygon); null removes it. */
    footprint: surfaceSchema.nullable().optional(),
    /** Records an on-site check now (feeds "vérifié < 12 mois" on the map). */
    verified: z.literal(true).optional(),
  }),
).meta({ id: 'SiteUpdate' });
export type SiteUpdate = z.infer<typeof siteUpdateSchema>;

/** Why a site and its dossier are archived (MET-04), read in the history and by the terminals. */
export const siteArchiveSchema = z
  .object({ reason: z.string().trim().min(3, 'Motivez l’archivage.').max(1000) })
  .meta({ id: 'SiteArchive' });
export type SiteArchive = z.infer<typeof siteArchiveSchema>;

// ------------------------------------------------------------------ buildings and levels
export const levelSchema = z
  .object({
    id: uuidSchema,
    building_id: uuidSchema,
    label: z.string(),
    sort_order: z.number().int(),
    elevation_m: z.number().nullable(),
    status: recordStatusSchema,
    row_version: rowVersion,
  })
  .meta({ id: 'Level' });
export type Level = z.infer<typeof levelSchema>;

export const buildingSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    name: z.string(),
    code: z.string().nullable(),
    status: recordStatusSchema,
    sort_order: z.number().int(),
    construction_type: z.string().nullable(),
    height_m: z.number().nullable(),
    floors_above: z.number().int().nullable(),
    floors_below: z.number().int().nullable(),
    notes: z.string().nullable(),
    footprint: multiPolygonSchema.nullable(),
    row_version: rowVersion,
    levels: z.array(levelSchema),
  })
  .meta({ id: 'Building' });
export type Building = z.infer<typeof buildingSchema>;

const buildingFields = {
  name: text(200),
  code: optionalText(40),
  sort_order: z.number().int().min(0).max(999).optional(),
  construction_type: optionalText(120),
  height_m: z.number().min(0).max(1000).nullable().optional(),
  floors_above: z.number().int().min(0).max(200).nullable().optional(),
  floors_below: z.number().int().min(0).max(50).nullable().optional(),
  notes: optionalText(2000),
  /** Footprint drawn on the map (Polygon or MultiPolygon); null removes it. */
  footprint: surfaceSchema.nullable().optional(),
};

export const buildingCreateSchema = z.object(buildingFields).meta({ id: 'BuildingCreate' });
export type BuildingCreate = z.infer<typeof buildingCreateSchema>;

export const buildingUpdateSchema = nonEmptyPatch(
  z.object({ ...buildingFields, name: text(200).optional(), status: recordStatusSchema.optional() }),
).meta({ id: 'BuildingUpdate' });
export type BuildingUpdate = z.infer<typeof buildingUpdateSchema>;

export const levelCreateSchema = z
  .object({
    label: text(40),
    sort_order: z.number().int().min(-20).max(200),
    elevation_m: z.number().min(-200).max(1000).nullable().optional(),
  })
  .meta({ id: 'LevelCreate' });
export type LevelCreate = z.infer<typeof levelCreateSchema>;

export const levelUpdateSchema = nonEmptyPatch(
  z.object({
    label: text(40).optional(),
    sort_order: z.number().int().min(-20).max(200).optional(),
    elevation_m: z.number().min(-200).max(1000).nullable().optional(),
    status: recordStatusSchema.optional(),
  }),
).meta({ id: 'LevelUpdate' });
export type LevelUpdate = z.infer<typeof levelUpdateSchema>;

export const buildingListResponseSchema = z.object({ items: z.array(buildingSchema) }).meta({ id: 'BuildingList' });

// ------------------------------------------------------------------ classifications
export const classificationSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    classification_type: z.enum(CLASSIFICATION_TYPES),
    code: z.string().nullable(),
    category: z.string().nullable(),
    label: z.string().nullable(),
    valid_from: isoDate.nullable(),
    valid_to: isoDate.nullable(),
    source: z.string().nullable(),
    row_version: rowVersion,
  })
  .meta({ id: 'Classification' });
export type Classification = z.infer<typeof classificationSchema>;

const validityOrder = (value: { valid_from?: string | null | undefined; valid_to?: string | null | undefined }) =>
  !value.valid_from || !value.valid_to || value.valid_to >= value.valid_from;
const validityMessage = { message: 'La fin de validité précède son début.', path: ['valid_to'] };

const classificationFields = {
  classification_type: z.enum(CLASSIFICATION_TYPES),
  code: optionalText(40),
  category: optionalText(40),
  label: optionalText(200),
  valid_from: isoDate.nullable().optional(),
  valid_to: isoDate.nullable().optional(),
  source: optionalText(200),
};

export const classificationCreateSchema = z
  .object(classificationFields)
  .refine(validityOrder, validityMessage)
  .meta({ id: 'ClassificationCreate' });
export type ClassificationCreate = z.infer<typeof classificationCreateSchema>;

export const classificationUpdateSchema = nonEmptyPatch(
  z.object({ ...classificationFields, classification_type: z.enum(CLASSIFICATION_TYPES).optional() }),
)
  .refine(validityOrder, validityMessage)
  .meta({ id: 'ClassificationUpdate' });
export type ClassificationUpdate = z.infer<typeof classificationUpdateSchema>;

export const classificationListResponseSchema = z
  .object({ items: z.array(classificationSchema) })
  .meta({ id: 'ClassificationList' });

// ------------------------------------------------------------------ contacts
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 .()-]{5,23}$/, 'Numéro de téléphone invalide.');

export const contactSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    name: z.string(),
    role: z.string().nullable(),
    phone: z.string(),
    phone_alt: z.string().nullable(),
    email: z.string().nullable(),
    availability: z.string().nullable(),
    visibility: z.enum(CONTACT_VISIBILITIES),
    sort_order: z.number().int(),
    status: recordStatusSchema,
    verified_at: isoDateTimeSchema.nullable(),
    row_version: rowVersion,
  })
  .meta({ id: 'Contact' });
export type Contact = z.infer<typeof contactSchema>;

const contactFields = {
  name: text(200),
  role: optionalText(200),
  phone: phoneSchema,
  phone_alt: phoneSchema.nullable().optional(),
  email: z.email('Adresse e-mail invalide.').max(254).nullable().optional(),
  availability: optionalText(200),
  visibility: z.enum(CONTACT_VISIBILITIES).default('prevision'),
  sort_order: z.number().int().min(0).max(999).optional(),
};

export const contactCreateSchema = z.object(contactFields).meta({ id: 'ContactCreate' });
export type ContactCreateInput = z.input<typeof contactCreateSchema>;
export type ContactCreate = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = nonEmptyPatch(
  z.object({
    ...contactFields,
    name: text(200).optional(),
    phone: phoneSchema.optional(),
    visibility: z.enum(CONTACT_VISIBILITIES).optional(),
    status: recordStatusSchema.optional(),
    /** Confirms that the information was checked today. */
    verified: z.literal(true).optional(),
  }),
).meta({ id: 'ContactUpdate' });
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;

export const contactListResponseSchema = z.object({ items: z.array(contactSchema) }).meta({ id: 'ContactList' });

// ------------------------------------------------------------------ external identifiers
export const externalIdSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    entity_type: z.enum(EXTERNAL_ENTITY_TYPES),
    entity_id: uuidSchema,
    system_code: z.string(),
    external_id: z.string(),
  })
  .meta({ id: 'ExternalId' });
export type ExternalId = z.infer<typeof externalIdSchema>;

export const externalIdCreateSchema = z
  .object({
    entity_type: z.enum(EXTERNAL_ENTITY_TYPES),
    entity_id: uuidSchema,
    system_code: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Code système en majuscules (ex. SIG, SGO, DECI).'),
    external_id: text(200),
  })
  .meta({ id: 'ExternalIdCreate' });
export type ExternalIdCreate = z.infer<typeof externalIdCreateSchema>;

export const externalIdListResponseSchema = z
  .object({ items: z.array(externalIdSchema) })
  .meta({ id: 'ExternalIdList' });

export const idParamsSchema = z.object({ id: uuidSchema });
