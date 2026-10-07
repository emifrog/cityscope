import {
  syncCatalogSchema,
  type DeviceCreate,
  type DevicePerimeterInput,
  type DeviceEnroll,
  type DeviceEnrollment,
  type DeviceEnrollmentCode,
  type DeviceKeyRotate,
  type DeviceKeyRotation,
  type DeviceList,
  type DeviceRevoke,
  type SyncAccessEvents,
  type SyncBasemap,
  type SyncBasemapReceipt,
  type SyncBasemapReceiptResult,
  type SyncAccessEventsResult,
  type Device,
  type SignedCatalog,
  type SignedKeyset,
  type Signature,
  type SyncCatalog,
  type SyncDownloadRequest,
  type SyncDownloads,
  type SyncPackage,
  type SyncReceipt,
  type SyncReceiptResult,
  type TerminalPolicySettings,
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
  NotFound,
  ON_DEMAND_ACCESS_HOURS,
  SIGNATURE_CONTEXTS,
  ServiceUnavailable,
  TenantRequired,
  canonicalJson,
  completeTerminalPolicy,
  deviceKeyRotationText,
  deviceRequestText,
  enrollmentCodeFromBytes,
  enrollmentText,
  formatEnrollmentCode,
  normalizeEnrollmentCode,
  preferredSignature,
  type RequestContext,
  type SigningKeyPurpose,
} from '@etare/domain';
import type {
  ContentSigner,
  DeviceSignatureVerifier,
  LoadedKeyset,
  ObjectStorage,
  RequestSession,
  SessionFactory,
} from './ports';
import { found, inTenant } from './use-cases';

/** Download URLs of package files: the longest the storage gateway allows; the terminal renews them. */
export const SYNC_DOWNLOAD_URL_SECONDS = 5 * 60;

