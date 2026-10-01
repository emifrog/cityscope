import {
  CONTRIBUTION_OPERATIONS,
  CONTRIBUTION_STATUSES,
  CONTRIBUTION_TARGETS,
  CONTRIBUTION_TARGET_OPERATIONS,
  MAX_CONTRIBUTION_DECISION,
  MAX_CONTRIBUTION_DESCRIPTION,
  MAX_CONTRIBUTION_FILES,
  MAX_CONTRIBUTION_MESSAGE,
  MAX_CONTRIBUTION_TITLE,
  SCAN_STATUSES,
  contributionCarriesValue,
  contributionNeedsTarget,
} from '@etare/domain';
import { cursorSchema, isoDateTimeSchema, pageLimitSchema, sha256Schema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';
import { assetSchema, fileDeclarationSchema, uploadTicketSchema } from './documents';
import { phoneSchema } from './referential';

// ------------------------------------------------------------------ proposed values (POR-03)
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => text(max).nullable().optional();

/** A contact as the exploitant proposes it: the fields shown on the portal. */
export const contactProposalSchema = z
  .object({
    name: text(200).optional(),
    role: optionalText(200),
    phone: phoneSchema.optional(),
    phone_alt: phoneSchema.nullable().optional(),
    email: z.email('Adresse e-mail invalide.').max(254).nullable().optional(),
    availability: optionalText(200),
  })
  .strict()
  .meta({ id: 'ContactProposal' });

/** Identity and address of the site as the exploitant proposes them. */
export const siteProposalSchema = z
  .object({
    name: text(200).optional(),
    street: optionalText(200),
    postal_code: z
      .string()
      .trim()
      .regex(/^[0-9]{5}$/, 'Code postal à cinq chiffres.')
      .nullable()
      .optional(),
    city: text(120).optional(),
  })
  .strict()
  .meta({ id: 'SiteProposal' });

const proposedValueSchema = z.record(z.string(), z.string().nullable());

// ------------------------------------------------------------------ the exploitant proposes
export const contributionCreateSchema = z
  .object({
    target_type: z.enum(CONTRIBUTION_TARGETS),
    operation: z.enum(CONTRIBUTION_OPERATIONS),
    /** Element of the published version (contact, plan, document) changed or removed. */
    target_id: uuidSchema.nullable().optional(),
    title: z.string().trim().min(1, 'Donnez un titre à votre proposition.').max(MAX_CONTRIBUTION_TITLE),
    description: z.string().trim().min(1, 'Décrivez la mise à jour proposée.').max(MAX_CONTRIBUTION_DESCRIPTION),
    /** Contact or site fields proposed; absent for plans, documents and other information. */
    proposed_value: proposedValueSchema.nullable().optional(),
    files: z.array(fileDeclarationSchema).max(MAX_CONTRIBUTION_FILES, `${MAX_CONTRIBUTION_FILES} fichiers au plus.`),
  })
  .superRefine((input, context) => {
    if (!CONTRIBUTION_TARGET_OPERATIONS[input.target_type].includes(input.operation)) {
      context.addIssue({ code: 'custom', path: ['operation'], message: 'Opération impossible sur cet élément.' });
      return;
    }
    if (contributionNeedsTarget(input.target_type, input.operation) && !input.target_id) {
      context.addIssue({ code: 'custom', path: ['target_id'], message: 'Choisissez l’élément concerné.' });
    }
    const value = input.proposed_value ?? null;
    if (!contributionCarriesValue(input.target_type, input.operation)) {
      if (value !== null) {
        context.addIssue({ code: 'custom', path: ['proposed_value'], message: 'Aucune valeur attendue ici.' });
      }
      return;
    }
    const schema = input.target_type === 'site' ? siteProposalSchema : contactProposalSchema;
    const parsed = schema.safeParse(value ?? {});
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({ code: 'custom', path: ['proposed_value', ...issue.path], message: issue.message });
      }
      return;
    }
    const fields = Object.entries(parsed.data).filter(([, field]) => field !== undefined);
    if (fields.length === 0) {
      context.addIssue({ code: 'custom', path: ['proposed_value'], message: 'Indiquez au moins une valeur.' });
    }
    if (input.target_type === 'contact' && input.operation === 'create') {
      const contact = parsed.data as z.infer<typeof contactProposalSchema>;
      if (!contact.name) {
        context.addIssue({ code: 'custom', path: ['proposed_value', 'name'], message: 'Le nom est obligatoire.' });
      }
      if (!contact.phone) {
        context.addIssue({
          code: 'custom',
          path: ['proposed_value', 'phone'],
          message: 'Le téléphone est obligatoire.',
        });
      }
    }
  })
  .meta({ id: 'ContributionCreate' });
