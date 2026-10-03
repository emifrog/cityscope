import { CRITICALITIES, GEOMETRY_KINDS, OBJECT_CATEGORIES, OBJECT_STATUSES } from '@etare/domain';
import {
  bboxParamSchema,
  isoDateTimeSchema,
  lineStringSchema,
  multiPolygonSchema,
  pointSchema,
  polygonSchema,
  uuidSchema,
} from '@etare/schemas';
import { z } from 'zod';
import { assetSchema, fileDeclarationSchema, uploadTicketSchema } from './documents';
import { planPlacementSchema, planPositionSchema } from './plans';

const text = (max: number) => z.string().trim().min(1).max(max);

// ------------------------------------------------------------------ photos of an object (PLAN-05)
/** Photos are images only, and smaller than other files: they travel to every tablet. */
export const PHOTO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export const objectPhotoSchema = z
  .object({
    id: uuidSchema,
    object_id: uuidSchema,
    caption: z.string().nullable(),
    sort_order: z.number().int(),
    status: z.enum(['active', 'archived']),
    /** The file and its verification state: only a checked photo is published. */
    asset: assetSchema,
    created_at: isoDateTimeSchema,
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'ObjectPhoto' });
export type ObjectPhoto = z.infer<typeof objectPhotoSchema>;

export const objectPhotoCreateSchema = z
  .object({
    caption: z.string().trim().min(1).max(200).nullable().optional(),
    file: fileDeclarationSchema
      .refine((file) => (PHOTO_MIME_TYPES as readonly string[]).includes(file.mime_type), {
        message: 'Une photo est une image PNG, JPEG ou WebP.',
        path: ['mime_type'],
      })
      .refine((file) => file.size_bytes <= MAX_PHOTO_BYTES, {
        message: `Photo trop volumineuse (maximum ${MAX_PHOTO_BYTES / 1024 / 1024} Mo).`,
        path: ['size_bytes'],
      }),
  })
  .meta({ id: 'ObjectPhotoCreate' });
export type ObjectPhotoCreate = z.infer<typeof objectPhotoCreateSchema>;

export const objectPhotoUploadSchema = z
  .object({ photo: objectPhotoSchema, upload: uploadTicketSchema })
  .meta({ id: 'ObjectPhotoUpload' });
export type ObjectPhotoUpload = z.infer<typeof objectPhotoUploadSchema>;

export const objectPhotoUpdateSchema = z
  .object({
    caption: z.string().trim().min(1).max(200).nullable().optional(),
    /** Archiving is final (a photo is never deleted). */
    status: z.literal('archived').optional(),
  })
  .refine((value) => value.caption !== undefined || value.status !== undefined, {
    message: 'Aucune modification à enregistrer.',
  })
  .meta({ id: 'ObjectPhotoUpdate' });
export type ObjectPhotoUpdate = z.infer<typeof objectPhotoUpdateSchema>;

/** Position of an object on the map: a point, a line (fire lane) or a polygon (aerial ladder area). */
export const exteriorGeometrySchema = z.union([pointSchema, lineStringSchema, polygonSchema]);
export type ExteriorGeometry = z.infer<typeof exteriorGeometrySchema>;

export const objectTypeSchema = z
  .object({
    id: uuidSchema,
    code: z.string(),
    name: z.string(),
    category: z.enum(OBJECT_CATEGORIES),
    geometry_kind: z.enum(GEOMETRY_KINDS),
    icon_key: z.string(),
    /** JSON Schema subset of the type-specific properties (packages/domain/src/objects.ts). */
    properties_schema: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'ObjectType' });
export type ObjectType = z.infer<typeof objectTypeSchema>;

export const objectTypeListSchema = z.object({ items: z.array(objectTypeSchema) }).meta({ id: 'ObjectTypeList' });

export const operationalObjectSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    building_id: uuidSchema.nullable(),
    level_id: uuidSchema.nullable(),
    /** Zone of the plan containing the object (derived from its position). */
    zone_id: uuidSchema.nullable(),
    object_type_id: uuidSchema,
    type_code: z.string(),
    type_name: z.string(),
    category: z.enum(OBJECT_CATEGORIES),
    name: z.string().nullable(),
    /** Short text shown on the map ("PEI 1"). */
    label: z.string().nullable(),
    /** Null for objects placed only on a plan (interior). */
    geometry: exteriorGeometrySchema.nullable(),
    /** Position on a plan (interior), null for objects placed only on the map. */
    plan_position: planPositionSchema.nullable(),
    properties: z.record(z.string(), z.unknown()),
    instructions: z.string().nullable(),
    criticality: z.enum(CRITICALITIES),
    status: z.enum(OBJECT_STATUSES),
    verified_at: isoDateTimeSchema.nullable(),
    /** Distance in metres from the site reference point, when both are placed on the map. */
    distance_m: z.number().nullable(),
    /** Active photos, in display order (PLAN-05). */
    photos: z.array(objectPhotoSchema),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'OperationalObject' });
export type OperationalObject = z.infer<typeof operationalObjectSchema>;

