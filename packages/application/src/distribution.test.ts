import { syncCatalogSchema, type CatalogEntry, type Signature } from '@etare/contracts';
import {
  DeviceClockSkew,
  DeviceNotEnrolled,
  DeviceProofInvalid,
  DeviceRevoked,
  EMPTY_BODY_SHA256,
  InvalidInput,
  NotFound,
  ServiceUnavailable,
  DEFAULT_TERMINAL_POLICY,
  canonicalJson,
  deviceKeyRotationText,
  deviceRequestText,
  enrollmentText,
  permissionsForRoles,
  signedText,
  type DeviceStatus,
  type Keyset,
  type RequestContext,
  type Role,
  type SignatureContext,
} from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  createDevice,
  createSyncBasemapDownloads,
  createSyncDownloads,
  enrollDevice,
  getSyncBasemap,
  recordSyncBasemapReceipt,
  getSyncCatalog,
  getSyncKeyset,
  getSyncPackage,
  getTerminalPolicy,
  rotateDeviceKey,
  submitAccessEvents,
  updateTerminalPolicy,
  type DeviceProof,
  type DistributionDependencies,
} from './distribution';
import type { AccessJournal, ContentSigner, DeviceRepository, RequestSession, SessionFactory } from './ports';
import { stubSession } from './testing';

const TENANT = '06000000-0000-4000-8000-000000000000';
const DEVICE = '06000010-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-b000-000000000004';
const NOW = new Date('2026-10-01T10:00:00.000Z');

const context: RequestContext = {
  principal: { provider: 'supabase', subject: 'ops', email: null, assurance: 'aal1' },
  tenantId: TENANT,
  traceId: 'trace',
  origin: 'mobile',
};

/** Deterministic stand-in for SHA-256 (64 hex characters): the runtime provides the real one. */
const fakeHash = (text: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0').repeat(8);
};
const sha256 = async (text: string) => fakeHash(text);

/**
 * Stand-in for Ed25519 (the adapters and the API test the real one): a
 * "signature" binds a key and a text, and only that key verifies it.
 */
const fakeSign = (key: string, text: string) => fakeHash(`${key}|${text}`);
const verifier = {
  verify: (_algorithm: string, publicKey: string, text: string, signature: string) =>
    fakeSign(publicKey, text) === signature,
};

let keys = 0;
/** A terminal: its key and how it signs its requests. */
function terminal() {
  keys += 1;
  const publicKey = `terminal-key-${keys}`;
  const signText = (text: string) => fakeSign(publicKey, text);
  const proof = (overrides: Partial<DeviceProof> = {}): DeviceProof => {
    const base = {
      deviceId: DEVICE,
      timestamp: NOW.getTime(),
      method: 'GET',
      path: '/api/v1/sync/catalog',
      bodySha256: EMPTY_BODY_SHA256,
      appVersion: '1.0.0',
      ...overrides,
    };
    return { ...base, signature: overrides.signature ?? signText(deviceRequestText(base)) };
  };
  return { publicKey, signText, proof };
}

const CATALOG_KEY = 'catalog-key';
const catalogSigner: ContentSigner = {
  sign: async (signatureContext: SignatureContext, content: string): Promise<Signature> => ({
    algorithm: 'Ed25519',
    key_id: 'catalog-test',
    signature: fakeSign(CATALOG_KEY, signedText(signatureContext, content)),
  }),
};

const entry: CatalogEntry = {
  site_id: '06000002-0000-4000-8000-000000000001',
  publication_id: '0600000f-0000-4000-8000-000000000002',
  publication_number: 2,
  manifest_hash: 'a'.repeat(64),
  published_at: '2026-09-30T12:00:00.000Z',
  size_bytes: 1024,
  etare_number: '06-0428',
  site_name: 'EHPAD Les Oliviers',
};

const builtSignature: Signature = { algorithm: 'Ed25519', key_id: 'publication', signature: 'signed' };

