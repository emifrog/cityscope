import { describe, expect, it, vi } from 'vitest';
import { SupabaseObjectStorage, type StorageBucketApi } from './supabase-object-storage';

const tenant = '06000000-0000-4000-8000-000000000000';
const key = `tenants/${tenant}/assets/06000005-0000-4000-8000-000000000001/06000005-0000-4000-8000-0000000000a1`;

function fakeBucket(): StorageBucketApi {
  return {
    createSignedUrl: vi.fn(async (path: string, expiresIn: number) => ({
      data: { signedUrl: `https://storage.test/${path}?ttl=${expiresIn}` },
      error: null,
    })),
    createSignedUploadUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://storage.test/upload/${path}`, token: 't' },
      error: null,
    })),
  };
}

describe('SupabaseObjectStorage', () => {
  it('signs short-lived download URLs', async () => {
    const storage = new SupabaseObjectStorage(fakeBucket());
    await expect(storage.createDownloadUrl(key, 60)).resolves.toContain('ttl=60');
  });

  it('refuses long-lived URLs and malformed keys', async () => {
    const storage = new SupabaseObjectStorage(fakeBucket());
    await expect(storage.createDownloadUrl(key, 3600)).rejects.toThrow();
    await expect(storage.createDownloadUrl('../secrets.txt', 60)).rejects.toThrow('Invalid storage key.');
    await expect(storage.createDownloadUrl(`${key}/../../x`, 60)).rejects.toThrow('Invalid storage key.');
  });

  it('only accepts uploads into quarantine', async () => {
    const storage = new SupabaseObjectStorage(fakeBucket());
    await expect(storage.createUploadUrl(key)).rejects.toThrow('quarantine');
    const quarantineKey = key.replace('/assets/', '/quarantine/');
    await expect(storage.createUploadUrl(quarantineKey)).resolves.toMatchObject({ token: 't' });
  });

  it('hides provider errors', async () => {
    const bucket = fakeBucket();
    bucket.createSignedUrl = async () => ({ data: null, error: new Error('internal detail') });
    await expect(new SupabaseObjectStorage(bucket).createDownloadUrl(key, 60)).rejects.toThrow('STORAGE_UNAVAILABLE');
  });
});