export const operationalObjectListSchema = z
  .object({ items: z.array(operationalObjectSchema) })
  .meta({ id: 'OperationalObjectList' });

const properties = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const operationalObjectCreateSchema = z
  .object({
    object_type_id: uuidSchema,
    building_id: uuidSchema.nullable().optional(),
    name: text(200).nullable().optional(),
    label: text(40).nullable().optional(),
    /** On the map… */
    geometry: exteriorGeometrySchema.optional(),
    /** …and/or on the current background of a plan. */
    plan_position: planPlacementSchema.optional(),
    properties: properties.default({}),
    instructions: text(2000).nullable().optional(),
    criticality: z.enum(CRITICALITIES).default('info'),
    status: z.enum(OBJECT_STATUSES).exclude(['archived']).default('active'),
  })
  .refine((object) => object.geometry !== undefined || object.plan_position !== undefined, {
    message: 'Placez l’objet sur la carte ou sur un plan.',
    path: ['geometry'],
  })
  .meta({ id: 'OperationalObjectCreate' });
export type OperationalObjectCreateInput = z.input<typeof operationalObjectCreateSchema>;
export type OperationalObjectCreate = z.infer<typeof operationalObjectCreateSchema>;

export const operationalObjectUpdateSchema = z
  .object({
    building_id: uuidSchema.nullable().optional(),
    name: text(200).nullable().optional(),
    label: text(40).nullable().optional(),
    geometry: exteriorGeometrySchema.optional(),
    /** Places the object (again) on the current background of a plan; null removes it from the plan. */
    plan_position: planPlacementSchema.nullable().optional(),
    /** Replaces all type-specific properties. */
    properties: properties.optional(),
    instructions: text(2000).nullable().optional(),
    criticality: z.enum(CRITICALITIES).optional(),
    status: z.enum(OBJECT_STATUSES).optional(),
    /** Records an on-site check now. */
    verified: z.literal(true).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Aucune modification à enregistrer.',
  })
  .meta({ id: 'OperationalObjectUpdate' });
export type OperationalObjectUpdate = z.infer<typeof operationalObjectUpdateSchema>;

// ------------------------------------------------------------------ map details (buildings and objects)
export const MAP_DETAIL_LAYERS = ['buildings', 'objects', 'risks'] as const;

/** Largest extent served with details (about 20 km): beyond, the map shows sites only. */
export const MAX_DETAIL_EXTENT_DEGREES = 0.2;

export const mapFeaturesQuerySchema = z.object({
  bbox: bboxParamSchema.refine((value) => {
    const [west, south, east, north] = value.split(',').map(Number);
    return (
      east !== undefined &&
      west !== undefined &&
      north !== undefined &&
      south !== undefined &&
      east - west <= MAX_DETAIL_EXTENT_DEGREES &&
      north - south <= MAX_DETAIL_EXTENT_DEGREES
    );
  }, 'Zone trop étendue : zoomez pour afficher les bâtiments et les points opérationnels.'),
});
export type MapFeaturesQuery = z.infer<typeof mapFeaturesQuerySchema>;

export const mapBuildingFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: uuidSchema,
  geometry: multiPolygonSchema,
  properties: z.object({ site_id: uuidSchema, name: z.string() }),
});

export const mapObjectFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: uuidSchema,
  geometry: exteriorGeometrySchema,
  properties: z.object({
    site_id: uuidSchema,
    site_name: z.string(),
    type_code: z.string(),
    type_name: z.string(),
    category: z.enum(OBJECT_CATEGORIES),
    name: z.string().nullable(),
    label: z.string().nullable(),
    criticality: z.enum(CRITICALITIES),
    status: z.enum(OBJECT_STATUSES),
  }),
});
export type MapObjectFeature = z.infer<typeof mapObjectFeatureSchema>;

/** Risk located on the map (MET-02): a point or a surface. */
export const mapRiskFeatureSchema = z.object({
  type: z.literal('Feature'),
  id: uuidSchema,
  geometry: z.union([pointSchema, polygonSchema]),
  properties: z.object({
    site_id: uuidSchema,
    site_name: z.string(),
    type_code: z.string(),
    type_name: z.string(),
    icon_key: z.string(),
    severity: z.number().int().min(1).max(5),
    label: z.string().nullable(),
  }),
});
export type MapRiskFeature = z.infer<typeof mapRiskFeatureSchema>;

export const mapFeaturesResponseSchema = z
  .object({
    buildings: z.object({ type: z.literal('FeatureCollection'), features: z.array(mapBuildingFeatureSchema) }),
    objects: z.object({ type: z.literal('FeatureCollection'), features: z.array(mapObjectFeatureSchema) }),
    risks: z.object({ type: z.literal('FeatureCollection'), features: z.array(mapRiskFeatureSchema) }),
    /** More details exist in this extent than returned: zoom in. */
    truncated: z.boolean(),
  })
  .meta({ id: 'MapFeatures' });
export type MapFeaturesResponse = z.infer<typeof mapFeaturesResponseSchema>;
