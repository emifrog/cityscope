import { describe, expect, it, vi } from 'vitest';
import {
  UploadNotReceived,
  antivirusNotConfigured,
  verifyAsset,
  type VerificationDependencies,
} from './asset-verification';
import type { AssetForVerification, MalwareScanner } from './ports';

const PDF = Uint8Array.from('%PDF-1.7 demo', (character) => character.charCodeAt(0));
/** Deterministic fake digest: the test only needs equality semantics. */
const fakeSha256 = async (content: Uint8Array) => `digest:${Array.from(content).join('.')}`;

function setup(
  overrides: Partial<AssetForVerification> = {},
  content: Uint8Array | null = PDF,
  scanner?: MalwareScanner,
) {
  const asset: AssetForVerification = {
    tenantId: '06000000-0000-4000-8000-000000000000',
    storageKey: 'tenants/t/assets/a/v',
    quarantineKey: 'tenants/t/quarantine/a/v',
    mimeType: 'application/pdf',
    sizeBytes: PDF.byteLength,
    sha256: `digest:${Array.from(PDF).join('.')}`,
    scanStatus: 'pending',
    ...overrides,
  };
  const store = { get: vi.fn(async () => asset), complete: vi.fn(async () => true) };
  const objects = {
    download: vi.fn(async () => content),
    copy: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    upload: vi.fn(async () => undefined),
  };
  const deps: VerificationDependencies = {
    store,
    objects,
    scanner: scanner ?? antivirusNotConfigured,
    sha256: fakeSha256,
  };
  return { deps, store, objects };
}

describe('asset verification', () => {
  it('promotes a conforming file and records the verdict', async () => {
    const { deps, store, objects } = setup();
    await expect(verifyAsset(deps, 'asset')).resolves.toEqual({ status: 'clean' });
    expect(objects.copy).toHaveBeenCalledWith('tenants/t/quarantine/a/v', 'tenants/t/assets/a/v');
    expect(objects.remove).toHaveBeenCalledWith('tenants/t/quarantine/a/v');
    expect(store.complete).toHaveBeenCalledWith('asset', 'clean', {
      detected_type: 'application/pdf',
      antivirus: 'not_scanned',
      engine: 'none',
    });
  });

  it.each([
    ['a size different from the declaration', { sizeBytes: 1 }, 'SIZE_MISMATCH'],
    ['a different content (SHA-256)', { sha256: 'digest:other' }, 'SHA256_MISMATCH'],
    ['a real type different from the declared one', { mimeType: 'image/png' }, 'TYPE_MISMATCH'],
  ])('rejects %s and deletes it from quarantine', async (_label, overrides, reason) => {
    const { deps, store, objects } = setup(overrides);
    await expect(verifyAsset(deps, 'asset')).resolves.toEqual({ status: 'rejected', reason });
    expect(objects.copy).not.toHaveBeenCalled();
    expect(objects.remove).toHaveBeenCalledOnce();
    expect(store.complete).toHaveBeenCalledWith('asset', 'rejected', expect.objectContaining({ reason }));
  });

  it('rejects an executable disguised as a PDF', async () => {
    const executable = Uint8Array.from('MZ fake executable', (character) => character.charCodeAt(0));
    const { deps } = setup({ sizeBytes: executable.byteLength, sha256: await fakeSha256(executable) }, executable);
    await expect(verifyAsset(deps, 'asset')).resolves.toMatchObject({ reason: 'TYPE_MISMATCH' });
  });

  it('rejects infected files', async () => {
    const scanner: MalwareScanner = { scan: async () => ({ verdict: 'infected', engine: 'test', signature: 'EICAR' }) };
    const { deps } = setup({}, PDF, scanner);
    await expect(verifyAsset(deps, 'asset')).resolves.toEqual({ status: 'rejected', reason: 'MALWARE' });
  });

  it('ignores an asset of another tenant', async () => {
    const { deps, objects } = setup();
    await expect(verifyAsset(deps, 'asset', '83000000-0000-4000-8000-000000000000')).resolves.toEqual({
      status: 'unknown_asset',
    });
    expect(objects.download).not.toHaveBeenCalled();
  });

  it('is idempotent once a verdict exists', async () => {
    const { deps, objects } = setup({ scanStatus: 'clean', quarantineKey: null });
    await expect(verifyAsset(deps, 'asset')).resolves.toEqual({ status: 'already_verified' });
    expect(objects.download).not.toHaveBeenCalled();
  });

  it('retries later when the upload has not arrived yet', async () => {
    const { deps, store } = setup({}, null);
    await expect(verifyAsset(deps, 'asset')).rejects.toBeInstanceOf(UploadNotReceived);
    expect(store.complete).not.toHaveBeenCalled();
  });
});