export type ContributionCreateInput = z.input<typeof contributionCreateSchema>;
export type ContributionCreate = z.infer<typeof contributionCreateSchema>;

const portalMessageSchema = z
  .object({
    id: uuidSchema,
    side: z.enum(['exploitant', 'sis']),
    kind: z.enum(['message', 'info_request']),
    body: z.string(),
    created_at: isoDateTimeSchema,
    author_name: z.string().nullable(),
  })
  .meta({ id: 'PortalContributionMessage' });

/** A proposal as its author sees it (portal). */
export const portalContributionSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    site_name: z.string(),
    target_type: z.enum(CONTRIBUTION_TARGETS),
    target_id: uuidSchema.nullable(),
    operation: z.enum(CONTRIBUTION_OPERATIONS),
    title: z.string(),
    description: z.string(),
    /** Value seen in the published version (change or removal). */
    base_value: proposedValueSchema.nullable(),
    proposed_value: proposedValueSchema.nullable(),
    status: z.enum(CONTRIBUTION_STATUSES),
    decision_comment: z.string().nullable(),
    decided_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema,
    /** Published version the proposal was made on. */
    publication_number: z.number().int().positive().nullable(),
    messages: z.array(portalMessageSchema),
    files: z.array(
      z
        .object({
          filename: z.string(),
          mime_type: z.string(),
          size_bytes: z.number().int().nonnegative(),
          scan_status: z.enum(SCAN_STATUSES),
        })
        .meta({ id: 'PortalContributionFile' }),
    ),
    /** Revision that integrates an accepted proposal, and its publication once published. */
    resolution: z
      .object({ revision_no: z.number().int().positive(), publication_number: z.number().int().positive().nullable() })
      .nullable(),
  })
  .meta({ id: 'PortalContribution' });
export type PortalContribution = z.infer<typeof portalContributionSchema>;

export const portalContributionListSchema = z
  .object({ items: z.array(portalContributionSchema) })
  .meta({ id: 'PortalContributionList' });
export type PortalContributionList = z.infer<typeof portalContributionListSchema>;

export const portalContributionListQuerySchema = z.object({ site_id: uuidSchema.optional() });
export type PortalContributionListQuery = z.infer<typeof portalContributionListQuerySchema>;

/** Recorded proposal and where to send its files. */
export const contributionReceiptSchema = z
  .object({
    contribution: portalContributionSchema,
    uploads: z.array(z.object({ sha256: sha256Schema, upload: uploadTicketSchema })),
  })
  .meta({ id: 'ContributionReceipt' });
export type ContributionReceipt = z.infer<typeof contributionReceiptSchema>;

export const contributionUploadedSchema = z
  .object({ contribution_id: uuidSchema, verifications: z.number().int().min(0) })
  .meta({ id: 'ContributionUploaded' });
export type ContributionUploaded = z.infer<typeof contributionUploadedSchema>;

export const contributionMessageCreateSchema = z
  .object({ body: z.string().trim().min(1, 'Écrivez votre message.').max(MAX_CONTRIBUTION_MESSAGE) })
  .meta({ id: 'ContributionMessageCreate' });
export type ContributionMessageCreate = z.infer<typeof contributionMessageCreateSchema>;

// ------------------------------------------------------------------ instruction by the Prévision (POR-04)
const personSchema = z.object({ id: uuidSchema, name: z.string() });

