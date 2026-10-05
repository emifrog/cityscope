import { variantStorageKey } from '@etare/domain';
import { PermanentJobError } from './jobs';
import type { ObjectStoreAdmin } from './ports';

/**
 * Life cycle of the files (CAP-03, ADR-009): reduced images of the clean images,
 * and the planned maintenance that removes what no record keeps any more
 * (quarantine of rejected or abandoned uploads, PDF of losing build attempts).
 */
export const ASSET_VARIANTS_JOB = 'asset.thumbnail';
export const FILE_MAINTENANCE_JOB = 'maintenance.files';

export interface AssetForVariants {
  readonly storageKey: string;
  readonly mimeType: string;
  readonly scanStatus: 'pending' | 'clean' | 'rejected';
  readonly thumbnailKey: string | null;
}

/** Worker side: dedicated database functions, filtered by the SIS of the job. */
export interface AssetVariantStore {
  get(assetId: string, tenantId: string): Promise<AssetForVariants | null>;
  record(assetId: string, tenantId: string, thumbnailKey: string, previewKey: string): Promise<boolean>;
}

/** Reduces an image (orientation applied, metadata such as GPS removed). Throws ImageUnreadable. */
export interface ImageResizer {
  variants(content: Uint8Array): Promise<{ thumbnail: Uint8Array; preview: Uint8Array }>;
  /** JPEG small enough for a printed document (photo annex of the ETARE PDF, ADR-026). */
  documentImage(content: Uint8Array): Promise<Uint8Array>;
}

export class ImageUnreadable extends Error {
  constructor() {
    super('IMAGE_UNREADABLE');
    this.name = 'ImageUnreadable';
  }
}

export interface AssetVariantDependencies {
  readonly store: AssetVariantStore;
  readonly objects: ObjectStoreAdmin;
  readonly images: Pick<ImageResizer, 'variants'>;
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Computes the reduced images of a clean image. Idempotent: the keys derive from the
 * asset and the content from the original, so a retry overwrites with the same bytes.
 */
export async function createAssetVariants(
  deps: AssetVariantDependencies,
  assetId: string,
  tenantId: string | null,
): Promise<'created' | 'skipped'> {
  if (!tenantId) throw new PermanentJobError('TENANT_REQUIRED');
  const asset = await deps.store.get(assetId, tenantId);
  if (!asset || asset.scanStatus !== 'clean' || asset.thumbnailKey || !IMAGE_TYPES.has(asset.mimeType)) {
    return 'skipped';
  }
  const original = await deps.objects.download(asset.storageKey);
  if (!original) throw new Error('ASSET_UNAVAILABLE');
  let variants: { thumbnail: Uint8Array; preview: Uint8Array };
  try {
    variants = await deps.images.variants(original);
  } catch (error) {
    // A file that passed the checks but cannot be decoded keeps its original only.
    if (error instanceof ImageUnreadable) throw new PermanentJobError('IMAGE_UNREADABLE');
    throw error;
  }
  const thumbnailKey = variantStorageKey(asset.storageKey, 'thumbnail');
  const previewKey = variantStorageKey(asset.storageKey, 'preview');
  await deps.objects.upload(thumbnailKey, variants.thumbnail, 'image/webp', { upsert: true });
  await deps.objects.upload(previewKey, variants.preview, 'image/webp', { upsert: true });
  await deps.store.record(assetId, tenantId, thumbnailKey, previewKey);
  return 'created';
}

// ------------------------------------------------------------------ planned maintenance
export interface QuarantineToRelease {
  readonly assetId: string;
  readonly tenantId: string;
  readonly quarantineKey: string;
  readonly reason: 'REJECTED' | 'ABANDONED';
}

export interface PublicationOutputToPurge {
  readonly outputId: string;
  readonly tenantId: string;
  readonly storageKey: string;
}

/** Worker side: the database chooses the candidates and never returns a referenced file. */
export interface FileMaintenanceStore {
  /** Plans one maintenance job for the slot (deduplicated across workers). */
  schedule(slot: string): Promise<void>;
  quarantineToRelease(limit: number): Promise<QuarantineToRelease[]>;
  releaseQuarantine(item: QuarantineToRelease): Promise<boolean>;
  publicationOutputsToPurge(limit: number): Promise<PublicationOutputToPurge[]>;
  markPublicationOutputRemoved(outputId: string): Promise<boolean>;
  purgeRateLimits(): Promise<number>;
}

export interface FileMaintenanceReport {
  readonly quarantineReleased: number;
  readonly publicationOutputsRemoved: number;
  readonly rateLimitWindowsPurged: number;
  /** Items that could not be handled this time (storage error...): retried at the next run. */
  readonly failures: number;
}

/** One slot per hour: tenants/../maintenance runs at most hourly whatever the number of workers. */
export function maintenanceSlot(now: Date): string {
  return now.toISOString().slice(0, 13);
}

const BATCH = 200;

/**
 * Removes the objects that no record keeps any more, then records it (audited by the
 * database). The object goes first: a crash in between leaves a record still pointing
 * to a missing object, which the next run removes again harmlessly.
 */
export async function runFileMaintenance(
  store: FileMaintenanceStore,
  objects: ObjectStoreAdmin,
): Promise<FileMaintenanceReport> {
  // One item in error never stops the others: it stays a candidate for the next run.
  let failures = 0;
  const attempt = async (work: () => Promise<boolean>): Promise<number> => {
    try {
      return (await work()) ? 1 : 0;
    } catch {
      failures += 1;
      return 0;
    }
  };
  let quarantineReleased = 0;
  for (const item of await store.quarantineToRelease(BATCH)) {
    quarantineReleased += await attempt(async () => {
      await objects.remove(item.quarantineKey);
      return store.releaseQuarantine(item);
    });
  }
  let publicationOutputsRemoved = 0;
  for (const output of await store.publicationOutputsToPurge(BATCH)) {
    publicationOutputsRemoved += await attempt(async () => {
      await objects.remove(output.storageKey);
      return store.markPublicationOutputRemoved(output.outputId);
    });
  }
  const rateLimitWindowsPurged = await store.purgeRateLimits();
  return { quarantineReleased, publicationOutputsRemoved, rateLimitWindowsPurged, failures };
}
