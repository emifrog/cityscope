import {
  etareSnapshotSchema,
  type AssetDownload,
  type EtareDossierList,
  type EtareDossierListQuery,
  type EtareLayoutSettings,
  type EtareOverview,
  type EtarePreview,
  type EtareRevision,
  type PublicationSummary,
  type PublicationWithdraw,
  type RevisionCreate,
  type RevisionDecision,
  type RevisionDetail,
  type RevisionSubmit,
  type ValidationQueueItem,
} from '@etare/contracts';
import {
  AccessDenied,
  Conflict,
  NotFound,
  ServiceUnavailable,
  InvalidInput,
  PreconditionFailed,
  assertIndependentValidator,
  canonicalJson,
  type RequestContext,
} from '@etare/domain';
import { buildSnapshot, compareSnapshots, preSubmissionChecks, type WorkingData } from './etare-snapshot';
import type { RequestSession, SessionFactory } from './ports';
import { PUBLICATION_BUILD_JOB, publicationPdfKey } from './publication-build';
import type { ObjectStorage } from './ports';
import { found, inTenant, retryOnSerializationConflict } from './use-cases';

/**
 * Revision, validation and publication of the ETARE of a site (WF-01, WF-02,
 * ETARE-01). The working data are frozen into a canonical snapshot at
 * submission; a validator who did not contribute approves that exact content
 * (hash) with a second factor; the worker publishes it without ever reading
 * the working tables again.
 */

/** Use cases that hash content: SHA-256 (hex) of the UTF-8 bytes of a text, provided by the runtime. */
export interface EtareDependencies {
  readonly sessions: SessionFactory;
  readonly sha256: (text: string) => Promise<string>;
}

async function workingData(session: RequestSession, siteId: string): Promise<WorkingData> {
  const site = found(await session.sites.get(siteId), 'Site introuvable.');
  // One after the other: the session holds one connection, which runs one query at a time anyway
  // (pg 9 refuses a query sent while another one runs).
  const classifications = await session.classifications.listBySite(siteId);
  const buildings = await session.buildings.listBySite(siteId);
  const contacts = await session.contacts.listBySite(siteId);
  const plans = await session.plans.listBySite(siteId);
  const zones = await session.zones.listBySite(siteId);
  const objects = await session.objects.listBySite(siteId);
  const risks = await session.risks.listBySite(siteId);
  const substances = await session.substances.listBySite(siteId);
  const documents = await session.documents.listBySite(siteId);
  const objectTypes = await session.objects.types();
  const riskTypes = await session.risks.types({ includeDeprecated: true });
  const hiddenSections = await session.etare.layoutSettings();
  return {
    site,
    classifications,
    buildings,
    contacts,
    plans: plans ?? [],
    zones: zones ?? [],
    objects: objects ?? [],
    risks: risks ?? [],
    substances: substances ?? [],
    documents,
    objectTypes,
    riskTypes,
    hiddenSections,
  };
}

/** Sections hidden by the SIS (DEC-05): frozen in each revision submitted afterwards. */
export function getEtareLayoutSettings(
  sessions: SessionFactory,
  context: RequestContext,
): Promise<EtareLayoutSettings> {
  return inTenant(sessions, context, 'etare:read', async (session) => ({
    hidden_sections: await session.etare.layoutSettings(),
  }));
}

export function updateEtareLayoutSettings(
  sessions: SessionFactory,
  context: RequestContext,
  input: EtareLayoutSettings,
): Promise<EtareLayoutSettings> {
  return inTenant(sessions, context, 'catalog:manage', async (session) => ({
    hidden_sections: await session.etare.updateLayoutSettings(input.hidden_sections),
  }));
}

export function listEtareDossiers(
  sessions: SessionFactory,
  context: RequestContext,
  query: EtareDossierListQuery,
): Promise<EtareDossierList> {
  return inTenant(sessions, context, 'etare:read', (session) => session.etare.dossiers(query));
}

export function getSiteEtare(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
): Promise<EtareOverview> {
  return inTenant(sessions, context, 'etare:read', async (session) =>
    found(await session.etare.overview(siteId), 'Site introuvable.'),
  );
}

