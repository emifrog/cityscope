import type { UploadTicket } from '@etare/contracts';
import { ServiceUnavailable } from '@etare/domain';
import type { ObjectStorage, PendingUpload, SessionFactory } from './ports';

/**
 * Controlled upload chain shared by documents, plan backgrounds and object
 * photos: files never transit through the API, the client uploads to a
 * quarantine area with a signed URL and the worker verifies the file.
 */
export interface DocumentDependencies {
  readonly sessions: SessionFactory;
  /** Null when the storage gateway is not configured (no server-side storage key). */
  readonly storage: ObjectStorage | null;
}

export function requireStorage(deps: DocumentDependencies): ObjectStorage {
  if (!deps.storage) throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  return deps.storage;
}

/** The signed URL is requested after the commit: no network call inside the transaction. */
export async function uploadTicket(storage: ObjectStorage, upload: PendingUpload): Promise<UploadTicket> {
  const { url, headers, expiresAt } = await storage.createUploadUrl(upload.quarantineKey, upload.mimeType);
  return { asset_id: upload.assetId, method: 'PUT', url, headers, expires_at: expiresAt.toISOString() };
}
