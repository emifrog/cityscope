import type { ObjectStorage, ObjectStoreAdmin } from '@etare/application';
import { createClient } from '@supabase/supabase-js';

type StorageResult<T> = Promise<{ data: T | null; error: unknown }>;

/** Minimal bucket API used here (structurally satisfied by supabase-js StorageFileApi). */
export interface StorageBucketApi {
  createSignedUrl(path: string, expiresIn: number): StorageResult<{ signedUrl: string }>;
  createSignedUploadUrl(path: string): StorageResult<{ signedUrl: string; token: string }>;
  download(path: string): StorageResult<Blob>;
  copy(fromPath: string, toPath: string): StorageResult<unknown>;
  remove(paths: string[]): StorageResult<unknown>;
  upload(path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }): StorageResult<unknown>;
}

const KEY_PATTERN = /^tenants\/[0-9a-f-]{36}\/(assets|quarantine)\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
/** Files produced by the worker for a publication (the ETARE PDF). */
const PUBLICATION_KEY_PATTERN = /^tenants\/[0-9a-f-]{36}\/publications\/[0-9a-f-]{36}\/[a-z0-9-]+\.pdf$/;
/** Readable objects: verified assets and publication files, never the quarantine. */
const isReadable = (key: string) => key.includes('/assets/') || PUBLICATION_KEY_PATTERN.test(key);
const MAX_DOWNLOAD_TTL_SECONDS = 300;
/** Lifetime of Supabase signed upload URLs (fixed by the provider). */
const UPLOAD_URL_LIFETIME_MS = 2 * 60 * 60 * 1000;

/**
 * Storage gateway over Supabase Storage, using the server-side secret key.
 * The API only calls it AFTER authorizing the exact asset in PostgreSQL (RLS);
 * the bucket has no client-facing policy, so clients only ever receive
 * short-lived signed URLs. The worker uses the admin operations to verify and
 * promote quarantined files. Moving to an S3-compatible store means another
 * implementation of these ports, not a change of the authorization model.
 */
export class SupabaseObjectStorage implements ObjectStorage, ObjectStoreAdmin {
  constructor(
    private readonly bucket: StorageBucketApi,
    private readonly now: () => Date = () => new Date(),
  ) {}

  static fromSecretKey(url: string, secretKey: string, bucket = 'etare-assets'): SupabaseObjectStorage {
    const client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return new SupabaseObjectStorage(client.storage.from(bucket));
  }

  async createDownloadUrl(key: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: Date }> {
    assertKey(key);
    if (!isReadable(key)) throw new Error('Only verified assets and publication files can be downloaded.');
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_DOWNLOAD_TTL_SECONDS) {
      throw new Error(`Signed URL lifetime must be between 1 and ${MAX_DOWNLOAD_TTL_SECONDS} seconds.`);
    }
    const { data, error } = await this.bucket.createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw new Error('STORAGE_UNAVAILABLE');
    return { url: data.signedUrl, expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1000) };
  }

  async createUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }> {
    assertKey(key);
    if (!key.includes('/quarantine/')) throw new Error('Uploads always land in quarantine first.');
    const { data, error } = await this.bucket.createSignedUploadUrl(key);
    if (error || !data) throw new Error('STORAGE_UNAVAILABLE');
    return {
      url: data.signedUrl,
      headers: { 'content-type': contentType, 'x-upsert': 'false' },
      expiresAt: new Date(this.now().getTime() + UPLOAD_URL_LIFETIME_MS),
    };
  }

  async download(key: string): Promise<Uint8Array | null> {
    assertKey(key);
    const { data, error } = await this.bucket.download(key);
    if (error) {
      if (isNotFound(error)) return null;
      throw new Error('STORAGE_UNAVAILABLE');
    }
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  }

  async copy(from: string, to: string): Promise<void> {
    assertKey(from);
    assertKey(to);
    const { error } = await this.bucket.copy(from, to);
    if (error) throw new Error('STORAGE_UNAVAILABLE');
  }

  async upload(
    key: string,
    content: Uint8Array,
    contentType: string,
    options: { upsert?: boolean } = {},
  ): Promise<void> {
    assertKey(key);
    if (!isReadable(key)) throw new Error('Server-side uploads go to verified asset or publication keys only.');
    const { error } = await this.bucket.upload(key, content, { contentType, upsert: options.upsert ?? false });
    if (error) throw new Error('STORAGE_UNAVAILABLE');
  }

  async remove(key: string): Promise<void> {
    assertKey(key);
    const { error } = await this.bucket.remove([key]);
    if (error) throw new Error('STORAGE_UNAVAILABLE');
  }
}

function assertKey(key: string): void {
  if (!KEY_PATTERN.test(key) && !PUBLICATION_KEY_PATTERN.test(key)) throw new Error('Invalid storage key.');
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = 'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  return status === 404 || status === '404' || /not.?found/i.test(message);
}
