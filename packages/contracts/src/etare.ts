import {
  CRITICALITIES,
  OBJECT_CATEGORIES,
  OBJECT_STATUSES,
  PLAN_TYPES,
  PUBLICATION_STATUSES,
  REVISION_STATUSES,
  ZONE_TYPES,
} from '@etare/domain';
import { cursorSchema, isoDateTimeSchema, localGeometrySchema, pageLimitSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';
import { assetSchema, documentSchema, documentVersionSchema } from './documents';
import { exteriorGeometrySchema } from './objects';
import { riskGeometrySchema } from './risks';
import { buildingSchema, classificationSchema, contactSchema, levelSchema } from './referential';
import { siteDetailSchema } from './resources';

// ------------------------------------------------------------------ canonical snapshot (ETARE-01)
const snapshotAsset = assetSchema
  .pick({ id: true, filename: true, mime_type: true, size_bytes: true, sha256: true })
  .meta({ id: 'SnapshotAsset' });

/** Position on a plan as validated: the exact background revision and its pixels. */
const snapshotPlacement = z
  .object({ plan_revision_id: uuidSchema, geometry: localGeometrySchema })
  .meta({ id: 'SnapshotPlacement' });

const properties = z.record(z.string(), z.unknown());

/**
 * Frozen content of a revision: what the validator approves and what the
 * publication carries, nothing else (the worker never reads the working
 * tables). Serialized canonically, its SHA-256 identifies the revision.
 * Contacts: only those meant for OPS. Files: only checked ones, by hash.
 */
export const etareSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    site: siteDetailSchema
      .pick({
        id: true,
        etare_number: true,
        name: true,
        short_name: true,
        site_type: true,
        status: true,
        sensitivity: true,
        address: true,
        location: true,
        footprint: true,
      })
      .meta({ id: 'SnapshotSite' }),
    classifications: z.array(
      classificationSchema.omit({ site_id: true, row_version: true }).meta({ id: 'SnapshotClassification' }),
    ),
    buildings: z.array(
      buildingSchema
        .omit({ site_id: true, status: true, row_version: true, levels: true })
        .extend({
          levels: z.array(
            levelSchema.omit({ building_id: true, status: true, row_version: true }).meta({ id: 'SnapshotLevel' }),
          ),
        })
        .meta({ id: 'SnapshotBuilding' }),
    ),
    contacts: z.array(
      contactSchema
        .omit({ site_id: true, visibility: true, status: true, row_version: true })
        .meta({ id: 'SnapshotContact' }),
    ),
    plans: z.array(
      z
        .object({
          id: uuidSchema,
          title: z.string(),
          plan_type: z.enum(PLAN_TYPES),
          building_id: uuidSchema.nullable(),
          level_id: uuidSchema.nullable(),
          background: z.object({
            revision_id: uuidSchema,
            revision_no: z.number().int().positive(),
            page_number: z.number().int().positive(),
            width: z.number().positive(),
            height: z.number().positive(),
            asset: snapshotAsset,
          }),
        })
        .meta({ id: 'SnapshotPlan' }),
    ),
    zones: z.array(
      z
        .object({
          id: uuidSchema,
          level_id: uuidSchema,
          name: z.string(),
          zone_type: z.enum(ZONE_TYPES),
          plan_position: snapshotPlacement.nullable(),
        })
        .meta({ id: 'SnapshotZone' }),
    ),
    objects: z.array(
      z
        .object({
          id: uuidSchema,
          type_code: z.string(),
          type_name: z.string(),
          category: z.enum(OBJECT_CATEGORIES),
          name: z.string().nullable(),
          label: z.string().nullable(),
          building_id: uuidSchema.nullable(),
          level_id: uuidSchema.nullable(),
          zone_id: uuidSchema.nullable(),
          geometry: exteriorGeometrySchema.nullable(),
          plan_position: snapshotPlacement.nullable(),
          properties,
          instructions: z.string().nullable(),
          criticality: z.enum(CRITICALITIES),
          status: z.enum(OBJECT_STATUSES).exclude(['archived']),
          verified_at: isoDateTimeSchema.nullable(),
          /** Checked photos (PLAN-05); absent when there are none, as in snapshots made before them. */
          photos: z
            .array(
              z
                .object({ id: uuidSchema, caption: z.string().nullable(), asset: snapshotAsset })
                .meta({ id: 'SnapshotObjectPhoto' }),
            )
            .optional(),
        })
        .meta({ id: 'SnapshotObject' }),
    ),
    risks: z.array(
      z
        .object({
          id: uuidSchema,
          type_code: z.string(),
          type_name: z.string(),
          icon_key: z.string(),
          severity: z.number().int().min(1).max(5),
          label: z.string().nullable(),
          description: z.string().nullable(),
          quantity: z.number().nullable(),
          unit: z.string().nullable(),
          properties,
          building_id: uuidSchema.nullable(),
          level_id: uuidSchema.nullable(),
          zone_id: uuidSchema.nullable(),
          plan_position: snapshotPlacement.nullable(),
          /** Location on the map (MET-02); absent when none, as in snapshots made before it. */
          geometry: riskGeometrySchema.optional(),
        })
        .meta({ id: 'SnapshotRisk' }),
    ),
    documents: z.array(
      documentSchema
        .pick({ id: true, title: true, category: true, offline_policy: true })
        .extend({
          /** Shown on the exploitant portal (POR-02); absent when not, as in snapshots made before it. */
          portal_visible: z.literal(true).optional(),
          version: documentVersionSchema
            .pick({ id: true, version_no: true, valid_from: true, expires_at: true })
            .extend({ asset: snapshotAsset })
            .meta({ id: 'SnapshotDocumentVersion' }),
        })
        .meta({ id: 'SnapshotDocument' }),
    ),
    /** The catalogue entries used, as they were: names and field labels travel with the content. */
    catalog: z
      .object({
        object_types: z.array(
          z
            .object({
              code: z.string(),
              name: z.string(),
              category: z.enum(OBJECT_CATEGORIES),
              icon_key: z.string(),
              properties_schema: properties,
            })
            .meta({ id: 'SnapshotObjectType' }),
        ),
        risk_types: z.array(
          z
            .object({ code: z.string(), name: z.string(), icon_key: z.string(), properties_schema: properties })
            .meta({ id: 'SnapshotRiskType' }),
        ),
      })
      .meta({ id: 'SnapshotCatalog' }),
  })
  .meta({ id: 'EtareSnapshot' });
