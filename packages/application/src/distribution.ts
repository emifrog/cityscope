import {
  syncCatalogSchema,
  type DeviceCreate,
  type DeviceEnroll,
  type DeviceEnrollment,
  type DeviceEnrollmentCode,
  type DeviceList,
  type DeviceRevoke,
  type Device,
  type SignedCatalog,
  type SyncCatalog,
  type SyncDownloadRequest,
  type SyncDownloads,
  type SyncPackage,
  type SyncReceipt,
  type SyncReceiptResult,
} from '@etare/contracts';
import {
  CATALOG_VERSION,
  DEVICE_PROOF_MAX_SKEW_MS,
  DeviceClockSkew,
  DeviceNotEnrolled,
  DeviceProofInvalid,
  DeviceRevoked,
  ENROLLMENT_CODE_LENGTH,
  ENROLLMENT_CODE_TTL_HOURS,
  InvalidInput,
  OFFLINE_AUTHORIZATION_DAYS,
  SIGNATURE_CONTEXTS,
  ServiceUnavailable,
  TenantRequired,
  canonicalJson,
  deviceRequestText,
  enrollmentCodeFromBytes,
  enrollmentText,
  formatEnrollmentCode,
  normalizeEnrollmentCode,
  type RequestContext,
} from '@etare/domain';
import type { ContentSigner, DeviceSignatureVerifier, ObjectStorage, RequestSession, SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

/** Download URLs of package files: the longest the storage gateway allows; the terminal renews them. */
export const SYNC_DOWNLOAD_URL_SECONDS = 5 * 60;

export interface DistributionDependencies {
  readonly sessions: SessionFactory;
  readonly storage: ObjectStorage | null;
  /** Catalogue key of the API; null when not configured (terminal endpoints answer 503). */
  readonly catalogSigner: ContentSigner | null;
  readonly verifier: DeviceSignatureVerifier;
  /** Minimum OPS application version announced to the terminals (SYN-02); null: none. */
  readonly minAppVersion?: string | null;
  /** SHA-256 (hex) of the UTF-8 bytes of a text. */
  readonly sha256: (text: string) => Promise<string>;
  /** Cryptographically secure random bytes. */
  readonly randomBytes: (length: number) => Uint8Array;
  readonly now: () => Date;
}

/** What a terminal sent to prove a request (headers), with what the server observed. */
export interface DeviceProof {
  readonly deviceId: string;
  /** Clock of the terminal, milliseconds since 1970. */
  readonly timestamp: number;
  readonly signature: string;
  readonly method: string;
  /** Path of the request with its query string, as received. */
  readonly path: string;
  readonly bodySha256: string;
  readonly appVersion: string | null;
}

// ------------------------------------------------------------------ administration (device:manage)
export async function listDevices(
  sessions: SessionFactory,
  context: RequestContext,
  minAppVersion: string | null = null,
): Promise<DeviceList> {
  return inTenant(sessions, context, 'device:manage', async (session) => {
    const { items, currentGeneration, undistributedPublications } = await session.devices.list();
    return {
      items,
      current_generation: currentGeneration,
      undistributed_publications: undistributedPublications,
      min_app_version: minAppVersion,
    };
  });
}

async function newEnrollmentCode(deps: DistributionDependencies) {
  const code = enrollmentCodeFromBytes(deps.randomBytes(ENROLLMENT_CODE_LENGTH));
  return {
    code,
    hash: await deps.sha256(code),
    expiresAt: new Date(deps.now().getTime() + ENROLLMENT_CODE_TTL_HOURS * 3_600_000),
  };
}

/** Declares a terminal; the code is returned once, only its hash is stored. */
export async function createDevice(
  deps: DistributionDependencies,
  context: RequestContext,
  input: DeviceCreate,
): Promise<DeviceEnrollmentCode> {
  const { code, hash, expiresAt } = await newEnrollmentCode(deps);
  const device = await inTenant(deps.sessions, context, 'device:manage', (session) =>
    session.devices.create(input.name, hash, expiresAt),
  );
  return { device, enrollment_code: formatEnrollmentCode(code), expires_at: expiresAt.toISOString() };
}

export async function renewDeviceEnrollment(
  deps: DistributionDependencies,
  context: RequestContext,
  id: string,
  expectedVersion: number,
): Promise<DeviceEnrollmentCode> {
  const { code, hash, expiresAt } = await newEnrollmentCode(deps);
  const device = await inTenant(deps.sessions, context, 'device:manage', (session) =>
    session.devices.renewCode(id, expectedVersion, hash, expiresAt),
  );
  return { device, enrollment_code: formatEnrollmentCode(code), expires_at: expiresAt.toISOString() };
}

export async function revokeDevice(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  input: DeviceRevoke,
): Promise<Device> {
  return inTenant(sessions, context, 'device:manage', (session) =>
    session.devices.revoke(id, expectedVersion, input.reason),
  );
}

// ------------------------------------------------------------------ terminal side (offline:download)
/**
 * Enrolls the terminal of the caller: the code must be valid in the active SIS
 * and the terminal must prove it holds the private key of the public key.
 */
export async function enrollDevice(
  deps: DistributionDependencies,
  context: RequestContext,
  input: DeviceEnroll,
): Promise<DeviceEnrollment> {
  const code = normalizeEnrollmentCode(input.code);
  if (!code) throw new InvalidInput('Code d’enrôlement invalide : 12 caractères attendus.');
  const tenantId = context.tenantId;
  if (!tenantId) throw new TenantRequired();
  const proven = deps.verifier.verify(
    input.public_key,
    enrollmentText({ tenantId, code, publicKey: input.public_key }),
    input.proof,
  );
  if (!proven) throw new DeviceProofInvalid();
  const codeHash = await deps.sha256(code);
  // The single-use code handed over by an administrator stands for the second factor of an enrolled account.
  return inTenant(deps.sessions, { ...context, purpose: 'enrollment' }, 'offline:download', (session) =>
    session.devices.enroll({
      codeHash,
      publicKey: input.public_key,
      platform: input.platform,
      appVersion: input.app_version,
    }),
  );
}

/**
 * Runs the work of a terminal request: offline:download, then the terminal
 * of the active SIS must have signed this very request with its key, at a
 * time close to the server clock, and must not be revoked.
 */
export async function asDevice<T>(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  work: (session: RequestSession, signer: ContentSigner) => Promise<T>,
): Promise<T> {
  const signer = deps.catalogSigner;
  if (!signer) throw new ServiceUnavailable('La distribution hors ligne n’est pas configurée sur ce serveur.');
  // The key of the terminal stands for the second factor of an enrolled account (database:
  // terminal scope); the session commits only once the signature below is verified.
  return inTenant(deps.sessions, { ...context, deviceId: proof.deviceId }, 'offline:download', async (session) => {
    const device = await session.devices.syncDevice(proof.deviceId);
    if (!device?.publicKey) throw new DeviceNotEnrolled();
    if (!deps.verifier.verify(device.publicKey, deviceRequestText(proof), proof.signature)) {
      throw new DeviceProofInvalid();
    }
    if (Math.abs(deps.now().getTime() - proof.timestamp) > DEVICE_PROOF_MAX_SKEW_MS) throw new DeviceClockSkew();
    if (device.status === 'revoked') throw new DeviceRevoked();
    if (device.status !== 'active') throw new DeviceNotEnrolled();
    session.confirmDeviceProof();
    return work(session, signer);
  });
}

/** The signed catalogue of the terminal, with the local consultation right of the user. */
export async function getSyncCatalog(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
): Promise<SignedCatalog> {
  return asDevice(deps, context, proof, async (session, signer) => {
    const { generation, tenantName, publications, withdrawals } = await session.devices.catalog(
      proof.deviceId,
      proof.appVersion,
    );
    const now = deps.now();
    const catalog: SyncCatalog = syncCatalogSchema.parse({
      catalog_version: CATALOG_VERSION,
      tenant_id: session.access.tenantId ?? '',
      tenant_name: tenantName,
      device_id: proof.deviceId,
      generation,
      issued_at: now.toISOString(),
      authorization: {
        // The terminal knows the user by the subject of their token, not by our internal id.
        subject: context.principal.subject,
        expires_at: new Date(now.getTime() + OFFLINE_AUTHORIZATION_DAYS * 86_400_000).toISOString(),
      },
      min_app_version: deps.minAppVersion ?? null,
      publications,
      withdrawals,
    } satisfies SyncCatalog);
    const text = canonicalJson(catalog);
    return { catalog: text, signature: signer.sign(SIGNATURE_CONTEXTS.catalog, text) };
  });
}

/** Signed manifest and data of a distributable publication, served exactly as built. */
export async function getSyncPackage(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  publicationId: string,
): Promise<SyncPackage> {
  const distributed = await asDevice(deps, context, proof, async (session) =>
    found(
      await session.devices.package(proof.deviceId, publicationId),
      'Version non distribuée : relancez la synchronisation.',
    ),
  );
  const manifest = canonicalJson(distributed.manifest);
  // Never serve a manifest that is not the one signed and hashed at build time.
  if ((await deps.sha256(manifest)) !== distributed.manifestHash) throw new Error('MANIFEST_HASH_MISMATCH');
  return { manifest, signature: distributed.signature, data: canonicalJson(distributed.payload) };
}

/** Short-lived URLs of the files the terminal is missing, after authorization and audit. */
export async function createSyncDownloads(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  publicationId: string,
  input: SyncDownloadRequest,
): Promise<SyncDownloads> {
  if (!deps.storage) throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  const storage = deps.storage;
  const files = await asDevice(deps, context, proof, async (session) => {
    found(await session.devices.package(proof.deviceId, publicationId), 'Version non distribuée.');
    const resolved = await session.devices.packageFiles(proof.deviceId, publicationId, input.sha256);
    await session.audit.record('publication.offline_download', 'publication', publicationId, {
      device_id: proof.deviceId,
      files: resolved.length,
    });
    return resolved;
  });
  return {
    files: await Promise.all(
      files.map(async (file) => {
        const { url, expiresAt } = await storage.createDownloadUrl(file.storageKey, SYNC_DOWNLOAD_URL_SECONDS);
        return { sha256: file.sha256, url, expires_at: expiresAt.toISOString() };
      }),
    ),
  };
}

export async function recordSyncReceipt(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  receipt: SyncReceipt,
): Promise<SyncReceiptResult> {
  const installed = await asDevice(deps, context, proof, (session) => session.devices.receipt(proof.deviceId, receipt));
  return { received_at: deps.now().toISOString(), installed_sites: installed };
}