export const contributionSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    site_name: z.string(),
    etare_number: z.string().nullable(),
    author: personSchema.extend({ email: z.string().nullable() }),
    target_type: z.enum(CONTRIBUTION_TARGETS),
    target_id: uuidSchema.nullable(),
    operation: z.enum(CONTRIBUTION_OPERATIONS),
    title: z.string(),
    description: z.string(),
    /** Value the exploitant saw in the published version, value proposed, value in the working data now. */
    base_value: proposedValueSchema.nullable(),
    proposed_value: proposedValueSchema.nullable(),
    current_value: proposedValueSchema.nullable(),
    /** The working value changed (or the element is gone) since the proposal: accepting needs a resolution. */
    conflict: z.boolean(),
    publication: z.object({ id: uuidSchema, publication_number: z.number().int().positive() }).nullable(),
    current_publication_number: z.number().int().positive().nullable(),
    status: z.enum(CONTRIBUTION_STATUSES),
    assigned_to: personSchema.nullable(),
    decision_comment: z.string().nullable(),
    conflict_resolution: z.string().nullable(),
    decided_by: personSchema.nullable(),
    decided_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema,
    messages: z.array(
      z
        .object({
          id: uuidSchema,
          side: z.enum(['exploitant', 'sis']),
          kind: z.enum(['message', 'info_request']),
          body: z.string(),
          created_at: isoDateTimeSchema,
          author: personSchema,
        })
        .meta({ id: 'ContributionMessage' }),
    ),
    attachments: z.array(assetSchema),
    resolution: z
      .object({
        revision_id: uuidSchema,
        revision_no: z.number().int().positive(),
        revision_status: z.string(),
        publication_number: z.number().int().positive().nullable(),
      })
      .nullable(),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'Contribution' });
export type Contribution = z.infer<typeof contributionSchema>;

/** `open`: submitted, in review or waiting for the exploitant (default); `closed`: decided or withdrawn. */
export const CONTRIBUTION_VIEWS = ['open', 'closed', 'all'] as const;
export const contributionListQuerySchema = z.object({
  limit: pageLimitSchema,
  cursor: cursorSchema.optional(),
  view: z.enum(CONTRIBUTION_VIEWS).default('open'),
  site_id: uuidSchema.optional(),
  /** Proposals integrated into this working revision (validation screen). */
  revision_id: uuidSchema.optional(),
});
export type ContributionListQuery = z.infer<typeof contributionListQuerySchema>;

export const contributionListSchema = z
  .object({
    items: z.array(contributionSchema),
    next_cursor: cursorSchema.nullable(),
    /** Proposals to instruct in the SIS, whatever the filters. */
    open_count: z.number().int().min(0),
  })
  .meta({ id: 'ContributionList' });
export type ContributionList = z.infer<typeof contributionListSchema>;

export const contributionUpdateSchema = z
  .object({
    status: z.enum(['in_review', 'info_requested', 'accepted', 'partially_accepted', 'rejected']).optional(),
    assigned_to: uuidSchema.nullable().optional(),
    decision_comment: z.string().trim().min(1).max(MAX_CONTRIBUTION_DECISION).nullable().optional(),
    /** How a conflict with the working data was settled (required to accept a proposal in conflict). */
    conflict_resolution: z.string().trim().min(1).max(MAX_CONTRIBUTION_DECISION).nullable().optional(),
    /** Draft revision of the site that integrates the accepted proposal. */
    revision_id: uuidSchema.nullable().optional(),
    /** Message to the exploitant (required to ask for information). */
    message: z.string().trim().min(1).max(MAX_CONTRIBUTION_MESSAGE).optional(),
  })
  .refine(
    (patch) =>
      !patch.status ||
      !['accepted', 'partially_accepted', 'rejected'].includes(patch.status) ||
      Boolean(patch.decision_comment),
    { message: 'Motivez la décision : l’exploitant la lira.', path: ['decision_comment'] },
  )
  .refine((patch) => patch.status !== 'info_requested' || Boolean(patch.message), {
    message: 'Écrivez la question posée à l’exploitant.',
    path: ['message'],
  })
  .meta({ id: 'ContributionUpdate' });
export type ContributionUpdate = z.infer<typeof contributionUpdateSchema>;
