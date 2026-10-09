import { HAZARD_CLASSES, PHYSICAL_STATES, RECORD_STATUSES } from '@etare/domain';
import { uuidSchema } from '@etare/schemas';
import { z } from 'zod';

/**
 * Hazardous substances of a site and their safety data sheets (RISK-03): product, CLP
 * classes, UN number, quantity with its unit, location (building, level, zone, note) and the
 * FDS document of the site. Edited by the prevision, published in the ETARE, read on the tablets.
 */
const text = (max: number) => z.string().trim().min(1).max(max);

export const hazardClassSchema = z.enum(HAZARD_CLASSES).meta({ id: 'HazardClass' });
export const physicalStateSchema = z.enum(PHYSICAL_STATES).meta({ id: 'PhysicalState' });
/** UN number of the transport of dangerous goods (four digits). */
export const unNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4}$/, 'Numéro ONU à quatre chiffres.');

export const substanceSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    name: z.string(),
    hazard_classes: z.array(hazardClassSchema),
    un_number: z.string().nullable(),
    physical_state: physicalStateSchema.nullable(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    /** Location: the site (all null), a building, a level or a zone, plus a free note. */
    building_id: uuidSchema.nullable(),
    level_id: uuidSchema.nullable(),
    zone_id: uuidSchema.nullable(),
    location_note: z.string().nullable(),
    /** Safety data sheet: a document of the site classed FDS. */
    fds_document_id: uuidSchema.nullable(),
    fds_title: z.string().nullable(),
    notes: z.string().nullable(),
    status: z.enum(RECORD_STATUSES),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'Substance' });
export type Substance = z.infer<typeof substanceSchema>;

export const substanceListSchema = z.object({ items: z.array(substanceSchema) }).meta({ id: 'SubstanceList' });

const quantityPair = <T extends { quantity?: number | null | undefined; unit?: string | null | undefined }>(value: T) =>
  (value.quantity === undefined) === (value.unit === undefined) &&
  (value.quantity === null || value.quantity === undefined) === (value.unit === null || value.unit === undefined);

const fields = {
  name: text(200),
  hazard_classes: z.array(hazardClassSchema).max(HAZARD_CLASSES.length),
  un_number: unNumberSchema.nullable(),
  physical_state: physicalStateSchema.nullable(),
  quantity: z.number().nonnegative().max(1e9).nullable(),
  unit: text(20).nullable(),
  building_id: uuidSchema.nullable(),
  level_id: uuidSchema.nullable(),
  zone_id: uuidSchema.nullable(),
  location_note: text(200).nullable(),
  fds_document_id: uuidSchema.nullable(),
  notes: text(2000).nullable(),
};

export const substanceCreateSchema = z
  .object({
    name: fields.name,
    hazard_classes: fields.hazard_classes.default([]),
    un_number: fields.un_number.optional(),
    physical_state: fields.physical_state.optional(),
    quantity: fields.quantity.optional(),
    unit: fields.unit.optional(),
    building_id: fields.building_id.optional(),
    level_id: fields.level_id.optional(),
    zone_id: fields.zone_id.optional(),
    location_note: fields.location_note.optional(),
    fds_document_id: fields.fds_document_id.optional(),
    notes: fields.notes.optional(),
  })
  .refine(quantityPair, { message: 'Une quantité s’accompagne de son unité.', path: ['unit'] })
  .meta({ id: 'SubstanceCreate' });
export type SubstanceCreateInput = z.input<typeof substanceCreateSchema>;
export type SubstanceCreate = z.infer<typeof substanceCreateSchema>;

export const substanceUpdateSchema = z
  .object({
    name: fields.name.optional(),
    hazard_classes: fields.hazard_classes.optional(),
    un_number: fields.un_number.optional(),
    physical_state: fields.physical_state.optional(),
    quantity: fields.quantity.optional(),
    unit: fields.unit.optional(),
    building_id: fields.building_id.optional(),
    level_id: fields.level_id.optional(),
    zone_id: fields.zone_id.optional(),
    location_note: fields.location_note.optional(),
    fds_document_id: fields.fds_document_id.optional(),
    notes: fields.notes.optional(),
    status: z.enum(RECORD_STATUSES).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Aucune modification à enregistrer.',
  })
  .refine(quantityPair, { message: 'Une quantité s’accompagne de son unité.', path: ['unit'] })
  .meta({ id: 'SubstanceUpdate' });
export type SubstanceUpdate = z.infer<typeof substanceUpdateSchema>;
