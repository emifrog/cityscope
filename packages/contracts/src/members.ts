import { MEMBERSHIP_STATUSES, ROLES, TENANT_WIDE_ROLES } from '@etare/domain';
import { isoDateTimeSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

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
    /** Roles limited to a site (e.g. EXPLOITANT); managed with the operator portal. */
    site_roles: z.array(z.object({ role: roleSchema, site_id: uuidSchema, site_name: z.string().nullable() })),
    /** The member is the caller: their own roles and status cannot be changed here. */
    is_self: z.boolean(),
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

export const memberUpdateSchema = z
  .object({
    /** Replaces the roles over the whole SIS; site-limited roles are left untouched. */
    roles: tenantWideRolesSchema.optional(),
    status: z.enum(['active', 'suspended']).optional(),
  })
  .refine((value) => value.roles !== undefined || value.status !== undefined, {
    message: 'Aucune modification à enregistrer.',
  })
  .meta({ id: 'MemberUpdate' });
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;