const keysetKey = (purpose: 'publication' | 'catalog', id: string, status: 'active' | 'retired' | 'revoked') => ({
  purpose,
  key_id: id,
  public_key: `${id.padEnd(43, 'A').slice(0, 43)}=`,
  status,
});
const keyset: Keyset = {
  keyset_version: 1,
  sequence: 2,
  issued_at: '2026-10-06T08:00:00.000Z',
  keys: [
    keysetKey('publication', 'pub-new', 'active'),
    keysetKey('publication', 'pub-old', 'retired'),
    keysetKey('publication', 'pub-lost', 'revoked'),
    keysetKey('catalog', 'cat', 'active'),
  ],
};

const basemapEntry = {
  pack_id: '0600000b-0000-4000-8000-000000000001',
  sector_id: '06000005-0000-4000-8000-000000000001',
  sector_name: 'CIS Nice Centre',
  version: 2,
  manifest_hash: 'c'.repeat(64),
  total_bytes: 4_096,
  built_at: '2026-10-05T08:00:00.000Z',
  renew_after: '2027-04-05T08:00:00.000Z',
};

function setup(device: { status: DeviceStatus; publicKey: string | null } | null, roles: Role[] = ['OPS_USER']) {
  const devices = {
    syncDevice: vi.fn<DeviceRepository['syncDevice']>(async () => device && { keyAlgorithm: 'ed25519', ...device }),
    catalog: vi.fn<DeviceRepository['catalog']>(async () => ({
      generation: 7,
      tenantName: 'SDIS DEMO 06',
      publications: [entry],
      onDemand: [],
      withdrawals: [],
    })),
    enroll: vi.fn<DeviceRepository['enroll']>(async () => ({
      device_id: DEVICE,
      device_name: 'FPT01',
      tenant_id: TENANT,
      tenant_name: 'SDIS',
    })),
    create: vi.fn<DeviceRepository['create']>(),
    package: vi.fn<DeviceRepository['package']>(async () => null),
    packageFiles: vi.fn<DeviceRepository['packageFiles']>(async () => []),
    basemaps: vi.fn<DeviceRepository['basemaps']>(async () => [basemapEntry]),
    basemap: vi.fn<DeviceRepository['basemap']>(async () => null),
    basemapFiles: vi.fn<DeviceRepository['basemapFiles']>(async () => []),
    basemapReceipt: vi.fn<DeviceRepository['basemapReceipt']>(async (_device, packs) => packs.length),
    rotateKey: vi.fn<DeviceRepository['rotateKey']>(async () => NOW),
    terminalPolicy: vi.fn<DeviceRepository['terminalPolicy']>(async () => null),
    policy: vi.fn<DeviceRepository['policy']>(async () => null),
    updatePolicy: vi.fn<DeviceRepository['updatePolicy']>(async (policy) => policy),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const accessJournal = {
    record: vi.fn<AccessJournal['record']>(async () => 'normal'),
    list: vi.fn(),
    exportAllowed: vi.fn(async () => true),
  };
  const contexts: RequestContext[] = [];
  const proven: (string | undefined)[] = [];
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) => {
      contexts.push(ctx);
      const session = stubSession(
        { userId: USER, tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) },
        { devices, audit, accessJournal },
      );
      return work({ ...session, confirmDeviceProof: () => proven.push(ctx.deviceId) });
    },
  };
  const deps: DistributionDependencies = {
    sessions,
    storage: null,
    catalogSigner,
    verifier,
    sha256,
    randomBytes: (length) => new Uint8Array(length).fill(1),
    now: () => NOW,
  };
  return { deps, devices, audit, accessJournal, contexts, proven };
}

