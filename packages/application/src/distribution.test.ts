import { syncCatalogSchema, type CatalogEntry, type Signature } from '@etare/contracts';
import {
  DeviceClockSkew,
  DeviceNotEnrolled,
  DeviceProofInvalid,
  DeviceRevoked,
  EMPTY_BODY_SHA256,
  InvalidInput,
  ServiceUnavailable,
  canonicalJson,
  deviceRequestText,
  enrollmentText,
  permissionsForRoles,
  signedText,
  type DeviceStatus,
  type RequestContext,
  type Role,
  type SignatureContext,
} from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  createDevice,
  createSyncDownloads,
  enrollDevice,
  getSyncCatalog,
  getSyncPackage,
  type DeviceProof,
  type DistributionDependencies,
} from './distribution';
import type { ContentSigner, DeviceRepository, RequestSession, SessionFactory } from './ports';
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
  verify: (publicKey: string, text: string, signature: string) => fakeSign(publicKey, text) === signature,
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
  keyId: 'catalog-test',
  sign: (signatureContext: SignatureContext, content: string): Signature => ({
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

function setup(device: { status: DeviceStatus; publicKey: string | null } | null, roles: Role[] = ['OPS_USER']) {
  const devices = {
    syncDevice: vi.fn<DeviceRepository['syncDevice']>(async () => device),
    catalog: vi.fn<DeviceRepository['catalog']>(async () => ({
      generation: 7,
      tenantName: 'SDIS DEMO 06',
      publications: [entry],
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
  };
  const audit = { record: vi.fn(async () => undefined) };
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) =>
      work(
        stubSession(
          { userId: USER, tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) },
          { devices, audit },
        ),
      ),
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
  return { deps, devices, audit };
}

describe('terminal requests', () => {
  const device = terminal();

  it('returns a catalogue signed with the catalogue key, with a 7-day local authorization', async () => {
    const { deps, devices } = setup({ status: 'active', publicKey: device.publicKey });
    const signed = await getSyncCatalog(deps, context, device.proof());
    const text = signedText('etare.catalog.v1', signed.catalog);
    expect(verifier.verify(CATALOG_KEY, text, signed.signature.signature)).toBe(true);
    const catalog = syncCatalogSchema.parse(JSON.parse(signed.catalog));
    expect(signed.catalog).toBe(canonicalJson(catalog));
    expect(catalog).toMatchObject({
      tenant_id: TENANT,
      device_id: DEVICE,
      generation: 7,
      authorization: { user_id: USER, expires_at: '2026-10-08T10:00:00.000Z' },
      publications: [entry],
    });
    expect(devices.catalog).toHaveBeenCalledWith(DEVICE, '1.0.0');
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
      manifest,
      manifestHash: await sha256(canonicalJson(manifest)),
      signature: builtSignature,
      payload: { b: 1, a: 2 },
    });
    expect(await getSyncPackage(deps, context, device.proof(), entry.publication_id)).toEqual({
      manifest: canonicalJson(manifest),
      signature: builtSignature,
      data: '{"a":2,"b":1}',
    });
    devices.package.mockResolvedValue({
      manifest,
      manifestHash: 'b'.repeat(64),
      signature: builtSignature,
      payload: {},
    });
    await expect(getSyncPackage(deps, context, device.proof(), entry.publication_id)).rejects.toThrow(
      'MANIFEST_HASH_MISMATCH',
    );
  });

  it('gives download URLs only with object storage, after auditing the download', async () => {
    const { deps, devices, audit } = setup({ status: 'active', publicKey: device.publicKey });
    const request = { sha256: ['c'.repeat(64)] };
    await expect(createSyncDownloads(deps, context, device.proof(), entry.publication_id, request)).rejects.toThrow(
      ServiceUnavailable,
    );
    devices.package.mockResolvedValue({ manifest: {}, manifestHash: '', signature: builtSignature, payload: {} });
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
