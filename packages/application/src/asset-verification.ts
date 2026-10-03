import { detectMimeType } from '@etare/domain';
import type { AssetVerificationStore, MalwareScanner, ObjectStoreAdmin } from './ports';

export type VerificationOutcome =
  | { readonly status: 'clean' }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'already_verified' }
  | { readonly status: 'unknown_asset' };

export interface VerificationDependencies {
  readonly store: AssetVerificationStore;
  readonly objects: ObjectStoreAdmin;
  readonly scanner: MalwareScanner;
  readonly sha256: (content: Uint8Array) => Promise<string>;
}

/** Thrown when the quarantined object is not there yet: the job is retried later. */
export class UploadNotReceived extends Error {
  constructor() {
    super('UPLOAD_NOT_RECEIVED');
    this.name = 'UploadNotReceived';
  }
}

/**
 * Verifies a quarantined upload against what was declared: size, SHA-256,
 * real type (signature) and antivirus. A clean file is copied to its final
 * key; every rejected file is deleted from quarantine. Idempotent: an asset
 * already verified is left untouched (at-least-once job delivery).
 */
export async function verifyAsset(
  deps: VerificationDependencies,
  assetId: string,
  expectedTenantId: string | null = null,
): Promise<VerificationOutcome> {
  const asset = await deps.store.get(assetId);
  // A job can only act on an asset of its own tenant.
  if (!asset || (expectedTenantId !== null && asset.tenantId !== expectedTenantId)) return { status: 'unknown_asset' };
  if (asset.scanStatus !== 'pending' || !asset.quarantineKey) return { status: 'already_verified' };

  const content = await deps.objects.download(asset.quarantineKey);
  if (!content) {
    // A previous attempt may have promoted the checked file, then stopped before recording it.
    const promoted = await deps.objects.download(asset.storageKey);
    if (promoted && promoted.byteLength === asset.sizeBytes && (await deps.sha256(promoted)) === asset.sha256) {
      await deps.store.complete(assetId, 'clean', { recovered: true });
      return { status: 'clean' };
    }
    throw new UploadNotReceived();
  }

  const reject = async (reason: string, detail: Record<string, unknown> = {}): Promise<VerificationOutcome> => {
    await deps.objects.remove(asset.quarantineKey ?? '');
    await deps.store.complete(assetId, 'rejected', { reason, ...detail });
    return { status: 'rejected', reason };
  };

  if (content.byteLength !== asset.sizeBytes) return reject('SIZE_MISMATCH', { received_bytes: content.byteLength });
  if ((await deps.sha256(content)) !== asset.sha256) return reject('SHA256_MISMATCH');
  const detected = detectMimeType(content);
  if (detected !== asset.mimeType) return reject('TYPE_MISMATCH', { detected_type: detected });

  const scan = await deps.scanner.scan(content);
  if (scan.verdict === 'infected') return reject('MALWARE', { engine: scan.engine, signature: scan.signature ?? null });
  if (scan.verdict === 'unscannable')
    return reject('UNSCANNABLE', { engine: scan.engine, detail: scan.signature ?? null });

  try {
    await deps.objects.copy(asset.quarantineKey, asset.storageKey);
  } catch (error) {
    // Already promoted by an interrupted attempt: the same bytes are there, nothing to copy.
    const promoted = await deps.objects.download(asset.storageKey);
    if (!promoted || (await deps.sha256(promoted)) !== asset.sha256) throw error;
  }
  await deps.objects.remove(asset.quarantineKey);
  await deps.store.complete(assetId, 'clean', {
    detected_type: detected,
    antivirus: scan.verdict,
    engine: scan.engine,
  });
  return { status: 'clean' };
}

/** Placeholder until an antivirus engine is chosen: says so explicitly in the verification detail. */
export const antivirusNotConfigured: MalwareScanner = {
  scan: async () => ({ verdict: 'not_scanned', engine: 'none' }),
};