describe('terminal requests', () => {
  const device = terminal();

  it('returns a catalogue signed with the catalogue key, with a 7-day local authorization', async () => {
    const { deps, devices } = setup({ status: 'active', publicKey: device.publicKey });
    const signed = await getSyncCatalog(deps, context, device.proof());
    const text = signedText('etare.catalog.v1', signed.catalog);
    expect(verifier.verify('ed25519', CATALOG_KEY, text, signed.signature.signature)).toBe(true);
    const catalog = syncCatalogSchema.parse(JSON.parse(signed.catalog));
    expect(signed.catalog).toBe(canonicalJson(catalog));
    expect(catalog).toMatchObject({
      tenant_id: TENANT,
      device_id: DEVICE,
      generation: 7,
      authorization: { subject: 'ops', expires_at: '2026-10-08T10:00:00.000Z' },
      terminal_policy: DEFAULT_TERMINAL_POLICY,
      min_app_version: null,
      publications: [entry],
    });
    expect(devices.catalog).toHaveBeenCalledWith(DEVICE, '1.0.0');
  });

  it('carries the policy of the SIS, whose consultation right sets the end of the authorization (SEC-05)', async () => {
    const { deps, devices } = setup({ status: 'active', publicKey: device.publicKey });
    devices.terminalPolicy.mockResolvedValue({ idle_lock_minutes: 2, offline_authorization_days: 3 });
    const catalog = syncCatalogSchema.parse(JSON.parse((await getSyncCatalog(deps, context, device.proof())).catalog));
    expect(catalog.terminal_policy).toEqual({
      ...DEFAULT_TERMINAL_POLICY,
      idle_lock_minutes: 2,
      offline_authorization_days: 3,
    });
    expect(catalog.authorization.expires_at).toBe('2026-10-04T10:00:00.000Z');
    expect(devices.terminalPolicy).toHaveBeenCalledWith(DEVICE);
  });

  it('moves the terminal to a new key it proves to hold, the request signed by the current key (SEC-05)', async () => {
    const { deps, devices } = setup({ status: 'active', publicKey: device.publicKey });
    const next = terminal();
    const rotationProof = (publicKey: string) =>
      next.signText(deviceKeyRotationText({ tenantId: TENANT, deviceId: DEVICE, algorithm: 'ecdsa-p256', publicKey }));
    const input = {
      key_algorithm: 'ecdsa-p256' as const,
      public_key: next.publicKey,
      proof: rotationProof(next.publicKey),
    };
    const signedByCurrent = device.proof({ method: 'POST', path: '/api/v1/sync/device-key' });
    expect(await rotateDeviceKey(deps, context, signedByCurrent, input)).toEqual({
      key_algorithm: 'ecdsa-p256',
      rotated_at: NOW.toISOString(),
    });
    expect(devices.rotateKey).toHaveBeenCalledWith(DEVICE, 'ecdsa-p256', next.publicKey);
    // The new key must have signed this very rotation; the request, the current key.
    await expect(
      rotateDeviceKey(deps, context, signedByCurrent, { ...input, proof: next.signText('autre chose') }),
    ).rejects.toThrow(DeviceProofInvalid);
    await expect(
      rotateDeviceKey(deps, context, next.proof({ method: 'POST', path: '/api/v1/sync/device-key' }), input),
    ).rejects.toThrow(DeviceProofInvalid);
    expect(devices.rotateKey).toHaveBeenCalledTimes(1);
  });

  it('announces the minimum application version inside the signed catalogue (SYN-02)', async () => {
    const { deps } = setup({ status: 'active', publicKey: device.publicKey });
    const signed = await getSyncCatalog({ ...deps, minAppVersion: '0.2.0' }, context, device.proof());
    expect(
      verifier.verify(
        'ed25519',
        CATALOG_KEY,
        signedText('etare.catalog.v1', signed.catalog),
        signed.signature.signature,
      ),
    ).toBe(true);
    expect(syncCatalogSchema.parse(JSON.parse(signed.catalog)).min_app_version).toBe('0.2.0');
  });

  it('names the terminal to the session and confirms its signature before any work (second factor)', async () => {
    const { deps, contexts, proven } = setup({ status: 'active', publicKey: device.publicKey });
    await getSyncCatalog(deps, context, device.proof());
    expect(contexts[0]?.deviceId).toBe(DEVICE);
    expect(proven).toEqual([DEVICE]);

    const forged = setup({ status: 'active', publicKey: device.publicKey });
    await expect(getSyncCatalog(forged.deps, context, terminal().proof())).rejects.toThrow(DeviceProofInvalid);
    expect(forged.proven).toEqual([]);
  });

  it('enrolls with the enrollment purpose: the single-use code stands for the second factor', async () => {
    const { deps, contexts } = setup(null);
    const key = terminal();
    await enrollDevice(deps, context, {
      code: 'ABCD-EFGH-JKLM',
      key_algorithm: 'ed25519',
      public_key: key.publicKey,
      platform: 'android',
      app_version: '1.0.0',
      proof: key.signText(enrollmentText({ tenantId: TENANT, code: 'ABCDEFGHJKLM', publicKey: key.publicKey })),
    });
    expect(contexts[0]?.purpose).toBe('enrollment');
  });

  it('refuses a request not signed by the terminal key, or signed for another path', async () => {
    const { deps } = setup({ status: 'active', publicKey: device.publicKey });
    await expect(getSyncCatalog(deps, context, terminal().proof())).rejects.toThrow(DeviceProofInvalid);
    const signedForCatalog = device.proof();
    await expect(getSyncCatalog(deps, context, { ...signedForCatalog, path: '/api/v1/sync/receipts' })).rejects.toThrow(
      DeviceProofInvalid,
    );
  });

  it('refuses a clock too far from the server, then a revoked or unknown terminal', async () => {
    const active = setup({ status: 'active', publicKey: device.publicKey }).deps;
    await expect(
      getSyncCatalog(active, context, device.proof({ timestamp: NOW.getTime() - 6 * 60_000 })),
    ).rejects.toThrow(DeviceClockSkew);
    await expect(
      getSyncCatalog(setup({ status: 'revoked', publicKey: device.publicKey }).deps, context, device.proof()),
    ).rejects.toThrow(DeviceRevoked);
    await expect(getSyncCatalog(setup(null).deps, context, device.proof())).rejects.toThrow(DeviceNotEnrolled);
    await expect(
      getSyncCatalog(setup({ status: 'pending', publicKey: null }).deps, context, device.proof()),
    ).rejects.toThrow(DeviceNotEnrolled);
  });

  it('needs the catalogue key and the offline download permission', async () => {
    const { deps } = setup({ status: 'active', publicKey: device.publicKey });
    await expect(getSyncCatalog({ ...deps, catalogSigner: null }, context, device.proof())).rejects.toThrow(
      ServiceUnavailable,
    );
    const reader = setup({ status: 'active', publicKey: device.publicKey }, ['READER']);
    await expect(getSyncCatalog(reader.deps, context, device.proof())).rejects.toThrow('Accès refusé');
  });

  it('serves a package exactly as built, never one whose manifest does not match its hash', async () => {
    const { deps, devices } = setup({ status: 'active', publicKey: device.publicKey });
    const manifest = { manifest_version: 1, files: [] };
    devices.package.mockResolvedValue({
      siteId: entry.site_id,
      manifest,
      manifestHash: await sha256(canonicalJson(manifest)),
      signatures: [builtSignature],
      payload: { b: 1, a: 2 },
    });
    expect(await getSyncPackage(deps, context, device.proof(), entry.publication_id)).toEqual({
      manifest: canonicalJson(manifest),
      signature: builtSignature,
      data: '{"a":2,"b":1}',
      access_expires_at: null,
    });
    devices.package.mockResolvedValue({
      siteId: entry.site_id,
      manifest,
      manifestHash: 'b'.repeat(64),
      signatures: [builtSignature],
      payload: {},
    });
    await expect(getSyncPackage(deps, context, device.proof(), entry.publication_id)).rejects.toThrow(
      'MANIFEST_HASH_MISMATCH',
    );
  });

  it('serves the key set to enrolled terminals, 404 when none is configured (SEC-04)', async () => {
    const { deps } = setup({ status: 'active', publicKey: device.publicKey });
    await expect(getSyncKeyset(deps, context, device.proof())).rejects.toBeInstanceOf(NotFound);
    const signed = { keyset: '{}', signature: builtSignature };
    const withKeyset = { ...deps, keyset: async () => ({ signed, keyset }) };
    await expect(getSyncKeyset(withKeyset, context, device.proof())).resolves.toEqual(signed);
    const revoked = setup({ status: 'revoked', publicKey: device.publicKey });
    await expect(
      getSyncKeyset({ ...revoked.deps, keyset: async () => ({ signed, keyset }) }, context, device.proof()),
    ).rejects.toBeInstanceOf(DeviceRevoked);
  });

  it('serves the newest signature the terminals trust, 503 while a revoked key is not replaced (SEC-04)', async () => {
    const { deps, devices } = setup({ status: 'active', publicKey: device.publicKey });
    const manifest = { manifest_version: 1, files: [] };
    const signature = (keyId: string): Signature => ({ algorithm: 'Ed25519', key_id: keyId, signature: keyId });
    const withKeyset = {
      ...deps,
      keyset: async () => ({ signed: { keyset: '{}', signature: builtSignature }, keyset }),
    };
    devices.package.mockResolvedValue({
      siteId: entry.site_id,
      manifest,
      manifestHash: await sha256(canonicalJson(manifest)),
      signatures: [signature('pub-old'), signature('pub-new')],
      payload: {},
    });
    expect((await getSyncPackage(withKeyset, context, device.proof(), entry.publication_id)).signature).toEqual(
      signature('pub-new'),
    );
    devices.package.mockResolvedValue({
      siteId: entry.site_id,
      manifest,
      manifestHash: await sha256(canonicalJson(manifest)),
      signatures: [signature('pub-lost')],
      payload: {},
    });
    await expect(getSyncPackage(withKeyset, context, device.proof(), entry.publication_id)).rejects.toBeInstanceOf(
      ServiceUnavailable,
    );
    devices.basemap.mockResolvedValue({
      manifest,
      manifestHash: await sha256(canonicalJson(manifest)),
      signatures: [signature('pub-lost'), signature('pub-old')],
    });
    expect((await getSyncBasemap(withKeyset, context, device.proof(), basemapEntry.pack_id)).signature).toEqual(
      signature('pub-old'),
    );
  });

  it('lists the base maps of the terminal in the signed catalogue (ADR-024)', async () => {
    const { deps } = setup({ status: 'active', publicKey: device.publicKey });
    const signed = await getSyncCatalog(deps, context, device.proof());
    expect(syncCatalogSchema.parse(JSON.parse(signed.catalog)).basemaps).toEqual([basemapEntry]);
  });

  it('serves a base map exactly as signed, its parts by short-lived URLs, not audited', async () => {
    const { deps, devices, audit } = setup({ status: 'active', publicKey: device.publicKey });
    await expect(getSyncBasemap(deps, context, device.proof(), basemapEntry.pack_id)).rejects.toThrow(
      'Fond de carte non distribué',
    );
    const manifest = { kind: 'basemap', version: 2 };
    devices.basemap.mockResolvedValue({
      manifest,
      manifestHash: await sha256(canonicalJson(manifest)),
      signatures: [builtSignature],
    });
    await expect(getSyncBasemap(deps, context, device.proof(), basemapEntry.pack_id)).resolves.toEqual({
      manifest: canonicalJson(manifest),
      signature: builtSignature,
    });
    devices.basemap.mockResolvedValue({ manifest, manifestHash: 'd'.repeat(64), signatures: [builtSignature] });
    await expect(getSyncBasemap(deps, context, device.proof(), basemapEntry.pack_id)).rejects.toThrow(
      'MANIFEST_HASH_MISMATCH',
    );

    await expect(
      createSyncBasemapDownloads(deps, context, device.proof(), basemapEntry.pack_id, { sha256: ['e'.repeat(64)] }),
    ).rejects.toBeInstanceOf(ServiceUnavailable);
    const storage = {
      createDownloadUrl: vi.fn(async (key: string, seconds: number) => ({
        url: `https://storage.example/${key}`,
        expiresAt: new Date(NOW.getTime() + seconds * 1000),
      })),
      createUploadUrl: vi.fn(),
    };
    devices.basemapFiles.mockResolvedValue([{ sha256: 'e'.repeat(64), storageKey: 'tenants/t/basemaps/p/style.json' }]);
    const downloads = await createSyncBasemapDownloads(
      { ...deps, storage },
      context,
      device.proof(),
      basemapEntry.pack_id,
      { sha256: ['e'.repeat(64)] },
    );
    expect(downloads.files).toEqual([
      {
        sha256: 'e'.repeat(64),
        url: 'https://storage.example/tenants/t/basemaps/p/style.json',
        expires_at: new Date(NOW.getTime() + 300_000).toISOString(),
      },
    ]);
    expect(audit.record).not.toHaveBeenCalled();
    await expect(
      recordSyncBasemapReceipt(deps, context, device.proof(), { installed: [basemapEntry.pack_id] }),
    ).resolves.toEqual({ received_at: NOW.toISOString(), installed: 1 });
  });

  it('opens a restricted site on demand for 24 hours, journaled as an offline download (PER-02)', async () => {
    const { deps, devices, accessJournal } = setup({ status: 'active', publicKey: device.publicKey });
    const manifest = { manifest_version: 1, files: [] };
    devices.package.mockResolvedValue({
      siteId: entry.site_id,
      manifest,
      manifestHash: await sha256(canonicalJson(manifest)),
      signatures: [builtSignature],
      payload: {},
    });
    accessJournal.record.mockResolvedValue('restricted');
    const served = await getSyncPackage(deps, context, device.proof(), entry.publication_id);
    expect(served.access_expires_at).toBe(new Date(NOW.getTime() + 24 * 3_600_000).toISOString());
    expect(accessJournal.record).toHaveBeenCalledWith(entry.site_id, entry.publication_id, 'download_offline', {
      deviceId: DEVICE,
    });
  });

  it('journals the offline consultations sent by the terminal, with its identity', async () => {
    const { deps, accessJournal } = setup({ status: 'active', publicKey: device.publicKey });
    const event = {
      client_event_id: '0600000e-0000-4000-8000-0000000000e1',
      site_id: entry.site_id,
      publication_id: entry.publication_id,
      action: 'view' as const,
      occurred_at: '2026-10-05T08:00:00.000Z',
    };
    await expect(submitAccessEvents(deps, context, device.proof(), { events: [event] })).resolves.toEqual({
      received: 1,
    });
    expect(accessJournal.record).toHaveBeenCalledWith(entry.site_id, entry.publication_id, 'view', {
      deviceId: DEVICE,
      clientEventId: event.client_event_id,
      occurredAt: new Date(event.occurred_at),
    });
  });

  it('gives download URLs only with object storage, after auditing the download', async () => {
    const { deps, devices, audit } = setup({ status: 'active', publicKey: device.publicKey });
    const request = { sha256: ['c'.repeat(64)] };
    await expect(createSyncDownloads(deps, context, device.proof(), entry.publication_id, request)).rejects.toThrow(
      ServiceUnavailable,
    );
    devices.package.mockResolvedValue({
      siteId: entry.site_id,
      manifest: {},
      manifestHash: '',
      signatures: [builtSignature],
      payload: {},
    });
    devices.packageFiles.mockResolvedValue([{ sha256: 'c'.repeat(64), storageKey: 'tenants/t/assets/a' }]);
    const storage = {
      createDownloadUrl: vi.fn(async (key: string) => ({ url: `https://storage.test/${key}`, expiresAt: NOW })),
      createUploadUrl: vi.fn(),
    };
    const downloads = await createSyncDownloads(
      { ...deps, storage },
      context,
      device.proof(),
      entry.publication_id,
      request,
    );
    expect(downloads.files).toEqual([
      { sha256: 'c'.repeat(64), url: 'https://storage.test/tenants/t/assets/a', expires_at: NOW.toISOString() },
    ]);
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('tenants/t/assets/a', 300);
    expect(audit.record).toHaveBeenCalledWith('publication.offline_download', 'publication', entry.publication_id, {
      device_id: DEVICE,
      files: 1,
    });
  });
});

