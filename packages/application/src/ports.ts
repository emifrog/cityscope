import type {
  AddressCandidate,
  Building,
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentVersionCreate,
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
  MapFeaturesQuery,
  MapFeaturesResponse,
  MapSitesQuery,
  MapSitesResponse,
  ObjectType,
  OperationalObject,
  OperationalObjectCreate,
  OperationalObjectUpdate,
  Plan,
  PlanCreate,
  PlanRevisionCreate,
  PlanUpdate,
  MeResponse,
  Member,
  MemberInvite,
  MemberUpdate,
  SiteCreate,
  SiteDetail,
  SiteListQuery,
  SiteListResponse,
  SiteUpdate,
} from '@etare/contracts';
import type { Permission, RequestContext, ResolvedAccess, ScanStatus } from '@etare/domain';

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
  readonly documents: DocumentRepository;
  readonly assets: AssetRepository;
  readonly members: MemberRepository;
  readonly objects: OperationalObjectRepository;
  readonly plans: PlanRepository;
  readonly jobs: JobScheduler;
  readonly audit: AuditRecorder;
}

export interface SessionFactory {
  run<T>(context: RequestContext, work: (session: RequestSession) => Promise<T>): Promise<T>;
}

export interface IdentityReader {
  me(): Promise<MeResponse>;
  /** True when the roles of the user would grant this permission with a second factor (aal2). */
  holdsWithSecondFactor(permission: Permission): Promise<boolean>;
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
  /** Positioned sites as GeoJSON for the map, with the extent of all matches and the unpositioned count. */
  mapFeatures(query: MapSitesQuery): Promise<MapSitesResponse>;
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

/** A file waiting for its upload, created with the document (version). */
export interface PendingUpload {
  readonly assetId: string;
  readonly quarantineKey: string;
  readonly mimeType: string;
}

export interface DocumentRepository {
  listBySite(siteId: string): Promise<Document[]>;
  /** Creates the document, its version 1 and the pending asset. Null when the site is not visible. */
  create(siteId: string, input: DocumentCreate): Promise<{ document: Document; upload: PendingUpload } | null>;
  /** Adds a version (previous ones are kept). Null when the document is not visible. */
  addVersion(
    documentId: string,
    input: DocumentVersionCreate,
  ): Promise<{ document: Document; upload: PendingUpload } | null>;
  update(id: string, expectedVersion: number, patch: DocumentUpdate): Promise<Document | null>;
}

export interface StoredAsset {
  readonly id: string;
  readonly storageKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly scanStatus: ScanStatus;
}

export interface AssetRepository {
  /** Null when the asset is not visible (unknown, other SIS or not authorized). */
  get(id: string): Promise<StoredAsset | null>;
}

/** Enqueues a job in the same transaction as the business change (transactional outbox). */
export interface JobScheduler {
  enqueue(type: string, payload: Record<string, unknown>, idempotencyKey: string): Promise<string>;
}

/**
 * Members of the current SIS. Writes go through database functions that
 * re-check member:manage and the anti-escalation rules (no self-change,
 * grantable roles only, at least one administrator left).
 */
export interface MemberRepository {
  list(): Promise<Member[]>;
  /**
   * Attaches the person to the SIS with the given roles. Without an identity
   * subject, only an existing account is attached: null means the address
   * has no account yet (the identity must be created first).
   */
  add(input: MemberInvite, identitySubject: string | null): Promise<Member | null>;
  update(id: string, expectedVersion: number, patch: MemberUpdate): Promise<Member | null>;
}

/** Plans of the sites and their background revisions. */
export interface PlanRepository {
  /** Null when the site is not visible. */
  listBySite(siteId: string): Promise<Plan[] | null>;
  get(id: string): Promise<Plan | null>;
  /** Creates the plan, its revision 1 and the pending background. Null when the site or level is not visible. */
  create(siteId: string, input: PlanCreate): Promise<{ plan: Plan; upload: PendingUpload } | null>;
  /** New current revision; previous ones are kept. Null when the plan is not visible. */
  addRevision(planId: string, input: PlanRevisionCreate): Promise<{ plan: Plan; upload: PendingUpload } | null>;
  update(id: string, expectedVersion: number, patch: PlanUpdate): Promise<Plan | null>;
}

/** Operational objects of the sites (placed on the map; plans come with the ETARE editor). */
export interface OperationalObjectRepository {
  /** Catalogue visible in the SIS: global types and its own. */
  types(): Promise<ObjectType[]>;
  type(id: string): Promise<ObjectType | null>;
  /** Null when the site is not visible. */
  listBySite(siteId: string): Promise<OperationalObject[] | null>;
  get(id: string): Promise<OperationalObject | null>;
  /** Null when the site is not visible. */
  create(siteId: string, input: OperationalObjectCreate): Promise<OperationalObject | null>;
  update(id: string, expectedVersion: number, patch: OperationalObjectUpdate): Promise<OperationalObject | null>;
  /** Building footprints and exterior objects within a small extent (map details). */
  mapFeatures(query: MapFeaturesQuery): Promise<MapFeaturesResponse>;
}

/** Address search (geocoding). Called outside any database transaction: it is a remote service. */
export interface Geocoder {
  search(text: string, limit: number): Promise<AddressCandidate[]>;
  reverse(lon: number, lat: number): Promise<AddressCandidate | null>;
  /** Attribution to display with the results. */
  attribution(): string;
}

/** Administration of the identity provider (server-side secret, never exposed to clients). */
export interface IdentityProvisioner {
  /**
   * Creates the identity and sends the invitation e-mail. When the address
   * already has an identity, returns it without sending anything.
   */
  invite(email: string, displayName: string | null): Promise<{ subject: string; invitationSent: boolean }>;
}

/** Business events (download, export...) stamped with the verified request context. */
export interface AuditRecorder {
  record(action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>): Promise<void>;
}

/** Object storage for the API (Supabase Storage at MVP, S3-compatible later). */
export interface ObjectStorage {
  /** Short-lived URL for an object the caller has ALREADY been authorized to read. */
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<{ url: string; expiresAt: Date }>;
  /** URL to upload one object into the quarantine area. */
  createUploadUrl(
    key: string,
    contentType: string,
  ): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }>;
}

/** Object storage for the worker, which verifies and promotes quarantined files. */
export interface ObjectStoreAdmin {
  download(key: string): Promise<Uint8Array | null>;
  copy(from: string, to: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Stores a file produced or checked server-side (worker outputs, local demo assets). */
  upload(key: string, content: Uint8Array, contentType: string, options?: { upsert?: boolean }): Promise<void>;
}

export interface AssetForVerification {
  readonly tenantId: string;
  readonly storageKey: string;
  readonly quarantineKey: string | null;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly scanStatus: ScanStatus;
}

/** Worker-side access to the verification state (dedicated database functions). */
export interface AssetVerificationStore {
  get(assetId: string): Promise<AssetForVerification | null>;
  complete(assetId: string, verdict: 'clean' | 'rejected', detail: Record<string, unknown>): Promise<boolean>;
}

/** Antivirus engine (ClamAV or a provider later). */
export interface MalwareScanner {
  scan(
    content: Uint8Array,
  ): Promise<{ verdict: 'clean' | 'infected' | 'not_scanned'; engine: string; signature?: string }>;
}
