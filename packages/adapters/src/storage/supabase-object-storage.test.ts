import { describe, expect, it, vi } from 'vitest';
import { SupabaseObjectStorage, type StorageBucketApi } from './supabase-object-storage';

const tenant = '06000000-0000-4000-8000-000000000000';
const key = `tenants/${tenant}/assets/06000005-0000-4000-8000-000000000001/06000005-0000-4000-8000-0000000000a1`;
const quarantineKey = key.replace('/assets/', '/quarantine/');
const now = () => new Date('2026-10-01T10:00:00.000Z');

function fakeBucket(overrides: Partial<StorageBucketApi> = {}): StorageBucketApi {
  return {
    createSignedUrl: vi.fn(async (path: string, expiresIn: number) => ({
      data: { signedUrl: `https://storage.test/${path}?ttl=${expiresIn}` },
      error: null,
    })),
    createSignedUploadUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://storage.test/upload/${path}?token=t`, token: 't' },
      error: null,
    })),
    download: vi.fn(async () => ({ data: new Blob([Uint8Array.from([37, 80, 68, 70])]), error: null })),
    copy: vi.fn(async () => ({ data: {}, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    upload: vi.fn(async () => ({ data: {}, error: null })),
    ...overrides,
  };
}

describe('SupabaseObjectStorage (API side)', () => {
  it('serves the reduced images of an asset, never removes a verified file (CAP-03)', async () => {
    const bucket = fakeBucket();
    const storage = new SupabaseObjectStorage(bucket, now);
    const thumbnail = key.replace('/assets/', '/thumbnails/') + '-320.webp';
    await expect(storage.createDownloadUrl(thumbnail, 60)).resolves.toMatchObject({ url: expect.any(String) });
    await expect(storage.remove(key)).rejects.toThrow('can be removed');
    await expect(storage.remove(thumbnail)).rejects.toThrow('can be removed');
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it('signs short-lived download URLs for verified assets only', async () => {
    const storage = new SupabaseObjectStorage(fakeBucket(), now);
    await expect(storage.createDownloadUrl(key, 60)).resolves.toEqual({
      url: expect.stringContaining('ttl=60'),
      expiresAt: new Date('2026-10-01T10:01:00.000Z'),
    });
    await expect(storage.createDownloadUrl(quarantineKey, 60)).rejects.toThrow('verified');
  });

  it('refuses long-lived URLs and malformed keys', async () => {
    const storage = new SupabaseObjectStorage(fakeBucket());
    await expect(storage.createDownloadUrl(key, 3600)).rejects.toThrow();
    await expect(storage.createDownloadUrl('../secrets.txt', 60)).rejects.toThrow('Invalid storage key.');
    await expect(storage.createDownloadUrl(`${key}/../../x`, 60)).rejects.toThrow('Invalid storage key.');
  });

  it('only issues upload URLs into quarantine, with the declared type', async () => {
    const storage = new SupabaseObjectStorage(fakeBucket(), now);
    await expect(storage.createUploadUrl(key, 'application/pdf')).rejects.toThrow('quarantine');
    await expect(storage.createUploadUrl(quarantineKey, 'application/pdf')).resolves.toEqual({
      url: expect.stringContaining('/upload/'),
      headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
      expiresAt: new Date('2026-10-01T12:00:00.000Z'),
    });
  });

  it('hides provider errors', async () => {
    const bucket = fakeBucket({ createSignedUrl: async () => ({ data: null, error: new Error('internal detail') }) });
    await expect(new SupabaseObjectStorage(bucket).createDownloadUrl(key, 60)).rejects.toThrow('STORAGE_UNAVAILABLE');
  });
});

describe('SupabaseObjectStorage (worker side)', () => {
  it('downloads, copies and removes objects', async () => {
    const bucket = fakeBucket();
    const storage = new SupabaseObjectStorage(bucket);
    await expect(storage.download(quarantineKey)).resolves.toEqual(Uint8Array.from([37, 80, 68, 70]));
    await storage.copy(quarantineKey, key);
    await storage.remove(quarantineKey);
    expect(bucket.copy).toHaveBeenCalledWith(quarantineKey, key);
    expect(bucket.remove).toHaveBeenCalledWith([quarantineKey]);
  });

  it('reports a missing object as null (upload not received yet)', async () => {
    const storage = new SupabaseObjectStorage(
      fakeBucket({ download: async () => ({ data: null, error: { status: 404, message: 'Object not found' } }) }),
    );
    await expect(storage.download(quarantineKey)).resolves.toBeNull();
  });
});