describe('enrollment', () => {
  it('requires a well-formed code and the proof of the private key', async () => {
    const { deps, devices } = setup(null);
    const device = terminal();
    const input = (code: string, provenCode: string) => ({
      code,
      key_algorithm: 'ed25519' as const,
      public_key: device.publicKey,
      platform: 'android' as const,
      app_version: '1.0.0',
      proof: device.signText(enrollmentText({ tenantId: TENANT, code: provenCode, publicKey: device.publicKey })),
    });
    await expect(enrollDevice(deps, context, input('ABCD', 'ABCD'))).rejects.toThrow(InvalidInput);
    await expect(enrollDevice(deps, context, input('ABCD-EFGH-JKLM', 'ABCDEFGHJKLN'))).rejects.toThrow(
      DeviceProofInvalid,
    );
    await enrollDevice(deps, context, input('abcd-efgh-jklm', 'ABCDEFGHJKLM'));
    expect(devices.enroll).toHaveBeenCalledWith({
      codeHash: await sha256('ABCDEFGHJKLM'),
      keyAlgorithm: 'ed25519',
      publicKey: device.publicKey,
      platform: 'android',
      appVersion: '1.0.0',
    });
  });

  it('gives the administrator a one-time code and stores only its hash', async () => {
    const { deps, devices } = setup(null, ['SIS_ADMIN']);
    devices.create.mockResolvedValue({ id: DEVICE } as never);
    const created = await createDevice(deps, context, { name: 'FPT01' });
    expect(created.enrollment_code).toBe('BBBB-BBBB-BBBB');
    expect(created.expires_at).toBe('2026-10-02T10:00:00.000Z');
    expect(devices.create).toHaveBeenCalledWith('FPT01', await sha256('BBBBBBBBBBBB'), new Date(created.expires_at));
  });
});

describe('policy of the tablets (SEC-05)', () => {
  it('gives the policy completed with the defaults to device:manage only', async () => {
    const admin = setup(null, ['SIS_ADMIN']);
    admin.devices.policy.mockResolvedValue({ screenshots_allowed: true });
    expect(await getTerminalPolicy(admin.deps.sessions, context)).toEqual({
      ...DEFAULT_TERMINAL_POLICY,
      screenshots_allowed: true,
    });
    const ops = setup(null, ['OPS_USER']);
    await expect(getTerminalPolicy(ops.deps.sessions, context)).rejects.toThrow();
    await expect(updateTerminalPolicy(ops.deps.sessions, context, DEFAULT_TERMINAL_POLICY)).rejects.toThrow();
    expect(ops.devices.updatePolicy).not.toHaveBeenCalled();
    const changed = { ...DEFAULT_TERMINAL_POLICY, idle_lock_minutes: 1 };
    expect(await updateTerminalPolicy(admin.deps.sessions, context, changed)).toEqual(changed);
  });
});