/** What would be frozen now, with the checks before submission ("prévisualisation fidèle"). */
export function previewSiteEtare(
  deps: EtareDependencies,
  context: RequestContext,
  siteId: string,
): Promise<EtarePreview> {
  // One consistent database version for every table read, and for the contributors collected.
  return retryOnSerializationConflict(() =>
    inTenant(
      deps.sessions,
      context,
      'etare:read',
      async (session) => {
        const data = await workingData(session, siteId);
        const snapshot = buildSnapshot(data);
        await session.accessJournal.record(data.site.id, null, 'view');
        return {
          checks: preSubmissionChecks(data, new Date()),
          snapshot,
          content_hash: await deps.sha256(canonicalJson(snapshot)),
        };
      },
      { isolation: 'repeatable_read' },
    ),
  );
}

export function createRevision(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
  input: RevisionCreate,
): Promise<EtareRevision> {
  return inTenant(sessions, context, 'etare:edit', async (session) =>
    found(await session.etare.createRevision(siteId, input.change_summary ?? null), 'Site introuvable.'),
  );
}

/** Freezes the working data into the revision, if no check blocks it. */
export function submitRevision(
  deps: EtareDependencies,
  context: RequestContext,
  revisionId: string,
  expectedVersion: number,
  input: RevisionSubmit,
): Promise<EtareRevision> {
  // One consistent database version for every table read, and for the contributors collected.
  return retryOnSerializationConflict(() =>
    inTenant(
      deps.sessions,
      context,
      'etare:submit',
      async (session) => {
        const record = found(await session.etare.revision(revisionId), 'Révision introuvable.');
        if (record.revision.status !== 'draft') {
          throw new Conflict('Cette révision n’est plus un brouillon : elle a déjà été soumise ou remplacée.');
        }
        const data = await workingData(session, record.revision.site_id);
        const blocking = preSubmissionChecks(data, new Date()).filter((check) => check.level === 'error');
        if (blocking.length > 0) {
          throw new InvalidInput(
            'La révision ne peut pas être soumise : corrigez les points bloquants.',
            blocking.map((check) => ({ path: `checks.${check.code}`, message: `${check.label} : ${check.detail}` })),
          );
        }
        const snapshot = buildSnapshot(data);
        return found(
          await session.etare.submit(revisionId, expectedVersion, {
            snapshot,
            contentHash: await deps.sha256(canonicalJson(snapshot)),
            changeSummary: input.change_summary,
          }),
          'Révision introuvable.',
        );
      },
      { isolation: 'repeatable_read' },
    ),
  );
}

export function listValidations(sessions: SessionFactory, context: RequestContext): Promise<ValidationQueueItem[]> {
  return inTenant(sessions, context, 'etare:read', (session) => session.etare.queue());
}

export function getRevision(
  sessions: SessionFactory,
  context: RequestContext,
  revisionId: string,
): Promise<RevisionDetail> {
  return inTenant(sessions, context, 'etare:read', async (session) => {
    const record = found(await session.etare.revision(revisionId), 'Révision introuvable.');
    await session.accessJournal.record(record.revision.site_id, null, 'view');
    const snapshot = etareSnapshotSchema.safeParse(record.snapshot);
    const base = etareSnapshotSchema.safeParse(record.baseSnapshot);
    return {
      revision: record.revision,
      site_name: record.siteName,
      snapshot: snapshot.success ? snapshot.data : null,
      changes: snapshot.success && base.success ? compareSnapshots(base.data, snapshot.data) : null,
      contributors: [...record.contributors],
    };
  });
}

/**
 * Decision of a validator (etare:approve, second factor). The validator must
 * not have contributed, and decides on the exact content they reviewed.
 * "Valider et publier" queues the publication in the same transaction.
 */
export function decideRevision(
  sessions: SessionFactory,
  context: RequestContext,
  revisionId: string,
  input: RevisionDecision,
): Promise<EtareRevision> {
  return inTenant(sessions, context, 'etare:approve', async (session) => {
    const record = found(await session.etare.revision(revisionId), 'Révision introuvable.');
    const { revision } = record;
    if (revision.status !== 'submitted') throw new Conflict('Cette révision n’est plus en attente de validation.');
    if (revision.content_hash !== input.revision_hash) {
      throw new PreconditionFailed('La révision a changé depuis votre lecture : rechargez-la avant de décider.');
    }
    assertIndependentValidator(session.access.userId, {
      createdBy: revision.created_by.id,
      submittedBy: revision.submitted_by?.id ?? null,
      contributorIds: record.contributors.map((contributor) => contributor.id),
    });
    const publish = input.decision === 'approved' && input.publish;
    if (publish && !session.access.permissions.has('publication:publish')) {
      throw new AccessDenied('Vous pouvez valider, mais pas publier : décochez la publication immédiate.');
    }
    const approvalId = await session.etare.decide(revisionId, {
      decision: input.decision,
      comment: input.comment ?? null,
      revisionHash: input.revision_hash,
    });
    if (publish) await queuePublication(session, revisionId, approvalId);
    return found(await session.etare.revision(revisionId), 'Révision introuvable.').revision;
  });
}

