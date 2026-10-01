import type {
  Contribution,
  ContributionCreate,
  ContributionList,
  ContributionListQuery,
  ContributionMessageCreate,
  ContributionReceipt,
  ContributionUpdate,
  ContributionUploaded,
  PortalContribution,
  PortalContributionList,
  PortalContributionListQuery,
} from '@etare/contracts';
import {
  ACCEPTED_CONTRIBUTION_STATUSES,
  Conflict,
  FINAL_CONTRIBUTION_STATUSES,
  InvalidInput,
  ServiceUnavailable,
  nextContributionStatuses,
  type RequestContext,
} from '@etare/domain';
import { inPortal } from './portal-consultation';
import type { SessionFactory } from './ports';
import type { DocumentDependencies } from './uploads';
import { found, inTenant } from './use-cases';

/**
 * Proposals of the exploitants (POR-03, POR-04, ADR-019). The exploitant
 * proposes an update on one of their sites, with files sent through the
 * controlled upload chain; the Prévision instructs it. A proposal never
 * changes the working data nor a publication: an accepted one is integrated
 * into a draft revision, then validated by an independent validator.
 */

// ------------------------------------------------------------------ the exploitant
export async function createPortalContribution(
  deps: DocumentDependencies,
  context: RequestContext,
  siteId: string,
  input: ContributionCreate,
): Promise<ContributionReceipt> {
  if (input.files.length > 0 && !deps.storage) {
    throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  }
  const { contribution, files } = await inPortal(deps.sessions, context, async (session) => {
    const id = await session.contributions.submit(siteId, context.tenantId ?? '', input);
    return {
      contribution: found(await session.contributions.mineOne(id), 'Proposition introuvable.'),
      files: await session.contributions.files(id),
    };
  });
  // Signed URLs after the commit: no network call inside the transaction.
  const storage = deps.storage;
  const uploads = storage
    ? await Promise.all(
        files
          .filter((file) => file.scanStatus === 'pending' && file.quarantineKey !== null)
          .map(async (file) => {
            const { url, headers, expiresAt } = await storage.createUploadUrl(file.quarantineKey ?? '', file.mimeType);
            return {
              sha256: file.sha256,
              upload: {
                asset_id: file.assetId,
                method: 'PUT' as const,
                url,
                headers,
                expires_at: expiresAt.toISOString(),
              },
            };
          }),
      )
    : [];
  return { contribution, uploads };
}

/** The exploitant has sent the files of their proposal: their verification is planned (idempotent). */
export async function confirmPortalContributionUploads(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
): Promise<ContributionUploaded> {
  const verifications = await inPortal(sessions, context, (session) => session.contributions.uploaded(id));
  return { contribution_id: id, verifications };
}

export function listPortalContributions(
  sessions: SessionFactory,
  context: RequestContext,
  query: PortalContributionListQuery,
): Promise<PortalContributionList> {
  return inPortal(sessions, context, async (session) => ({
    items: await session.contributions.mine(query.site_id ?? null),
  }));
}

export function getPortalContribution(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
): Promise<PortalContribution> {
  return inPortal(sessions, context, async (session) =>
    found(await session.contributions.mineOne(id), 'Proposition introuvable.'),
  );
}

/** Answer of the exploitant (a question of the SIS is then answered and the proposal back in review). */
export function replyPortalContribution(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  input: ContributionMessageCreate,
): Promise<PortalContribution> {
  return inPortal(sessions, context, async (session) => {
    await session.contributions.reply(id, input.body);
    return found(await session.contributions.mineOne(id), 'Proposition introuvable.');
  });
}

export function withdrawPortalContribution(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
): Promise<PortalContribution> {
  return inPortal(sessions, context, async (session) => {
    const current = found(await session.contributions.mineOne(id), 'Proposition introuvable.');
    if (FINAL_CONTRIBUTION_STATUSES.has(current.status)) {
      throw new Conflict('Cette proposition est déjà décidée ou retirée.');
    }
    await session.contributions.withdraw(id);
    return found(await session.contributions.mineOne(id), 'Proposition introuvable.');
  });
}

// ------------------------------------------------------------------ instruction by the Prévision
export function listContributions(
  sessions: SessionFactory,
  context: RequestContext,
  query: ContributionListQuery,
): Promise<ContributionList> {
  return inTenant(sessions, context, 'contribution:review', async (session) => {
    const { items, nextCursor, openCount } = await session.contributions.list(query);
    return { items, next_cursor: nextCursor, open_count: openCount };
  });
}

export function getContribution(sessions: SessionFactory, context: RequestContext, id: string): Promise<Contribution> {
  return inTenant(sessions, context, 'contribution:review', async (session) =>
    found(await session.contributions.get(id), 'Proposition introuvable.'),
  );
}

/**
 * Takes a proposal in charge, asks the exploitant for information, integrates
 * it into the draft revision, or decides it (motivated, final). Accepting a
 * proposal whose value changed in the working data since (conflict) requires
 * an explicit resolution. The database enforces the same rules.
 */
export function updateContribution(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: ContributionUpdate,
): Promise<Contribution> {
  return inTenant(sessions, context, 'contribution:review', async (session) => {
    const current = found(await session.contributions.get(id), 'Proposition introuvable.');
    if (FINAL_CONTRIBUTION_STATUSES.has(current.status)) {
      throw new Conflict('Cette proposition est déjà décidée ou retirée : la décision est définitive.');
    }
    if (
      patch.status &&
      patch.status !== current.status &&
      !nextContributionStatuses(current.status).includes(patch.status)
    ) {
      throw new InvalidInput('Transition impossible pour cette proposition.', [
        { path: 'status', message: 'Transition impossible.' },
      ]);
    }
    if (patch.status && ACCEPTED_CONTRIBUTION_STATUSES.has(patch.status)) {
      const revision = patch.revision_id === undefined ? current.resolution?.revision_id : patch.revision_id;
      if (!revision) {
        throw new InvalidInput('Intégrez d’abord la proposition à une révision en brouillon du site.', [
          { path: 'revision_id', message: 'Révision en brouillon requise.' },
        ]);
      }
      const resolution =
        patch.conflict_resolution === undefined ? current.conflict_resolution : patch.conflict_resolution;
      if (current.conflict && !resolution) {
        throw new Conflict(
          'La valeur a changé dans les données de travail depuis la proposition : indiquez comment le conflit est résolu.',
        );
      }
    }
    const { message, ...changes } = patch;
    const note = message
      ? ({ body: message, kind: patch.status === 'info_requested' ? 'info_request' : 'message' } as const)
      : null;
    return found(await session.contributions.update(id, expectedVersion, changes, note), 'Proposition introuvable.');
  });
}
