import type { MeResponse, SiteDetail, SiteListQuery, SiteListResponse } from '@etare/contracts';
import type { RequestContext, ResolvedAccess } from '@etare/domain';

/**
 * A request session: one database transaction carrying the verified request
 * context (user, tenant, assurance level, trace id). Every repository used
 * inside it is bound to that transaction, so RLS applies to each query.
 */
export interface RequestSession {
  readonly access: ResolvedAccess;
  readonly identity: IdentityReader;
  readonly sites: SiteReader;
}

export interface SessionFactory {
  run<T>(context: RequestContext, work: (session: RequestSession) => Promise<T>): Promise<T>;
}

export interface IdentityReader {
  me(): Promise<MeResponse>;
}

export interface SiteReader {
  list(query: SiteListQuery): Promise<SiteListResponse>;
  get(id: string): Promise<SiteDetail | null>;
}

export interface HealthProbe {
  database(): Promise<'ok' | 'unavailable'>;
}

/** Object storage (Supabase Storage at MVP, S3-compatible later). */
export interface ObjectStorage {
  /** Short-lived URL for an object the caller has ALREADY been authorized to read. */
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Short-lived URL to upload into the quarantine area. */
  createUploadUrl(key: string): Promise<{ url: string; token: string }>;
}