export type EtareSnapshot = z.infer<typeof etareSnapshotSchema>;

// ------------------------------------------------------------------ checks before submission
export const ETARE_CHECK_LEVELS = ['ok', 'warning', 'error'] as const;

export const etareCheckSchema = z
  .object({
    code: z.string(),
    /** error: blocks the submission; warning: to be read by the validator. */
    level: z.enum(ETARE_CHECK_LEVELS),
    label: z.string(),
    detail: z.string(),
  })
  .meta({ id: 'EtareCheck' });
export type EtareCheck = z.infer<typeof etareCheckSchema>;

export const etarePreviewSchema = z
  .object({
    checks: z.array(etareCheckSchema),
    /** The snapshot as it would be frozen now, and its SHA-256. */
    snapshot: etareSnapshotSchema,
    content_hash: z.string(),
  })
  .meta({ id: 'EtarePreview' });
export type EtarePreview = z.infer<typeof etarePreviewSchema>;

// ------------------------------------------------------------------ revisions, decisions, publications
const person = z.object({ id: uuidSchema, name: z.string() }).meta({ id: 'PersonRef' });

export const etareDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'changes_requested', 'rejected']),
    comment: z.string().nullable(),
    actor: person,
    created_at: isoDateTimeSchema,
  })
  .meta({ id: 'EtareDecision' });

export const publicationSummarySchema = z
  .object({
    id: uuidSchema,
    publication_number: z.number().int().positive(),
    status: z.enum(PUBLICATION_STATUSES),
    requested_at: isoDateTimeSchema,
    published_at: isoDateTimeSchema.nullable(),
    failure_code: z.string().nullable(),
    manifest_hash: z.string().nullable(),
    /** The ETARE PDF generated with the publication (ETARE-02). */
    has_pdf: z.boolean(),
  })
  .meta({ id: 'PublicationSummary' });
export type PublicationSummary = z.infer<typeof publicationSummarySchema>;

export const etareRevisionSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    revision_no: z.number().int().positive(),
    status: z.enum(REVISION_STATUSES),
    change_summary: z.string().nullable(),
    content_hash: z.string().nullable(),
    created_by: person,
    created_at: isoDateTimeSchema,
    submitted_by: person.nullable(),
    submitted_at: isoDateTimeSchema.nullable(),
    decided_at: isoDateTimeSchema.nullable(),
    base_publication_number: z.number().int().positive().nullable(),
    /** Latest decision on this revision (a refusal carries its reason). */
    decision: etareDecisionSchema.nullable(),
    /** Latest publication built from this revision. */
    publication: publicationSummarySchema.nullable(),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'EtareRevision' });
export type EtareRevision = z.infer<typeof etareRevisionSchema>;

export const etareOverviewSchema = z
  .object({
    etare_id: uuidSchema.nullable(),
    /** Newest first. */
    revisions: z.array(etareRevisionSchema),
    publications: z.array(publicationSummarySchema),
  })
  .meta({ id: 'EtareOverview' });
export type EtareOverview = z.infer<typeof etareOverviewSchema>;

/** One site of the SIS and where its ETARE stands (list of dossiers). */
export const etareDossierSchema = z
  .object({
    site_id: uuidSchema,
    site_name: z.string(),
    etare_number: z.string().nullable(),
    active_publication: z
      .object({ publication_number: z.number().int().positive(), published_at: isoDateTimeSchema })
      .nullable(),
    latest_revision: z
      .object({
        id: uuidSchema,
        revision_no: z.number().int().positive(),
        status: z.enum(REVISION_STATUSES),
        updated_at: isoDateTimeSchema,
      })
      .nullable(),
  })
  .meta({ id: 'EtareDossier' });
