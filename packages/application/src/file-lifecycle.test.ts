import { describe, expect, it, vi } from 'vitest';
import {
  ImageUnreadable,
  createAssetVariants,
  maintenanceSlot,
  runFileMaintenance,
  type AssetForVariants,
  type AssetVariantDependencies,
  type FileMaintenanceStore,
} from './file-lifecycle';
import { PermanentJobError } from './jobs';

const TENANT = '06000000-0000-4000-8000-000000000000';
const KEY = `tenants/${TENANT}/assets/0600000b-0000-4000-8000-000000000001/0600000c-0000-4000-8000-000000000001`;

function variants(asset: Partial<AssetForVariants> | null = {}) {
  const store = {
    get: vi.fn(async () =>
      asset === null
        ? null
        : { storageKey: KEY, mimeType: 'image/jpeg', scanStatus: 'clean' as const, thumbnailKey: null, ...asset },
    ),
    record: vi.fn(async () => true),
  };
  const objects = {
    download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    copy: vi.fn(),
    remove: vi.fn(),
    upload: vi.fn(async () => undefined),
  };
  const images = { variants: vi.fn(async () => ({ thumbnail: new Uint8Array([4]), preview: new Uint8Array([5]) })) };
  const deps: AssetVariantDependencies = { store, objects, images };
  return { deps, store, objects, images };
}

describe('reduced images', () => {
  it('are computed from the original and stored next to it, in WebP', async () => {
    const { deps, store, objects } = variants();
    await expect(createAssetVariants(deps, 'a', TENANT)).resolves.toBe('created');
    const thumbnail = KEY.replace('/assets/', '/thumbnails/') + '-320.webp';
    const preview = KEY.replace('/assets/', '/thumbnails/') + '-1280.webp';
    expect(objects.upload).toHaveBeenCalledWith(thumbnail, new Uint8Array([4]), 'image/webp', { upsert: true });
    expect(objects.upload).toHaveBeenCalledWith(preview, new Uint8Array([5]), 'image/webp', { upsert: true });
    expect(store.record).toHaveBeenCalledWith('a', TENANT, thumbnail, preview);
  });

  it.each([
    ['an unknown asset or of another SIS', null],
    ['a file not checked clean', { scanStatus: 'rejected' as const }],
    ['a PDF', { mimeType: 'application/pdf' }],
    ['an image already reduced', { thumbnailKey: 'done' }],
  ])('skip %s', async (_label, asset) => {
    const { deps, objects } = variants(asset);
    await expect(createAssetVariants(deps, 'a', TENANT)).resolves.toBe('skipped');
    expect(objects.upload).not.toHaveBeenCalled();
  });

  it('give up on an image that cannot be decoded, and keep the original', async () => {
    const { deps, images, store } = variants();
    images.variants.mockRejectedValue(new ImageUnreadable());
    await expect(createAssetVariants(deps, 'a', TENANT)).rejects.toBeInstanceOf(PermanentJobError);
    expect(store.record).not.toHaveBeenCalled();
  });
});

describe('maintenance of the files', () => {
  function maintenance() {
    const calls: string[] = [];
    const store: FileMaintenanceStore = {
      schedule: vi.fn(),
      quarantineToRelease: vi.fn(async () => [
        { assetId: 'a1', tenantId: TENANT, quarantineKey: 'q1', reason: 'ABANDONED' as const },
      ]),
      releaseQuarantine: vi.fn(async () => {
        calls.push('release');
        return true;
      }),
      publicationOutputsToPurge: vi.fn(async () => [{ outputId: 'o1', tenantId: TENANT, storageKey: 'p1' }]),
      markPublicationOutputRemoved: vi.fn(async () => {
        calls.push('mark');
        return true;
      }),
      purgeRateLimits: vi.fn(async () => 7),
    };
    const objects = {
      download: vi.fn(),
      copy: vi.fn(),
      upload: vi.fn(),
      remove: vi.fn(async (key: string) => {
        calls.push(`remove ${key}`);
      }),
    };
    return { store, objects, calls };
  }

  it('removes the object before recording it, then reports what was done', async () => {
    const { store, objects, calls } = maintenance();
    await expect(runFileMaintenance(store, objects)).resolves.toEqual({
      quarantineReleased: 1,
      publicationOutputsRemoved: 1,
      rateLimitWindowsPurged: 7,
      failures: 0,
    });
    expect(calls).toEqual(['remove q1', 'release', 'remove p1', 'mark']);
  });

  it('goes on after an item in error, which stays for the next run', async () => {
    const { store, objects, calls } = maintenance();
    objects.remove.mockRejectedValueOnce(new Error('STORAGE_UNAVAILABLE'));
    await expect(runFileMaintenance(store, objects)).resolves.toMatchObject({
      quarantineReleased: 0,
      publicationOutputsRemoved: 1,
      failures: 1,
    });
    expect(calls).toEqual(['remove p1', 'mark']);
  });

  it('runs once per hour slot', () => {
    expect(maintenanceSlot(new Date('2026-10-03T14:59:59Z'))).toBe('2026-10-03T14');
    expect(maintenanceSlot(new Date('2026-10-03T15:00:00Z'))).toBe('2026-10-03T15');
  });
});
