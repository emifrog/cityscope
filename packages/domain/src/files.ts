/**
 * File rules (SITE-05, PORTAL-03): allowed types, size limit, and detection of
 * the REAL type from the first bytes. The declared type is never trusted.
 */
export const UPLOAD_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export type UploadMimeType = (typeof UPLOAD_MIME_TYPES)[number];

/** Same limit as the storage bucket (supabase/migrations/…_storage_supabase.sql). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const DOCUMENT_CATEGORIES = ['fds', 'notice', 'instruction', 'plan', 'photo', 'other'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** 'always': part of every offline package; 'on_demand': downloadable by the terminal; 'never'. */
export const OFFLINE_POLICIES = ['never', 'on_demand', 'always'] as const;
export type OfflinePolicy = (typeof OFFLINE_POLICIES)[number];

export const SCAN_STATUSES = ['pending', 'clean', 'rejected'] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));

/** Detects the real type of a file from its signature ("magic bytes"); null if not an allowed type. */
export function detectMimeType(bytes: Uint8Array): UploadMimeType | null {
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/** A file name is metadata only: no path, no control character, bounded length. */
export function isSafeFilename(name: string): boolean {
  const forbidden = (character: string) => {
    const code = character.charCodeAt(0);
    return character === '/' || character === '\\' || code < 0x20 || code === 0x7f;
  };
  return name.length > 0 && name.length <= 255 && name !== '.' && name !== '..' && ![...name].some(forbidden);
}
