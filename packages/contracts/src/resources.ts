import {
  cursorSchema,
  etareNumberSchema,
  isoDateTimeSchema,
  multiPolygonSchema,
  pageLimitSchema,
  pointSchema,
  roleSchema,
  sensitivitySchema,
  siteNameSchema,
  siteStatusSchema,
  siteTypeSchema,
  uuidSchema,
} from '@etare/schemas';
import { z } from 'zod';

/** Header carrying the active SIS. A hint only: the server re-checks the membership. */
export const TENANT_HEADER = 'x-tenant-id';

// ------------------------------------------------------------------ health
export const healthResponseSchema = z
  .object({
    status: z.enum(['ok', 'degraded']),
    version: z.string(),
    checks: z.object({ database: z.enum(['ok', 'unavailable', 'skipped']) }),
  })
  .meta({ id: 'Health' });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ------------------------------------------------------------------ me
export const membershipSchema = z
  .object({
    tenant_id: uuidSchema,
    tenant_slug: z.string(),
    tenant_name: z.string(),
    roles: z.array(roleSchema),
  })
  .meta({ id: 'Membership' });
export type Membership = z.infer<typeof membershipSchema>;

export const meResponseSchema = z
  .object({
    user: z.object({
      id: uuidSchema,
      email: z.string(),
      display_name: z.string().nullable(),
    }),
    memberships: z.array(membershipSchema),
  })
  .meta({ id: 'Me' });
export type MeResponse = z.infer<typeof meResponseSchema>;

// ------------------------------------------------------------------ sites
export const addressSummarySchema = z
  .object({
    label: z.string(),
    city: z.string(),
    postal_code: z.string().nullable(),
  })
  .meta({ id: 'AddressSummary' });

export const siteSummarySchema = z
  .object({
    id: uuidSchema,
    tenant_id: uuidSchema,
    name: siteNameSchema,
    short_name: z.string().nullable(),
    status: siteStatusSchema,
    site_type: siteTypeSchema,
    sensitivity: sensitivitySchema,
    etare_number: etareNumberSchema.nullable(),
    address: addressSummarySchema.nullable(),
    location: pointSchema.nullable(),
    updated_at: isoDateTimeSchema,
  })
  .meta({ id: 'SiteSummary', description: 'Site (données de travail), vue liste.' });
export type SiteSummary = z.infer<typeof siteSummarySchema>;

export const activePublicationSchema = z
  .object({
    id: uuidSchema,
    publication_number: z.number().int().positive(),
    published_at: isoDateTimeSchema,
  })
  .meta({ id: 'ActivePublication' });

export const siteDetailSchema = siteSummarySchema
  .extend({
    footprint: multiPolygonSchema.nullable(),
    last_verified_at: isoDateTimeSchema.nullable(),
    building_count: z.number().int().nonnegative(),
    active_publication: activePublicationSchema.nullable(),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'SiteDetail', description: 'Site (données de travail), vue détaillée.' });
export type SiteDetail = z.infer<typeof siteDetailSchema>;

export const siteListQuerySchema = z.object({
  limit: pageLimitSchema,
  cursor: cursorSchema.optional(),
});
export type SiteListQuery = z.infer<typeof siteListQuerySchema>;

export const siteListResponseSchema = z
  .object({
    items: z.array(siteSummarySchema),
    next_cursor: cursorSchema.nullable(),
  })
  .meta({ id: 'SiteList' });
export type SiteListResponse = z.infer<typeof siteListResponseSchema>;

export const siteParamsSchema = z.object({ id: uuidSchema });
