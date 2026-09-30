import { bboxParamSchema, pointSchema, siteStatusSchema, siteTypeSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

const rightSchema = z.enum(['unverified', 'approved', 'forbidden']);

/** A base map or overlay from the server-side catalogue (ADR-006): screens never hard-code a tile URL. */
export const mapSourceSchema = z
  .object({
    id: z.string(),
    producer: z.string(),
    product: z.string(),
    kind: z.enum(['raster-wmts', 'vector-tms', 'style']),
    /** Tile template with {z}/{x}/{y}, or style document. */
    url: z.string(),
    tile_size: z.number().int().positive(),
    min_zoom: z.number().int().min(0),
    max_zoom: z.number().int().min(0),
    /** Must stay visible wherever the map is shown (views, PDF, offline packages). */
    attribution: z.string(),
    licence: z.object({ name: z.string(), url: z.url() }),
    rights: z.object({
      online_display: z.enum(['open', 'licensed']),
      offline_packaging: rightSchema,
      pdf_export: rightSchema,
    }),
  })
  .meta({ id: 'MapSource' });
export type MapSource = z.infer<typeof mapSourceSchema>;

export const mapCatalogSchema = z
  .object({
    sources: z.array(mapSourceSchema),
    default_base: z.string(),
    /** Label fonts ({fontstack}/{range} template) served by the map provider. */
    glyphs: z.object({ url: z.string(), font_stack: z.array(z.string()) }),
  })
  .meta({ id: 'MapCatalog' });
export type MapCatalog = z.infer<typeof mapCatalogSchema>;

export const mapSitesQuerySchema = z.object({
  /** Visible extent "west,south,east,north"; without it, every positioned site up to the limit. */
  bbox: bboxParamSchema.optional(),
  q: z.string().trim().min(2).max(100).optional(),
  site_type: siteTypeSchema.optional(),
  status: siteStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});
export type MapSitesQuery = z.infer<typeof mapSitesQuerySchema>;

export const mapSiteFeatureSchema = z
  .object({
    type: z.literal('Feature'),
    id: uuidSchema,
    geometry: pointSchema,
    properties: z.object({
      name: z.string(),
      site_type: siteTypeSchema,
      status: siteStatusSchema,
      etare_number: z.string().nullable(),
      city: z.string().nullable(),
      /** A version is published (ETARE available to responders). */
      published: z.boolean(),
      publication_number: z.number().int().positive().nullable(),
      /** Checked on site within the last 12 months. */
      verified_recently: z.boolean(),
    }),
  })
  .meta({ id: 'MapSiteFeature' });
export type MapSiteFeature = z.infer<typeof mapSiteFeatureSchema>;

const extentSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const mapSitesResponseSchema = z
  .object({
    type: z.literal('FeatureCollection'),
    features: z.array(mapSiteFeatureSchema),
    /** More positioned sites match than returned: request the visible extent (bbox) instead. */
    truncated: z.boolean(),
    /** [west, south, east, north] of every matching positioned site, bbox ignored; null when none. */
    extent: extentSchema.nullable(),
    /** Matching sites that have no position yet (absent from the map). */
    unlocated: z.number().int().min(0),
  })
  .meta({ id: 'MapSites' });
export type MapSitesResponse = z.infer<typeof mapSitesResponseSchema>;
