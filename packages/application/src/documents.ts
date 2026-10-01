import type {
  AssetDownload,
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentUploadResponse,
  DocumentVersionCreate,
  UploadConfirmation,
} from '@etare/contracts';
import { Conflict, type RequestContext } from '@etare/domain';
import { requireStorage, uploadTicket, type DocumentDependencies } from './uploads';
import { found, inTenant } from './use-cases';

export type { DocumentDependencies } from './uploads';

/**
 * Documents and files (SITE-05). Files never transit through the API: the
 * client uploads to a quarantine area with a signed URL, the worker verifies
 * the file, and only verified files can be downloaded, through short-lived
 * URLs issued after an authorization check in PostgreSQL (and audited).
 */
export const ASSET_VERIFICATION_JOB = 'asset.verify';
const DOWNLOAD_URL_SECONDS = 60;

export function listDocuments(
  deps: DocumentDependencies,
  context: RequestContext,
  siteId: string,
): Promise<Document[]> {
  return inTenant(deps.sessions, context, 'site:read', async (session) => {
    found(await session.sites.get(siteId), 'Site introuvable.');
    return session.documents.listBySite(siteId);
  });
}

export async function createDocument(
  deps: DocumentDependencies,
  context: RequestContext,
  siteId: string,
  input: DocumentCreate,
): Promise<DocumentUploadResponse> {
  const storage = requireStorage(deps);
  const created = await inTenant(deps.sessions, context, 'site:write', async (session) =>
    found(await session.documents.create(siteId, input), 'Site introuvable.'),
  );
  return { document: created.document, upload: await uploadTicket(storage, created.upload) };
}

export async function addDocumentVersion(
  deps: DocumentDependencies,
  context: RequestContext,
  documentId: string,
  input: DocumentVersionCreate,
): Promise<DocumentUploadResponse> {
  const storage = requireStorage(deps);
  const created = await inTenant(deps.sessions, context, 'site:write', async (session) =>
    found(await session.documents.addVersion(documentId, input), 'Document introuvable.'),
  );
  return { document: created.document, upload: await uploadTicket(storage, created.upload) };
}

export function updateDocument(
  deps: DocumentDependencies,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: DocumentUpdate,
): Promise<Document> {
  return inTenant(deps.sessions, context, 'site:write', async (session) =>
    found(await session.documents.update(id, expectedVersion, patch), 'Document introuvable.'),
  );
}

/** The client finished its upload: plan the verification (idempotent on the asset). */
export function confirmUpload(
  deps: DocumentDependencies,
  context: RequestContext,
  assetId: string,
): Promise<UploadConfirmation> {
  return inTenant(deps.sessions, context, 'site:write', async (session) => {
    const asset = found(await session.assets.get(assetId), 'Fichier introuvable.');
    if (asset.scanStatus !== 'pending') return { asset_id: asset.id, scan_status: asset.scanStatus, job_id: null };
    const jobId = await session.jobs.enqueue(
      ASSET_VERIFICATION_JOB,
      { asset_id: asset.id },
      `${ASSET_VERIFICATION_JOB}:${asset.id}`,
    );
    return { asset_id: asset.id, scan_status: 'pending', job_id: jobId };
  });
}

export async function getAssetDownload(
  deps: DocumentDependencies,
  context: RequestContext,
  assetId: string,
): Promise<AssetDownload> {
  const storage = requireStorage(deps);
  const asset = await inTenant(deps.sessions, context, 'site:read', async (session) => {
    const visible = found(await session.assets.get(assetId), 'Fichier introuvable.');
    if (visible.scanStatus === 'pending') throw new Conflict('Ce fichier est en cours de contrôle.');
    if (visible.scanStatus === 'rejected') throw new Conflict('Ce fichier a été rejeté au contrôle.');
    await session.audit.record('asset.download', 'asset', visible.id, { filename: visible.filename });
    return visible;
  });
  const { url, expiresAt } = await storage.createDownloadUrl(asset.storageKey, DOWNLOAD_URL_SECONDS);
  return { url, expires_at: expiresAt.toISOString(), filename: asset.filename, mime_type: asset.mimeType };
}
