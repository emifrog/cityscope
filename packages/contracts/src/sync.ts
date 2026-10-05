import {
  APP_VERSION_PATTERN,
  CATALOG_VERSION,
  DEVICE_PLATFORMS,
  DEVICE_STATES,
  DEVICE_STATUSES,
  SIGNATURE_ALGORITHM,
  SYNC_RECEIPT_STATUSES,
  isEd25519PublicKey,
  isEd25519Signature,
  isSafePackagePath,
} from '@etare/domain';
import { isoDateTimeSchema, sha256Schema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';
import { namedRefSchema } from './sectors';

/** Headers of a request signed by an enrolled terminal (OFF-04, architecture §19). */
export const DEVICE_ID_HEADER = 'x-device-id';
export const DEVICE_TIME_HEADER = 'x-device-time';
export const DEVICE_SIGNATURE_HEADER = 'x-device-signature';
/** Version of the OPS application, reported to the administration (ADMIN-02). */
export const APP_VERSION_HEADER = 'x-app-version';

const appVersionSchema = z.string().regex(/^[0-9A-Za-z.+-]{1,32}$/, 'Version d’application invalide.');

// ------------------------------------------------------------------ terminals (administration)
export const deviceSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    status: z.enum(DEVICE_STATUSES),
    state: z.enum(DEVICE_STATES),
    platform: z.enum(DEVICE_PLATFORMS).nullable(),
    /** End of validity of the pending enrollment code (null once enrolled). */
    enrollment_expires_at: isoDateTimeSchema.nullable(),
    enrolled_at: isoDateTimeSchema.nullable(),
    enrolled_by_name: z.string().nullable(),
    revoked_at: isoDateTimeSchema.nullable(),
    revocation_reason: z.string().nullable(),
    app_version: z.string().nullable(),
    last_user_name: z.string().nullable(),
    last_seen_at: isoDateTimeSchema.nullable(),
    /** Last installation receipt. */
    last_sync_at: isoDateTimeSchema.nullable(),
    last_sync_status: z.enum(SYNC_RECEIPT_STATUSES).nullable(),
    last_error_code: z.string().nullable(),
    /** Catalogue generation announced to the terminal, and the one it installed completely. */
    catalog_generation: z.number().int().nullable(),
    installed_generation: z.number().int().nullable(),
    installed_sites: z.number().int().nonnegative(),
    /** Synchronisation profile (PER-01, screen 11): the whole SIS, explicitly, or sectors. */
    perimeter: z
      .object({ scope: z.enum(['tenant', 'sectors']), sectors: z.array(namedRefSchema) })
      .meta({ id: 'DevicePerimeterState' }),
    created_at: isoDateTimeSchema,
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'Device' });
export type Device = z.infer<typeof deviceSchema>;

export const deviceListSchema = z
  .object({
    items: z.array(deviceSchema),
    /** Current catalogue generation of the SIS: a terminal below it has updates waiting. */
    current_generation: z.number().int().nonnegative(),
    /** Published versions that cannot be distributed (not signed, or sensitive site). */
    undistributed_publications: z.number().int().nonnegative(),
    /** Minimum OPS application version required by the server (SYN-02); older terminals must be updated. */
    min_app_version: z.string().nullable(),
  })
  .meta({ id: 'DeviceList' });
export type DeviceList = z.infer<typeof deviceListSchema>;

export const deviceCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom du terminal obligatoire.').max(100),
    /** Sectors of the terminal; none (or absent): the whole SIS. */
    sector_ids: z.array(uuidSchema).max(50).optional(),
  })
  .meta({ id: 'DeviceCreate' });
export type DeviceCreate = z.infer<typeof deviceCreateSchema>;

export const deviceEnrollmentCodeSchema = z
  .object({
    device: deviceSchema,
    /** Shown once: only its SHA-256 is stored. */
    enrollment_code: z.string(),
    expires_at: isoDateTimeSchema,
  })
  .meta({ id: 'DeviceEnrollmentCode' });
