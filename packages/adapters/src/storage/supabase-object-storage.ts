import type { ObjectStorage } from '@etare/application';
import { createClient } from '@supabase/supabase-js';

/** Minimal bucket API used here (structurally satisfied by supabase-js StorageFileApi). */
export interface StorageBucketApi {
  createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  createSignedUploadUrl(path: string): Promise<{ data: { signedUrl: string; token: string } | null; error: unknown }>;
}

const KEY_PATTERN = /^tenants\/[0-9a-f-]{36}\/(assets|quarantine)\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
const MAX_DOWNLOAD_TTL_SECONDS = 300;

/**
 * Storage gateway over Supabase Storage. Uses the server-side secret key: it
 * must only be called AFTER the API authorized the exact asset in PostgreSQL
 * (RLS). The bucket has no client-facing policy, so the secret key never
 * leaves the server and clients only ever get short-lived signed URLs.
 * Swapping to an S3-compatible store means another implementation of
 * ObjectStorage, not a change of the authorization model.
 */
export class SupabaseObjectStorage implements ObjectStorage {
  constructor(private readonly bucket: StorageBucketApi) {}

  static fromSecretKey(url: string, secretKey: string, bucket = 'etare-assets'): SupabaseObjectStorage {
    const client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return new SupabaseObjectStorage(client.storage.from(bucket));
  }

  async createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    assertKey(key);
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_DOWNLOAD_TTL_SECONDS) {
      throw new Error(`Signed URL lifetime must be between 1 and ${MAX_DOWNLOAD_TTL_SECONDS} seconds.`);
    }
    const { data, error } = await this.bucket.createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw new Error('STORAGE_UNAVAILABLE');
    return data.signedUrl;
  }

  async createUploadUrl(key: string): Promise<{ url: string; token: string }> {
    assertKey(key);
    if (!key.includes('/quarantine/')) throw new Error('Uploads always land in quarantine first.');
    const { data, error } = await this.bucket.createSignedUploadUrl(key);
    if (error || !data) throw new Error('STORAGE_UNAVAILABLE');
    return { url: data.signedUrl, token: data.token };
  }
}

function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key.');
}
