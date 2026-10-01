import {
  CLASSIFICATION_TYPES,
  DOCUMENT_CATEGORIES,
  PLAN_TYPES,
  PORTAL_ACCESS_STATES,
  PORTAL_INVITATION_DEFAULT_DAYS,
  PORTAL_INVITATION_MAX_DAYS,
  PORTAL_INVITATION_MAX_SITES,
  PORTAL_INVITATION_STATES,
  SITE_TYPES,
} from '@etare/domain';
import { isoDateTimeSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

const siteRefSchema = z.object({ id: uuidSchema, name: z.string() });

// ------------------------------------------------------------------ invitations (inviters)
export const portalInvitationSchema = z
  .object({
    id: uuidSchema,
    email: z.string(),
    display_name: z.string().nullable(),
    organization: z.string().nullable(),
    sites: z.array(siteRefSchema),
    /** « expired »: pending past its date. */
    state: z.enum(PORTAL_INVITATION_STATES),
    expires_at: isoDateTimeSchema,
    /** End of the access granted (null: until revoked). */
    access_until: isoDateTimeSchema.nullable(),
    invited_by_name: z.string().nullable(),
    created_at: isoDateTimeSchema,
    accepted_at: isoDateTimeSchema.nullable(),
    revoked_at: isoDateTimeSchema.nullable(),
    revocation_reason: z.string().nullable(),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'PortalInvitation' });
export type PortalInvitation = z.infer<typeof portalInvitationSchema>;

export const portalInvitationListSchema = z
  .object({ items: z.array(portalInvitationSchema) })
  .meta({ id: 'PortalInvitationList' });
export type PortalInvitationList = z.infer<typeof portalInvitationListSchema>;

export const portalInvitationCreateSchema = z
  .object({
    email: z.email('Adresse e-mail invalide.').max(254),
    display_name: z.string().trim().min(1).max(200).nullable().optional(),
    /** Who the person represents (e.g. « Direction de l’établissement »). */
    organization: z.string().trim().min(1).max(200).nullable().optional(),
    site_ids: z
      .array(uuidSchema)
      .min(1, 'Choisissez au moins un site.')
      .max(PORTAL_INVITATION_MAX_SITES, `${PORTAL_INVITATION_MAX_SITES} sites au plus par invitation.`)
      .refine((values) => new Set(values).size === values.length, 'Site en double.'),
    /** Days during which the invitation can be accepted. */
    valid_days: z.number().int().min(1).max(PORTAL_INVITATION_MAX_DAYS).default(PORTAL_INVITATION_DEFAULT_DAYS),
    /** End of the access (date, Paris time); absent: until revoked. */
    access_until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue (AAAA-MM-JJ).')
      .nullable()
      .optional(),
  })
  .meta({ id: 'PortalInvitationCreate' });
export type PortalInvitationCreate = z.infer<typeof portalInvitationCreateSchema>;

export const portalInvitationCreatedSchema = z
  .object({
    invitation: portalInvitationSchema,
    /** 'sent': an account creation e-mail was sent; 'existing_account': the person already had an account. */
    notice: z.enum(['sent', 'existing_account']),
  })
  .meta({ id: 'PortalInvitationCreated' });
export type PortalInvitationCreated = z.infer<typeof portalInvitationCreatedSchema>;

export const portalInvitationRevokeSchema = z
  .object({ reason: z.string().trim().min(3, 'Motif obligatoire.').max(500) })
  .meta({ id: 'PortalInvitationRevoke' });
export type PortalInvitationRevoke = z.infer<typeof portalInvitationRevokeSchema>;

// ------------------------------------------------------------------ invitations (invitee)
export const myPortalInvitationSchema = z
  .object({
    id: uuidSchema,
    tenant_id: uuidSchema,
    tenant_name: z.string(),
    organization: z.string().nullable(),
    invited_by_name: z.string(),
    expires_at: isoDateTimeSchema,
    access_until: isoDateTimeSchema.nullable(),
    sites: z.array(siteRefSchema),
  })
  .meta({ id: 'MyPortalInvitation' });
export type MyPortalInvitation = z.infer<typeof myPortalInvitationSchema>;

export const myPortalInvitationListSchema = z
  .object({ items: z.array(myPortalInvitationSchema) })
  .meta({ id: 'MyPortalInvitationList' });
export type MyPortalInvitationList = z.infer<typeof myPortalInvitationListSchema>;

export const portalInvitationAcceptedSchema = z
  .object({ tenant_id: uuidSchema })
  .meta({ id: 'PortalInvitationAccepted' });
export type PortalInvitationAccepted = z.infer<typeof portalInvitationAcceptedSchema>;

// ------------------------------------------------------------------ settings and access
export const portalSettingsSchema = z
  .object({
    /** Exploitants of the SIS must use a second factor (default true). */
    mfa_required: z.boolean(),
  })
  .meta({ id: 'PortalSettings' });
export type PortalSettings = z.infer<typeof portalSettingsSchema>;

export const portalAccessSchema = z
  .object({ state: z.enum(PORTAL_ACCESS_STATES) })
  .meta({ id: 'PortalAccess', description: 'Accès du demandeur au portail exploitant du SIS actif.' });
export type PortalAccess = z.infer<typeof portalAccessSchema>;

// ------------------------------------------------------------------ consultation (POR-02)
const publishedVersionSchema = z
  .object({ publication_number: z.number().int().positive(), published_at: isoDateTimeSchema })
  .meta({ id: 'PortalPublishedVersion' });

export const portalSiteSummarySchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    etare_number: z.string().nullable(),
    /** End of the access (null: until the SIS ends it). */
    access_until: isoDateTimeSchema.nullable(),
    publication_number: z.number().int().positive().nullable(),
    published_at: isoDateTimeSchema.nullable(),
  })
  .meta({ id: 'PortalSiteSummary' });
