import type {
  FieldReport,
  FieldReportList,
  FieldReportListQuery,
  FieldReportReceipt,
  FieldReportSubmit,
  FieldReportUpdate,
  FieldReportUploaded,
  SyncReports,
} from '@etare/contracts';
import {
  Conflict,
  FINAL_REPORT_STATUSES,
  InvalidInput,
  ServiceUnavailable,
  nextReportStatuses,
  type RequestContext,
} from '@etare/domain';
import { asDevice, type DeviceProof, type DistributionDependencies } from './distribution';
import type { SessionFactory } from './ports';
import { found, inTenant, requirePermission } from './use-cases';

/**
 * Field reports (OPS-04, ADR-017). An agent records a discrepancy offline on
 * the published version installed on the terminal; the terminal sends it once
 * the network is back, then its photos through the controlled upload chain.
 * The Prévision instructs it; a report never changes a publication: the
 * correction goes through a working revision and the normal validation.
 */

/** Receives a report (idempotent per terminal identifier) and issues the upload URLs of its photos. */
export async function submitFieldReport(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  input: FieldReportSubmit,
): Promise<FieldReportReceipt> {
  if (!deps.storage) throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  const storage = deps.storage;
  const { submitted, photos } = await asDevice(deps, context, proof, async (session) => {
    requirePermission(session.access, context, 'field_report:create');
    const submitted = await session.fieldReports.submit(proof.deviceId, session.access.tenantId ?? '', input);
    return { submitted, photos: await session.fieldReports.photos(proof.deviceId, submitted.reportId) };
  });
  // Signed URLs after the commit; a file already sent answers "exists" to the terminal, which then confirms.
  const uploads = await Promise.all(
    photos
      .filter((photo) => photo.scanStatus === 'pending' && photo.quarantineKey !== null)
      .map(async (photo) => {
        const { url, headers, expiresAt } = await storage.createUploadUrl(photo.quarantineKey ?? '', photo.mimeType);
        return {
          sha256: photo.sha256,
          upload: {
            asset_id: photo.assetId,
            method: 'PUT' as const,
            url,
            headers,
            expires_at: expiresAt.toISOString(),
          },
        };
      }),
  );
  return {
    report_id: submitted.reportId,
    client_report_id: input.client_report_id,
    content_hash: submitted.contentHash,
    received_at: submitted.receivedAt,
    created: submitted.created,
    uploads,
  };
}

/** The terminal has sent the photos of its report: their verification is planned (idempotent). */
export async function confirmFieldReportUploads(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  reportId: string,
): Promise<FieldReportUploaded> {
  const verifications = await asDevice(deps, context, proof, (session) =>
    session.fieldReports.uploaded(proof.deviceId, reportId),
  );
  return { report_id: reportId, verifications };
}

/** Outcome of the reports the agent sent from this terminal (feedback after synchronization). */
export async function listSyncReports(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
): Promise<SyncReports> {
  const items = await asDevice(deps, context, proof, (session) => session.fieldReports.forDevice(proof.deviceId));
  return { items };
}

// ------------------------------------------------------------------ instruction by the Prévision
export function listFieldReports(
  sessions: SessionFactory,
  context: RequestContext,
  query: FieldReportListQuery,
): Promise<FieldReportList> {
  return inTenant(sessions, context, 'field_report:review', async (session) => {
    const { items, nextCursor, openCount } = await session.fieldReports.list(query);
    return { items, next_cursor: nextCursor, open_count: openCount };
  });
}

export function getFieldReport(sessions: SessionFactory, context: RequestContext, id: string): Promise<FieldReport> {
  return inTenant(sessions, context, 'field_report:review', async (session) =>
    found(await session.fieldReports.get(id), 'Signalement introuvable.'),
  );
}

/**
 * Takes a report in charge, assigns it, links the draft revision that
 * integrates the correction, or decides it (resolved or rejected, motivated,
 * final). The database enforces the same rules.
 */
export function updateFieldReport(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: FieldReportUpdate,
): Promise<FieldReport> {
  return inTenant(sessions, context, 'field_report:review', async (session) => {
    const current = found(await session.fieldReports.get(id), 'Signalement introuvable.');
    if (FINAL_REPORT_STATUSES.has(current.status)) {
      throw new Conflict('Ce signalement a déjà été décidé : la décision est définitive.');
    }
    if (patch.status && patch.status !== current.status && !nextReportStatuses(current.status).includes(patch.status)) {
      throw new InvalidInput('Transition impossible pour ce signalement.', [
        { path: 'status', message: 'Transition impossible.' },
      ]);
    }
    return found(await session.fieldReports.update(id, expectedVersion, patch), 'Signalement introuvable.');
  });
}
