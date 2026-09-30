import type {
  Building,
  BuildingCreate,
  BuildingUpdate,
  Classification,
  ClassificationCreate,
  ClassificationUpdate,
  Contact,
  ContactCreate,
  ContactUpdate,
  ExternalId,
  ExternalIdCreate,
  Level,
  LevelCreate,
  LevelUpdate,
  MeResponse,
  SiteCreate,
  SiteDetail,
  SiteListQuery,
  SiteListResponse,
  SiteUpdate,
} from '@etare/contracts';
import type { RequestContext, ResolvedAccess } from '@etare/domain';

/**
 * A request session: one database transaction carrying the verified request
 * context (user, tenant, assurance level, trace id). Every repository used
 * inside it is bound to that transaction, so RLS applies to each query.
 */
export interface RequestSession {
  readonly access: ResolvedAccess;
  readonly identity: IdentityReader;
  readonly sites: SiteRepository;
  readonly buildings: BuildingRepository;
  readonly classifications: ClassificationRepository;
  readonly contacts: ContactRepository;
  readonly externalIds: ExternalIdRepository;
}

export interface SessionFactory {
  run<T>(context: RequestContext, work: (session: RequestSession) => Promise<T>): Promise<T>;
}

export interface IdentityReader {
  me(): Promise<MeResponse>;
}

/**
 * Versioned updates follow one convention: they return null when the record
 * is not visible (unknown or other SIS) and throw PreconditionFailed when the
 * expected version is stale — never a silent overwrite.
 */
export interface SiteReader {
  list(query: SiteListQuery): Promise<SiteListResponse>;
  get(id: string): Promise<SiteDetail | null>;
}

export interface SiteRepository extends SiteReader {
  create(input: SiteCreate): Promise<SiteDetail>;
  update(id: string, expectedVersion: number, patch: SiteUpdate): Promise<SiteDetail | null>;
}

export interface BuildingRepository {
  listBySite(siteId: string): Promise<Building[]>;
  /** Null when the site is not visible. */
  create(siteId: string, input: BuildingCreate): Promise<Building | null>;
  update(id: string, expectedVersion: number, patch: BuildingUpdate): Promise<Building | null>;
  /** Null when the building is not visible. */
  createLevel(buildingId: string, input: LevelCreate): Promise<Level | null>;
  updateLevel(id: string, expectedVersion: number, patch: LevelUpdate): Promise<Level | null>;
}

export interface ClassificationRepository {
  listBySite(siteId: string): Promise<Classification[]>;
  create(siteId: string, input: ClassificationCreate): Promise<Classification | null>;
  update(id: string, expectedVersion: number, patch: ClassificationUpdate): Promise<Classification | null>;
}

export interface ContactRepository {
  listBySite(siteId: string): Promise<Contact[]>;
  create(siteId: string, input: ContactCreate): Promise<Contact | null>;
  update(id: string, expectedVersion: number, patch: ContactUpdate): Promise<Contact | null>;
}

export interface ExternalIdRepository {
  listBySite(siteId: string): Promise<ExternalId[]>;
  create(siteId: string, input: ExternalIdCreate): Promise<ExternalId | null>;
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