async function queuePublication(session: RequestSession, revisionId: string, approvalId: string): Promise<string> {
  const publicationId = await session.etare.requestPublication(revisionId, approvalId);
  await session.jobs.enqueue(
    PUBLICATION_BUILD_JOB,
    { publication_id: publicationId },
    `${PUBLICATION_BUILD_JOB}:${publicationId}`,
  );
  return publicationId;
}

/** Publishes an approved revision again (after a failed build). */
export function publishRevision(
  sessions: SessionFactory,
  context: RequestContext,
  revisionId: string,
): Promise<EtareRevision> {
  return inTenant(sessions, context, 'publication:publish', async (session) => {
    const record = found(await session.etare.revision(revisionId), 'Révision introuvable.');
    if (record.revision.status !== 'approved') throw new Conflict('Seule une révision validée peut être publiée.');
    const current = record.revision.publication;
    if (current && current.status !== 'failed') {
      throw new Conflict('Cette révision est déjà publiée ou en cours de publication.');
    }
    const approvalId = found(await session.etare.approvalOf(revisionId), 'Validation introuvable.');
    const publicationId = await queuePublication(session, revisionId, approvalId);
    // A new publication (new number, new files): the failed one stays in the history.
    await session.audit.record('publication.retry', 'publication', publicationId, {
      revision_id: revisionId,
      previous_publication_id: current?.id ?? null,
      previous_failure_code: current?.failure_code ?? null,
    });
    return found(await session.etare.revision(revisionId), 'Révision introuvable.').revision;
  });
}

/**
 * Withdraws the version in force of a site (MET-04): a validator with the
 * second factor, with a reason. Terminals remove it at their next contact and
 * are told why; the publication stays in the history.
 */
export function withdrawPublication(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  input: PublicationWithdraw,
): Promise<PublicationSummary> {
  return inTenant(sessions, context, 'publication:publish', async (session) =>
    found(await session.etare.withdraw(id, expectedVersion, input.reason), 'Publication introuvable.'),
  );
}

const PDF_URL_SECONDS = 60;

const fileName = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * ETARE PDF of a publication (ETARE-02): authorized in PostgreSQL (OPS only
 * reach active publications), traced, then served by a 60 s signed URL.
 */
export async function getPublicationPdf(
  deps: { readonly sessions: SessionFactory; readonly storage: ObjectStorage | null },
  context: RequestContext,
  publicationId: string,
): Promise<AssetDownload> {
  if (!deps.storage) throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  const storage = deps.storage;
  const publication = await inTenant(deps.sessions, context, 'publication:read', async (session) => {
    const record = found(await session.etare.publication(publicationId), 'Publication introuvable.');
    if (!record.hasPdf) throw new NotFound('Aucun PDF pour cette version.');
    // A sensitive site: its back-office roles, or a habilitation for a "restricted" one (PER-02).
    if (!(await session.accessJournal.exportAllowed(record.id))) {
      throw new AccessDenied('Site sensible : le PDF est réservé aux personnes habilitées.');
    }
    await session.audit.record('publication.pdf_download', 'publication', record.id, {
      publication_number: record.publicationNumber,
    });
    await session.accessJournal.record(record.siteId, record.id, 'export');
    return record;
  });
  const { url, expiresAt } = await storage.createDownloadUrl(
    publication.pdfStorageKey ?? publicationPdfKey(publication.tenantId, publication.id),
    PDF_URL_SECONDS,
  );
  return {
    url,
    expires_at: expiresAt.toISOString(),
    filename: `ETARE-${fileName(publication.etareNumber ?? publication.siteName)}-v${publication.publicationNumber}.pdf`,
    mime_type: 'application/pdf',
  };
}
