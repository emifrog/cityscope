import {
  CATALOG_CODE_PATTERN,
  FIELD_KEY_PATTERN,
  FIELD_KINDS,
  MAX_CATALOG_FIELDS,
  RECORD_STATUSES,
  RISK_ICON_KEYS,
} from '@etare/domain';
import { pointSchema, polygonSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';
import { planPlacementSchema, planPositionSchema } from './plans';

const text = (max: number) => z.string().trim().min(1).max(max);
const severitySchema = z.number().int().min(1).max(5);

// ------------------------------------------------------------------ catalogue (RISK-01)
export const riskTypeSchema = z
  .object({
    id: uuidSchema,
    code: z.string(),
    name: z.string(),
    default_severity: severitySchema,
    icon_key: z.string(),
    /** JSON Schema subset of the type-specific fields (packages/domain/src/objects.ts). */
    properties_schema: z.record(z.string(), z.unknown()),
    /** National entries are reference data; SIS entries are managed by the SIS (catalog:manage). */
    owner: z.enum(['national', 'sis']),
    status: z.enum(['active', 'deprecated']),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'RiskType' });
export type RiskType = z.infer<typeof riskTypeSchema>;

export const riskTypeListSchema = z.object({ items: z.array(riskTypeSchema) }).meta({ id: 'RiskTypeList' });

/** Retired SIS types are listed only for catalogue managers who ask for them. */
export const riskTypeListQuerySchema = z.object({ include_deprecated: z.enum(['true', 'false']).optional() });

/** A field declared by the SIS for one of its risk types. */
export const catalogFieldSchema = z
  .object({
    key: z.string().regex(FIELD_KEY_PATTERN, 'Clé en minuscules sans accent (lettres, chiffres, _).'),
    title: text(80),
    kind: z.enum(FIELD_KINDS),
    unit: text(20).optional(),
    choices: z.array(text(80)).min(2).max(30).optional(),
    required: z.boolean().optional(),
  })
  .refine((field) => (field.kind === 'choice') === (field.choices !== undefined), {
    message: 'Une liste de choix a au moins deux valeurs, et seulement pour un champ « choix ».',
    path: ['choices'],
  })
  .meta({ id: 'CatalogField' });

const fieldsSchema = z
  .array(catalogFieldSchema)
  .max(MAX_CATALOG_FIELDS)
  .refine((fields) => new Set(fields.map((field) => field.key)).size === fields.length, {
    message: 'Deux champs ont la même clé.',
  });

export const riskTypeCreateSchema = z
  .object({
    code: z.string().regex(CATALOG_CODE_PATTERN, 'Code en majuscules sans accent (lettres, chiffres, _).'),
    name: text(120),
    default_severity: severitySchema,
    icon_key: z.enum(RISK_ICON_KEYS),
    fields: fieldsSchema.default([]),
  })
  .meta({ id: 'RiskTypeCreate' });
export type RiskTypeCreateInput = z.input<typeof riskTypeCreateSchema>;
export type RiskTypeCreate = z.infer<typeof riskTypeCreateSchema>;

export const riskTypeUpdateSchema = z
  .object({
    name: text(120).optional(),
    default_severity: severitySchema.optional(),
    icon_key: z.enum(RISK_ICON_KEYS).optional(),
    /** Replaces all fields; existing occurrences keep their values. */
    fields: fieldsSchema.optional(),
    /** A deprecated type is no longer offered but its occurrences remain. */
    status: z.enum(['active', 'deprecated']).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Aucune modification à enregistrer.',
  })
  .meta({ id: 'RiskTypeUpdate' });
export type RiskTypeUpdate = z.infer<typeof riskTypeUpdateSchema>;

// ------------------------------------------------------------------ occurrences (RISK-02)
/** A risk on the map is a point or a surface, like on a plan. */
export const riskGeometrySchema = z.union([pointSchema, polygonSchema]).meta({ id: 'RiskGeometry' });

export const riskSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    risk_type_id: uuidSchema,
    type_code: z.string(),
    type_name: z.string(),
    icon_key: z.string(),
    severity: severitySchema,
    /** Short text shown on the plan. */
    label: z.string().nullable(),
    description: z.string().nullable(),
    quantity: z.number().nullable(),
    unit: z.string().nullable(),
    properties: z.record(z.string(), z.unknown()),
    /** Scope of the risk: the site (all null), a building, a level or a zone. */
    building_id: uuidSchema.nullable(),
    level_id: uuidSchema.nullable(),
    zone_id: uuidSchema.nullable(),
    plan_position: planPositionSchema.nullable(),
    /** Location on the map (WGS 84), for a risk outside the buildings (MET-02). */
    geometry: riskGeometrySchema.nullable(),
    status: z.enum(RECORD_STATUSES),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'Risk' });
export type Risk = z.infer<typeof riskSchema>;

export const riskListSchema = z.object({ items: z.array(riskSchema) }).meta({ id: 'RiskList' });

export type RiskGeometry = z.infer<typeof riskGeometrySchema>;

const properties = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const riskPlacement = planPlacementSchema.refine((placement) => placement.geometry.type !== 'LineString', {
  message: 'Un risque se place comme un point ou une surface.',
  path: ['geometry'],
});

const quantityPair = <T extends { quantity?: number | null | undefined; unit?: string | null | undefined }>(risk: T) =>
  (risk.quantity === undefined) === (risk.unit === undefined) &&
  (risk.quantity === null || risk.quantity === undefined) === (risk.unit === null || risk.unit === undefined);

export const riskCreateSchema = z
  .object({
    risk_type_id: uuidSchema,
    /** Defaults to the severity of the type. */
    severity: severitySchema.optional(),
    label: text(40).nullable().optional(),
    description: text(2000).nullable().optional(),
    quantity: z.number().nonnegative().max(1e9).nullable().optional(),
    unit: text(20).nullable().optional(),
    properties: properties.default({}),
    building_id: uuidSchema.nullable().optional(),
    level_id: uuidSchema.nullable().optional(),
    zone_id: uuidSchema.nullable().optional(),
    plan_position: riskPlacement.optional(),
    geometry: riskGeometrySchema.nullable().optional(),
  })
  .refine(quantityPair, { message: 'Une quantité s’accompagne de son unité.', path: ['unit'] })
  .meta({ id: 'RiskCreate' });
export type RiskCreateInput = z.input<typeof riskCreateSchema>;
export type RiskCreate = z.infer<typeof riskCreateSchema>;

export const riskUpdateSchema = z
  .object({
    severity: severitySchema.optional(),
    label: text(40).nullable().optional(),
    description: text(2000).nullable().optional(),
    quantity: z.number().nonnegative().max(1e9).nullable().optional(),
    unit: text(20).nullable().optional(),
    /** Replaces all type-specific properties. */
    properties: properties.optional(),
    building_id: uuidSchema.nullable().optional(),
    level_id: uuidSchema.nullable().optional(),
    zone_id: uuidSchema.nullable().optional(),
    /** Places the risk (again) on the current background of a plan; null removes it from the plan. */
    plan_position: riskPlacement.nullable().optional(),
    /** Location on the map; null removes it from the map. */
    geometry: riskGeometrySchema.nullable().optional(),
    status: z.enum(RECORD_STATUSES).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Aucune modification à enregistrer.',
  })
  .refine(quantityPair, { message: 'Une quantité s’accompagne de son unité.', path: ['unit'] })
  .meta({ id: 'RiskUpdate' });
export type RiskUpdate = z.infer<typeof riskUpdateSchema>;
