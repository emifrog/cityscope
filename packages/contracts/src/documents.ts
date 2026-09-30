import {
  DOCUMENT_CATEGORIES,
  MAX_UPLOAD_BYTES,
  OFFLINE_POLICIES,
  RECORD_STATUSES,
  SCAN_STATUSES,
  UPLOAD_MIME_TYPES,
  isSafeFilename,
} from '@etare/domain';
import { isoDateTimeSchema, sha256Schema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

const isoDate = z.iso.date();

/** A file the client is about to upload: the worker checks every declared value. */
export const fileDeclarationSchema = z
  .object({
    filename: z.string().refine(isSafeFilename, 'Nom de fichier invalide.'),
    mime_type: z.enum(UPLOAD_MIME_TYPES, { message: 'Type de fichier non autorisé (PDF, PNG, JPEG, WebP).' }),
    size_bytes: z
      .number()
      .int()
      .min(1, 'Fichier vide.')
      .max(MAX_UPLOAD_BYTES, `Fichier trop volumineux (maximum ${MAX_UPLOAD_BYTES / 1024 / 1024} Mo).`),
    sha256: sha256Schema,
  })
  .meta({ id: 'FileDeclaration' });
export type FileDeclaration = z.infer<typeof fileDeclarationSchema>;

export const assetSchema = z
  .object({
    id: uuidSchema,
    filename: z.string(),
    mime_type: z.string(),
    size_bytes: z.number().int(),
    sha256: z.string(),
    scan_status: z.enum(SCAN_STATUSES),
    /** Reason of a rejection (e.g. SHA256_MISMATCH, TYPE_MISMATCH), null otherwise. */
    rejection_reason: z.string().nullable(),
    created_at: isoDateTimeSchema,
  })
  .meta({ id: 'Asset' });
export type Asset = z.infer<typeof assetSchema>;

export const documentVersionSchema = z
  .object({
    id: uuidSchema,
    version_no: z.number().int().positive(),
    valid_from: isoDate.nullable(),
    expires_at: isoDate.nullable(),
    created_at: isoDateTimeSchema,
    asset: assetSchema,
  })
  .meta({ id: 'DocumentVersion' });
export type DocumentVersion = z.infer<typeof documentVersionSchema>;

export const documentSchema = z
  .object({
    id: uuidSchema,
    site_id: uuidSchema,
    category: z.enum(DOCUMENT_CATEGORIES),
    title: z.string(),
    offline_policy: z.enum(OFFLINE_POLICIES),
    status: z.enum(RECORD_STATUSES),
    row_version: z.number().int().positive(),
    /** Newest first. */
    versions: z.array(documentVersionSchema),
  })
  .meta({ id: 'Document' });
export type Document = z.infer<typeof documentSchema>;

const versionDates = {
  valid_from: isoDate.nullable().optional(),
  expires_at: isoDate.nullable().optional(),
};

export const documentCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    category: z.enum(DOCUMENT_CATEGORIES),
    offline_policy: z.enum(OFFLINE_POLICIES).default('never'),
    ...versionDates,
    file: fileDeclarationSchema,
  })
  .meta({ id: 'DocumentCreate' });
export type DocumentCreateInput = z.input<typeof documentCreateSchema>;
export type DocumentCreate = z.infer<typeof documentCreateSchema>;

export const documentVersionCreateSchema = z
  .object({ ...versionDates, file: fileDeclarationSchema })
  .meta({ id: 'DocumentVersionCreate' });
export type DocumentVersionCreate = z.infer<typeof documentVersionCreateSchema>;

export const documentUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    category: z.enum(DOCUMENT_CATEGORIES).optional(),
    offline_policy: z.enum(OFFLINE_POLICIES).optional(),
    status: z.enum(RECORD_STATUSES).optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Aucune modification à enregistrer.',
  })
  .meta({ id: 'DocumentUpdate' });
export type DocumentUpdate = z.infer<typeof documentUpdateSchema>;

/** Where and how to send the file: a short-lived signed URL to the quarantine area. */
export const uploadTicketSchema = z
  .object({
    asset_id: uuidSchema,
    method: z.literal('PUT'),
    url: z.url(),
    headers: z.record(z.string(), z.string()),
    expires_at: isoDateTimeSchema,
  })
  .meta({ id: 'UploadTicket' });
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

export const documentUploadResponseSchema = z
  .object({ document: documentSchema, upload: uploadTicketSchema })
  .meta({ id: 'DocumentUpload' });
export type DocumentUploadResponse = z.infer<typeof documentUploadResponseSchema>;

export const documentListResponseSchema = z.object({ items: z.array(documentSchema) }).meta({ id: 'DocumentList' });

export const uploadConfirmationSchema = z
  .object({ asset_id: uuidSchema, scan_status: z.enum(SCAN_STATUSES), job_id: uuidSchema.nullable() })
  .meta({ id: 'UploadConfirmation' });
export type UploadConfirmation = z.infer<typeof uploadConfirmationSchema>;

export const assetDownloadSchema = z
  .object({
    url: z.url(),
    expires_at: isoDateTimeSchema,
    filename: z.string(),
    mime_type: z.string(),
  })
  .meta({ id: 'AssetDownload' });
export type AssetDownload = z.infer<typeof assetDownloadSchema>;