export type DeviceEnrollmentCode = z.infer<typeof deviceEnrollmentCodeSchema>;

export const deviceRevokeSchema = z
  .object({ reason: z.string().trim().min(3, 'Motif obligatoire.').max(500) })
  .meta({ id: 'DeviceRevoke' });
export type DeviceRevoke = z.infer<typeof deviceRevokeSchema>;

// ------------------------------------------------------------------ enrollment (terminal)
export const deviceEnrollSchema = z
  .object({
    code: z.string().min(1).max(40),
    /** Raw Ed25519 public key (32 bytes, base64) generated on the terminal. */
    public_key: z.string().refine(isEd25519PublicKey, 'Clé publique Ed25519 attendue.'),
    platform: z.enum(DEVICE_PLATFORMS),
    app_version: appVersionSchema,
    /** Signature of the enrollment text by the private key (proof of possession). */
    proof: z.string().refine(isEd25519Signature, 'Signature Ed25519 attendue.'),
  })
  .meta({ id: 'DeviceEnroll' });
export type DeviceEnroll = z.infer<typeof deviceEnrollSchema>;

export const deviceEnrollmentSchema = z
  .object({ device_id: uuidSchema, device_name: z.string(), tenant_id: uuidSchema, tenant_name: z.string() })
  .meta({ id: 'DeviceEnrollment' });
export type DeviceEnrollment = z.infer<typeof deviceEnrollmentSchema>;

// ------------------------------------------------------------------ signed content
export const signatureSchema = z
  .object({
    algorithm: z.literal(SIGNATURE_ALGORITHM),
    key_id: z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/),
    signature: z.string().refine(isEd25519Signature, 'Signature Ed25519 attendue.'),
  })
  .meta({ id: 'Signature', description: 'Signature détachée : algorithme, clé et valeur (base64).' });
export type Signature = z.infer<typeof signatureSchema>;

/** One file of a publication package (architecture §10). */
export const manifestFileSchema = z
  .object({
    path: z.string().refine(isSafePackagePath, 'Chemin relatif sans traversée attendu.'),
    sha256: sha256Schema,
    size_bytes: z.number().int().nonnegative(),
    media_type: z.string().max(100),
    required: z.boolean(),
  })
  .meta({ id: 'ManifestFile' });

/** Manifest of a publication, signed by the worker when it is built. */
export const publicationManifestSchema = z
  .object({
    manifest_version: z.literal(1),
    tenant_id: uuidSchema,
    publication_id: uuidSchema,
    site_id: uuidSchema,
    publication_number: z.number().int().positive(),
    revision_id: uuidSchema,
    content_hash: sha256Schema,
    created_at: isoDateTimeSchema,
    schema_version: z.number().int().positive(),
    min_reader_version: z.string().regex(/^\d+\.\d+\.\d+$/),
    data_file: z.string().refine(isSafePackagePath),
    files: z.array(manifestFileSchema).max(5000),
  })
  .meta({ id: 'PublicationManifest' });
export type PublicationManifest = z.infer<typeof publicationManifestSchema>;

export const catalogEntrySchema = z
  .object({
    site_id: uuidSchema,
    publication_id: uuidSchema,
    publication_number: z.number().int().positive(),
    manifest_hash: sha256Schema,
    published_at: isoDateTimeSchema,
    /** Total size of the files required offline. */
    size_bytes: z.number().int().nonnegative(),
    etare_number: z.string().nullable(),
    site_name: z.string(),
  })
  .meta({ id: 'CatalogEntry' });
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

/** A site the terminal holds that disappears from the catalogue, and why (MET-04). */
export const catalogWithdrawalSchema = z
  .object({
    site_id: uuidSchema,
    site_name: z.string(),
    /**
     * `withdrawn`: the version in force was withdrawn; `archived`: the site and its dossier were archived;
     * `perimeter`: out of the sectors of the terminal or of the perimeter of the person (PER-01).
     */
    kind: z.enum(['withdrawn', 'archived', 'perimeter']),
    at: isoDateTimeSchema,
    reason: z.string(),
  })
  .meta({ id: 'CatalogWithdrawal' });