export type EtareDossier = z.infer<typeof etareDossierSchema>;

/** `published`: a version in force; `to_validate`: last revision submitted; `in_progress`: draft or changes requested. */
export const ETARE_DOSSIER_STATES = ['all', 'published', 'unpublished', 'to_validate', 'in_progress'] as const;

export const etareDossierListQuerySchema = z.object({
  limit: pageLimitSchema,
  cursor: cursorSchema.optional(),
  /** Name or ETARE number. */
  q: z.string().trim().min(2).max(100).optional(),
  state: z.enum(ETARE_DOSSIER_STATES).default('all'),
});
export type EtareDossierListQuery = z.infer<typeof etareDossierListQuerySchema>;

export const etareDossierCountsSchema = z
  .object({
    /** Sites of the SIS, archived ones excepted, whatever the filters. */
    sites: z.number().int().min(0),
    published: z.number().int().min(0),
    unpublished: z.number().int().min(0),
    to_validate: z.number().int().min(0),
    in_progress: z.number().int().min(0),
  })
  .meta({ id: 'EtareDossierCounts' });
export type EtareDossierCounts = z.infer<typeof etareDossierCountsSchema>;

export const etareDossierListSchema = z
  .object({
    items: z.array(etareDossierSchema),
    next_cursor: cursorSchema.nullable(),
    counts: etareDossierCountsSchema,
  })
  .meta({ id: 'EtareDossierList' });
export type EtareDossierList = z.infer<typeof etareDossierListSchema>;

export const revisionCreateSchema = z
  .object({ change_summary: z.string().trim().min(1).max(2000).nullable().optional() })
  .meta({ id: 'RevisionCreate' });
export type RevisionCreate = z.infer<typeof revisionCreateSchema>;

export const revisionSubmitSchema = z
  .object({
    /** What changed and why: read by the validator. */
    change_summary: z.string().trim().min(1, 'Résumez les changements pour le validateur.').max(2000),
  })
  .meta({ id: 'RevisionSubmit' });
export type RevisionSubmit = z.infer<typeof revisionSubmitSchema>;

export const validationQueueItemSchema = z
  .object({
    revision_id: uuidSchema,
    site_id: uuidSchema,
    site_name: z.string(),
    etare_number: z.string().nullable(),
    revision_no: z.number().int().positive(),
    change_summary: z.string().nullable(),
    submitted_by: person,
    submitted_at: isoDateTimeSchema,
    base_publication_number: z.number().int().positive().nullable(),
  })
  .meta({ id: 'ValidationQueueItem' });
export type ValidationQueueItem = z.infer<typeof validationQueueItemSchema>;

export const validationQueueSchema = z
  .object({ items: z.array(validationQueueItemSchema) })
  .meta({ id: 'ValidationQueue' });

export const ETARE_SECTIONS = [
  'site',
  'classifications',
  'buildings',
  'contacts',
  'plans',
  'zones',
  'objects',
  'risks',
  'documents',
] as const;
export type EtareSection = (typeof ETARE_SECTIONS)[number];

/** One element added, removed or modified since the base publication (by stable identifier). */
export const etareChangeSchema = z
  .object({
    section: z.enum(ETARE_SECTIONS),
    id: z.string(),
    label: z.string(),
    change: z.enum(['added', 'removed', 'modified']),
  })
  .meta({ id: 'EtareChange' });
export type EtareChange = z.infer<typeof etareChangeSchema>;

export const revisionDetailSchema = z
  .object({
    revision: etareRevisionSchema,
    site_name: z.string(),
    snapshot: etareSnapshotSchema.nullable(),
    /** Null when there is nothing to compare with (first version, or a base in an older format). */
    changes: z.array(etareChangeSchema).nullable(),
    contributors: z.array(person),
  })
  .meta({ id: 'RevisionDetail' });
export type RevisionDetail = z.infer<typeof revisionDetailSchema>;

export const revisionDecisionSchema = z
  .object({
    decision: z.enum(['approved', 'changes_requested']),
    /** Mandatory reason of a refusal; optional note of an approval. */
    comment: z.string().trim().min(1).max(4000).nullable().optional(),
    /** The exact content the validator reviewed: a revision changed since is refused. */
    revision_hash: z.string().regex(/^[0-9a-f]{64}$/),
    /** Approve and publish at once (the validator holds publication:publish). */
    publish: z.boolean().default(true),
  })
  .refine((value) => value.decision === 'approved' || Boolean(value.comment), {
    message: 'Motivez la demande de correction.',
    path: ['comment'],
  })
  .meta({ id: 'RevisionDecision' });
export type RevisionDecisionInput = z.input<typeof revisionDecisionSchema>;
export type RevisionDecision = z.infer<typeof revisionDecisionSchema>;
