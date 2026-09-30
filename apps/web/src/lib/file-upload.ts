import type { FileDeclaration, UploadTicket } from '@etare/contracts';
import { MAX_UPLOAD_BYTES, detectMimeType, isSafeFilename } from '@etare/domain';
import { ApiRequestError, api, type ApiCallOptions } from './api-client';

export type UploadStep = 'reading' | 'declaring' | 'sending' | 'confirming';

/** Accepted by the file picker; the real type is checked again from the content. */
export const UPLOAD_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,.pdf,.png,.jpg,.jpeg,.webp';

const refused = (message: string) => new ApiRequestError(400, 'VALIDATION_FAILED', message, null);

export async function sha256Hex(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', content);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Describes a chosen file exactly as the worker will check it: real type read
 * from its first bytes (not the browser's guess from the extension), size and
 * SHA-256. A refused file never leaves the browser.
 */
export async function describeFile(file: File): Promise<{ declaration: FileDeclaration; content: ArrayBuffer }> {
  if (file.size === 0) throw refused('Le fichier est vide.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw refused(`Fichier trop volumineux (maximum ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo).`);
  }
  if (!isSafeFilename(file.name)) throw refused('Nom de fichier invalide.');
  const content = await file.arrayBuffer();
  const mimeType = detectMimeType(new Uint8Array(content, 0, Math.min(16, content.byteLength)));
  if (!mimeType) throw refused('Type de fichier non autorisé : PDF, PNG, JPEG ou WebP uniquement.');
  return {
    declaration: {
      filename: file.name,
      mime_type: mimeType,
      size_bytes: content.byteLength,
      sha256: await sha256Hex(content),
    },
    content,
  };
}

/** Sends the file to its quarantine key through the signed URL (never through the product API). */
export async function sendToQuarantine(
  ticket: UploadTicket,
  content: ArrayBuffer,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(ticket.url, { method: ticket.method, headers: ticket.headers, body: content });
  } catch {
    throw new ApiRequestError(0, 'SERVICE_UNAVAILABLE', 'L’envoi du fichier a échoué. Vérifiez votre connexion.', null);
  }
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      'SERVICE_UNAVAILABLE',
      'Le stockage a refusé le fichier. Réessayez.',
      null,
    );
  }
}

/**
 * Full upload chain of a file (document version, plan background): describe,
 * declare (the API returns a signed URL), send to quarantine, then ask for
 * verification. The file is served only once the worker has declared it clean.
 */
export async function uploadFile<T extends { readonly upload: UploadTicket }>(
  options: ApiCallOptions,
  file: File,
  declare: (options: ApiCallOptions, file: FileDeclaration) => Promise<T>,
  onStep: (step: UploadStep) => void = () => undefined,
): Promise<T> {
  onStep('reading');
  const { declaration, content } = await describeFile(file);
  onStep('declaring');
  const created = await declare(options, declaration);
  onStep('sending');
  await sendToQuarantine(created.upload, content, options.fetchImpl);
  onStep('confirming');
  await api.confirmUpload(options, created.upload.asset_id);
  return created;
}