export interface DistributionDependencies {
  readonly sessions: SessionFactory;
  readonly storage: ObjectStorage | null;
  /** Catalogue key of the API; null when not configured (terminal endpoints answer 503). */
  readonly catalogSigner: ContentSigner | null;
  /** Key set served to the terminals (SEC-04); null or absent: none (development). */
  readonly keyset?: (() => Promise<LoadedKeyset | null>) | null;
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
  keysetSequence: number | null = null,
): Promise<DeviceList> {
  return inTenant(sessions, context, 'device:manage', async (session) => {
    const { items, currentGeneration, undistributedPublications } = await session.devices.list();
    return {
      items,
      current_generation: currentGeneration,
      undistributed_publications: undistributedPublications,
      min_app_version: minAppVersion,
      keyset_sequence: keysetSequence,
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
  const device = await inTenant(deps.sessions, context, 'device:manage', async (session) => {
    const created = await session.devices.create(input.name, hash, expiresAt);
    // The whole SIS unless sectors are named (PER-01, screen 11).
    const sectors = input.sector_ids ?? [];
    return sectors.length > 0 ? session.devices.setPerimeter(created.id, created.row_version, sectors) : created;
  });
  return { device, enrollment_code: formatEnrollmentCode(code), expires_at: expiresAt.toISOString() };
}

/** Assigns a terminal to sectors, or to the whole SIS; it follows at its next contact (PER-01). */
export async function setDevicePerimeter(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  input: DevicePerimeterInput,
): Promise<Device> {
  return inTenant(sessions, context, 'device:manage', (session) =>
    session.devices.setPerimeter(id, expectedVersion, input.sector_ids),
  );
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
    input.key_algorithm,
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
      keyAlgorithm: input.key_algorithm,
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
  work: (session: RequestSession) => Promise<T>,
): Promise<T> {
  if (!deps.catalogSigner) {
    throw new ServiceUnavailable('La distribution hors ligne n’est pas configurée sur ce serveur.');
  }
  // The key of the terminal stands for the second factor of an enrolled account (database:
  // terminal scope); the session commits only once the signature below is verified.
  return inTenant(deps.sessions, { ...context, deviceId: proof.deviceId }, 'offline:download', async (session) => {
    const device = await session.devices.syncDevice(proof.deviceId);
    if (!device?.publicKey) throw new DeviceNotEnrolled();
    if (!deps.verifier.verify(device.keyAlgorithm, device.publicKey, deviceRequestText(proof), proof.signature)) {
      throw new DeviceProofInvalid();
    }
    if (Math.abs(deps.now().getTime() - proof.timestamp) > DEVICE_PROOF_MAX_SKEW_MS) throw new DeviceClockSkew();
    if (device.status === 'revoked') throw new DeviceRevoked();
    if (device.status !== 'active') throw new DeviceNotEnrolled();
    session.confirmDeviceProof();
    return work(session);
  });
}

/**
 * The terminal moves to a new key (SEC-05): the request is signed by its current
 * key, the new key signs the rotation text. From then on only the new key is accepted.
 */
export async function rotateDeviceKey(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  input: DeviceKeyRotate,
): Promise<DeviceKeyRotation> {
  const tenantId = context.tenantId;
  if (!tenantId) throw new TenantRequired();
  const rotationText = deviceKeyRotationText({
    tenantId,
    deviceId: proof.deviceId,
    algorithm: input.key_algorithm,
    publicKey: input.public_key,
  });
  if (!deps.verifier.verify(input.key_algorithm, input.public_key, rotationText, input.proof)) {
    throw new DeviceProofInvalid();
  }
  const rotatedAt = await asDevice(deps, context, proof, (session) =>
    session.devices.rotateKey(proof.deviceId, input.key_algorithm, input.public_key),
  );
  return { key_algorithm: input.key_algorithm, rotated_at: rotatedAt.toISOString() };
}

// ------------------------------------------------------------------ policy of the tablets (device:manage)
export async function getTerminalPolicy(
  sessions: SessionFactory,
  context: RequestContext,
): Promise<TerminalPolicySettings> {
  return inTenant(sessions, context, 'device:manage', async (session) =>
    completeTerminalPolicy(await session.devices.policy()),
  );
}

/** The tablets of the SIS follow it at their next catalogue (second factor required, audited). */
export async function updateTerminalPolicy(
  sessions: SessionFactory,
  context: RequestContext,
  input: TerminalPolicySettings,
): Promise<TerminalPolicySettings> {
  return inTenant(sessions, context, 'device:manage', (session) => session.devices.updatePolicy(input));
}

async function configuredKeyset(deps: DistributionDependencies): Promise<LoadedKeyset | null> {
  return deps.keyset ? deps.keyset() : null;
}

/**
 * The signature to serve: the most recent by a key the terminals trust (SEC-04).
 * None (a revoked key, the worker not having re-signed yet): 503, the terminal
 * keeps what it holds and asks again at its next contact.
 */
async function servedSignature(
  deps: DistributionDependencies,
  signatures: readonly Signature[],
  purpose: SigningKeyPurpose,
): Promise<Signature> {
  const loaded = await configuredKeyset(deps);
  const chosen = preferredSignature(signatures, loaded?.keyset ?? null, purpose);
  if (!chosen) throw new ServiceUnavailable('Signature en cours de renouvellement : réessayez plus tard.');
  return chosen;
}

/** Key set of the platform, signed by the root key, read by the terminal before its catalogue. */
export async function getSyncKeyset(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
): Promise<SignedKeyset> {
  await asDevice(deps, context, proof, async () => undefined);
  const loaded = await configuredKeyset(deps);
  if (!loaded) throw new NotFound('Aucun jeu de clés n’est configuré sur ce serveur.');
  return loaded.signed;
}

/** The signed catalogue of the terminal, with the local consultation right of the user. */
export async function getSyncCatalog(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
): Promise<SignedCatalog> {
  const signer = deps.catalogSigner;
  const catalog = await asDevice(deps, context, proof, async (session) => {
    const { generation, tenantName, publications, onDemand, withdrawals } = await session.devices.catalog(
      proof.deviceId,
      proof.appVersion,
    );
    const basemaps = await session.devices.basemaps(proof.deviceId);
    const policy = completeTerminalPolicy(await session.devices.terminalPolicy(proof.deviceId));
    const now = deps.now();
    return syncCatalogSchema.parse({
      catalog_version: CATALOG_VERSION,
      tenant_id: session.access.tenantId ?? '',
      tenant_name: tenantName,
      device_id: proof.deviceId,
      generation,
      issued_at: now.toISOString(),
      authorization: {
        // The terminal knows the user by the subject of their token, not by our internal id.
        subject: context.principal.subject,
        expires_at: new Date(now.getTime() + policy.offline_authorization_days * 86_400_000).toISOString(),
      },
      terminal_policy: policy,
      min_app_version: deps.minAppVersion ?? null,
      publications,
      on_demand: onDemand,
      withdrawals,
      basemaps,
    } satisfies SyncCatalog);
  });
  // Signed once the transaction is over: a Transit engine is called outside of it.
  const text = canonicalJson(catalog);
  if (!signer) throw new ServiceUnavailable('La distribution hors ligne n’est pas configurée sur ce serveur.');
  return { catalog: text, signature: await signer.sign(SIGNATURE_CONTEXTS.catalog, text) };
}

/** Signed manifest and data of a distributable publication, served exactly as built. */
export async function getSyncPackage(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  publicationId: string,
): Promise<SyncPackage> {
  const now = deps.now();
  const { distributed, sensitivity } = await asDevice(deps, context, proof, async (session) => {
    const served = found(
      await session.devices.package(proof.deviceId, publicationId),
      'Version non distribuée : relancez la synchronisation.',
    );
    // A sensitive site opened on demand: journaled, consultable 24 hours on the tablet (PER-02).
    const level = await session.accessJournal.record(served.siteId, publicationId, 'download_offline', {
      deviceId: proof.deviceId,
    });
    return { distributed: served, sensitivity: level };
  });
  const manifest = canonicalJson(distributed.manifest);
  // Never serve a manifest that is not the one signed and hashed at build time.
  if ((await deps.sha256(manifest)) !== distributed.manifestHash) throw new Error('MANIFEST_HASH_MISMATCH');
  return {
    manifest,
    signature: await servedSignature(deps, distributed.signatures, 'publication'),
    data: canonicalJson(distributed.payload),
    access_expires_at:
      sensitivity === 'restricted' ? new Date(now.getTime() + ON_DEMAND_ACCESS_HOURS * 3_600_000).toISOString() : null,
  };
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

/** Offline consultations of sensitive sites, sent at the next contact: journaled once each (PER-02). */
export async function submitAccessEvents(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  input: SyncAccessEvents,
): Promise<SyncAccessEventsResult> {
  return asDevice(deps, context, proof, async (session) => {
    for (const event of input.events) {
      await session.accessJournal.record(event.site_id, event.publication_id, event.action, {
        deviceId: proof.deviceId,
        clientEventId: event.client_event_id,
        occurredAt: new Date(event.occurred_at),
      });
    }
    return { received: input.events.length };
  });
}

/** Signed manifest of a base map in force for the terminal (ADR-024), served exactly as built. */
export async function getSyncBasemap(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  packId: string,
): Promise<SyncBasemap> {
  const basemap = await asDevice(deps, context, proof, async (session) =>
    found(
      await session.devices.basemap(proof.deviceId, packId),
      'Fond de carte non distribué : relancez la synchronisation.',
    ),
  );
  const manifest = canonicalJson(basemap.manifest);
  if ((await deps.sha256(manifest)) !== basemap.manifestHash) throw new Error('MANIFEST_HASH_MISMATCH');
  return { manifest, signature: await servedSignature(deps, basemap.signatures, 'publication') };
}

/** Short-lived URLs of the parts of a base map the terminal is missing. Public data: not audited. */
export async function createSyncBasemapDownloads(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  packId: string,
  input: SyncDownloadRequest,
): Promise<SyncDownloads> {
  if (!deps.storage) throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  const storage = deps.storage;
  const files = await asDevice(deps, context, proof, async (session) => {
    found(await session.devices.basemap(proof.deviceId, packId), 'Fond de carte non distribué.');
    return session.devices.basemapFiles(proof.deviceId, packId, input.sha256);
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

export async function recordSyncBasemapReceipt(
  deps: DistributionDependencies,
  context: RequestContext,
  proof: DeviceProof,
  receipt: SyncBasemapReceipt,
): Promise<SyncBasemapReceiptResult> {
  const installed = await asDevice(deps, context, proof, (session) =>
    session.devices.basemapReceipt(proof.deviceId, receipt.installed),
  );
  return { received_at: deps.now().toISOString(), installed };
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