export type CatalogWithdrawal = z.infer<typeof catalogWithdrawalSchema>;

/**
 * Distribution catalogue of a terminal: the complete list of the publications
 * it may hold (a site missing from it must be removed), at a monotonic
 * generation, with the local consultation right of the user (architecture §11, §19).
 */
export const syncCatalogSchema = z
  .object({
    catalog_version: z.literal(CATALOG_VERSION),
    tenant_id: uuidSchema,
    tenant_name: z.string(),
    device_id: uuidSchema,
    generation: z.number().int().nonnegative(),
    issued_at: isoDateTimeSchema,
    /** Local consultation right: the identity of the user as their token names it (sub), and its end. */
    authorization: z.object({ subject: z.string().min(1).max(255), expires_at: isoDateTimeSchema }),
    /**
     * Oldest application allowed to install from this catalogue (SYN-02): an older one keeps what
     * it has installed, readable, and asks for an update (architecture §10, §12). Null: no minimum.
     */
    min_app_version: z.string().regex(APP_VERSION_PATTERN).nullable(),
    publications: z.array(catalogEntrySchema),
    /** Sites held by the terminal whose version was withdrawn or which were archived (MET-04). */
    withdrawals: z.array(catalogWithdrawalSchema),
  })
  .meta({ id: 'SyncCatalog' });
export type SyncCatalog = z.infer<typeof syncCatalogSchema>;

export const signedCatalogSchema = z
  .object({
    /** Canonical JSON of a SyncCatalog: verify the signature on these exact bytes, then parse. */
    catalog: z.string(),
    signature: signatureSchema,
  })
  .meta({ id: 'SignedCatalog' });
export type SignedCatalog = z.infer<typeof signedCatalogSchema>;

export const syncPackageSchema = z
  .object({
    /** Canonical JSON of the PublicationManifest; its SHA-256 is the manifest_hash of the catalogue. */
    manifest: z.string(),
    signature: signatureSchema,
    /** Canonical JSON of the data file (data/site.json), checked against the manifest. */
    data: z.string(),
  })
  .meta({ id: 'SyncPackage' });
export type SyncPackage = z.infer<typeof syncPackageSchema>;

export const syncDownloadRequestSchema = z
  .object({
    sha256: z
      .array(sha256Schema)
      .min(1)
      .max(500)
      .refine((values) => new Set(values).size === values.length, 'Empreintes en double.'),
  })
  .meta({ id: 'SyncDownloadRequest' });
export type SyncDownloadRequest = z.infer<typeof syncDownloadRequestSchema>;

export const syncDownloadsSchema = z
  .object({
    /** Short-lived URLs of the files of the package, by hash; checked by the terminal before use. */
    files: z.array(z.object({ sha256: sha256Schema, url: z.url(), expires_at: isoDateTimeSchema })),
  })
  .meta({ id: 'SyncDownloads' });
export type SyncDownloads = z.infer<typeof syncDownloadsSchema>;

export const syncReceiptSchema = z
  .object({
    /** Catalogue generation the installation comes from. */
    generation: z.number().int().nonnegative(),
    status: z.enum(SYNC_RECEIPT_STATUSES),
    error_code: z
      .string()
      .regex(/^[A-Z0-9_]{1,64}$/)
      .nullable(),
    /** Publications active on the terminal after the installation. */
    installed: z.array(uuidSchema).max(20_000),
  })
  .meta({ id: 'SyncReceipt' });
export type SyncReceipt = z.infer<typeof syncReceiptSchema>;

export const syncReceiptResultSchema = z
  .object({ received_at: isoDateTimeSchema, installed_sites: z.number().int().nonnegative() })
  .meta({ id: 'SyncReceiptResult' });
export type SyncReceiptResult = z.infer<typeof syncReceiptResultSchema>;
