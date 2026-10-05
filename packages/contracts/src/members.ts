import { MEMBERSHIP_STATUSES, ROLES, TENANT_WIDE_ROLES } from '@etare/domain';
import { isoDateTimeSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';
import { namedRefSchema } from './sectors';

const roleSchema = z.enum(ROLES);
const tenantWideRolesSchema = z
  .array(z.enum(TENANT_WIDE_ROLES, { message: 'Rôle non attribuable à l’échelle du SIS.' }))
  .max(TENANT_WIDE_ROLES.length);

export const memberSchema = z
  .object({
    /** Identifier of the membership (not of the person). */
    id: uuidSchema,
    user_id: uuidSchema,
    email: z.string(),
    display_name: z.string().nullable(),
    status: z.enum(MEMBERSHIP_STATUSES),
    account_status: z.enum(['active', 'disabled', 'pending']),
    /** Roles over the whole SIS. */
    roles: z.array(roleSchema),
    /** Roles limited to a site (EXPLOITANT); managed with the operator portal. */
    site_roles: z.array(z.object({ role: roleSchema, site_id: uuidSchema, site_name: z.string().nullable() })),
    /** Perimeter of the roles above (PER-01): null for the whole SIS, otherwise sectors and sites. */
    perimeter: z.object({ sectors: z.array(namedRefSchema), sites: z.array(namedRefSchema) }).nullable(),
    /** Habilitation to the "restricted" sites (PER-02): whole SIS when no sector; null when none. */
    sensitive_access: z
      .object({ sectors: z.array(namedRefSchema), valid_until: isoDateTimeSchema })
      .meta({ id: 'SensitiveAccess' })
      .nullable(),
    /** The member is the caller: their own roles and status cannot be changed here. */
    is_self: z.boolean(),
    /** Null: the person never signed in (invitation not accepted yet). */
    last_sign_in_at: isoDateTimeSchema.nullable(),
    /** The person has a verified second factor. */
    second_factor: z.boolean(),
    row_version: z.number().int().positive(),
    created_at: isoDateTimeSchema,
  })
  .meta({ id: 'Member' });
export type Member = z.infer<typeof memberSchema>;

export const memberListResponseSchema = z.object({ items: z.array(memberSchema) }).meta({ id: 'MemberList' });

export const memberInviteSchema = z
  .object({
    email: z.email('Adresse e-mail invalide.').max(254),
    display_name: z.string().trim().min(1).max(200).nullable().optional(),
    roles: tenantWideRolesSchema.min(1, 'Choisissez au moins un rôle.'),
    /** Limits the roles to sectors and sites from the start (PER-01); none: the whole SIS. */
    sector_ids: z.array(uuidSchema).max(50).optional(),
    site_ids: z.array(uuidSchema).max(150).optional(),
  })
  .meta({ id: 'MemberInvite' });
export type MemberInvite = z.infer<typeof memberInviteSchema>;

export const memberInvitationSchema = z
  .object({
    member: memberSchema,
    /** 'sent': an invitation e-mail was sent; 'existing_account': the person already has an account. */
    invitation: z.enum(['sent', 'existing_account']),
  })
  .meta({ id: 'MemberInvitation' });
export type MemberInvitation = z.infer<typeof memberInvitationSchema>;

/** Grants (valid_until set, twelve months at most) or revokes (null) the habilitation to the sensitive sites. */
export const memberSensitiveAccessSchema = z
  .object({ sector_ids: z.array(uuidSchema).max(50), valid_until: isoDateTimeSchema.nullable() })
  .meta({ id: 'MemberSensitiveAccess' });
export type MemberSensitiveAccessInput = z.infer<typeof memberSensitiveAccessSchema>;

export const memberUpdateSchema = z
  .object({
    /** Replaces the roles, within the perimeter of the member; exploitant roles are left untouched. */
    roles: tenantWideRolesSchema.optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((value) => value.roles !== undefined || value.status !== undefined, {
    message: 'Aucune modification à enregistrer.',
  })
  .meta({ id: 'MemberUpdate' });
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;