export type PortalSiteSummary = z.infer<typeof portalSiteSummarySchema>;

export const portalSiteListSchema = z
  .object({ items: z.array(portalSiteSummarySchema) })
  .meta({ id: 'PortalSiteList' });
export type PortalSiteList = z.infer<typeof portalSiteListSchema>;

/**
 * What the exploitant reads of a site: a whitelist of its published version
 * (ADR-019). Never access codes, risks, objects, zones nor plan images.
 */
export const portalSiteSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    short_name: z.string().nullable(),
    etare_number: z.string().nullable(),
    site_type: z.enum(SITE_TYPES),
    address: z
      .object({
        label: z.string(),
        street: z.string().nullable(),
        postal_code: z.string().nullable(),
        city: z.string(),
      })
      .nullable(),
    access_until: isoDateTimeSchema.nullable(),
    /** Null: nothing published yet (or the version was withdrawn). */
    publication: publishedVersionSchema.nullable(),
    classifications: z.array(
      z
        .object({
          classification_type: z.enum(CLASSIFICATION_TYPES),
          code: z.string().nullable(),
          category: z.string().nullable(),
          label: z.string().nullable(),
          valid_from: z.string().nullable(),
          valid_to: z.string().nullable(),
        })
        .meta({ id: 'PortalClassification' }),
    ),
    contacts: z.array(
      z
        .object({
          name: z.string(),
          role: z.string().nullable(),
          phone: z.string(),
          phone_alt: z.string().nullable(),
          email: z.string().nullable(),
          availability: z.string().nullable(),
          verified_at: isoDateTimeSchema.nullable(),
        })
        .meta({ id: 'PortalContact' }),
    ),
    plans: z.array(
      z
        .object({
          id: uuidSchema,
          title: z.string(),
          plan_type: z.enum(PLAN_TYPES),
          building_name: z.string().nullable(),
          level_name: z.string().nullable(),
          revision_no: z.number().int().positive(),
        })
        .meta({ id: 'PortalPlan' }),
    ),
    documents: z.array(
      z
        .object({
          id: uuidSchema,
          title: z.string(),
          category: z.enum(DOCUMENT_CATEGORIES),
          version_no: z.number().int().positive(),
          valid_from: z.string().nullable(),
          expires_at: z.string().nullable(),
          filename: z.string(),
          mime_type: z.string(),
          size_bytes: z.number().int().nonnegative(),
        })
        .meta({ id: 'PortalDocument' }),
    ),
  })
  .meta({ id: 'PortalSite' });
export type PortalSite = z.infer<typeof portalSiteSchema>;

export const portalDocumentParamsSchema = z.object({ id: uuidSchema, document_id: uuidSchema });
