import type {
  AddressCandidate,
  Building,
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentVersionCreate,
  EtareDossier,
  EtareOverview,
  EtareRevision,
  EtareSnapshot,
  BuildingCreate,
  CatalogEntry,
  Device,
  DeviceEnrollment,
  Signature,
  SyncReceipt,
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
  ObjectPhoto,
  ObjectPhotoCreate,
  ObjectPhotoUpdate,
  ObjectType,
  OperationalObject,
  OperationalObjectCreate,
  OperationalObjectUpdate,
  Plan,
  PlanCreate,
  PlanRevisionCreate,
  PlanUpdate,
  Risk,
  RiskCreate,
  RiskType,
  RiskTypeCreate,
  RiskTypeUpdate,
  RiskUpdate,
  Zone,
  ZoneCreate,
  ZoneUpdate,
  MeResponse,
  Member,
  MemberInvite,
  MemberUpdate,
  SiteCreate,
  SiteDetail,
  SiteListQuery,
  SiteListResponse,
  SiteUpdate,
  ValidationQueueItem,
} from '@etare/contracts';
import type {
  DevicePlatform,
  DeviceStatus,
  Permission,
  RequestContext,
  ResolvedAccess,
  ScanStatus,
  SignatureContext,
} from '@etare/domain';

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
  readonly zones: ZoneRepository;
  readonly risks: RiskRepository;
  readonly etare: EtareRepository;
  readonly devices: DeviceRepository;
  readonly jobs: JobScheduler;
  readonly audit: AuditRecorder;
}

export interface SessionOptions {
  readonly isolation?: 'repeatable_read';
}

export interface SessionFactory {
  run<T>(context: RequestContext, work: (session: RequestSession) => Promise<T>, options?: SessionOptions): Promise<T>;
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

export interface RevisionRecord {
  readonly revision: EtareRevision;
  readonly siteName: string;
  /** Frozen snapshot (null while the revision is a draft). */
  readonly snapshot: unknown;
  /** Snapshot of the revision behind the base publication, to compare with. */
  readonly baseSnapshot: unknown;
  readonly contributors: readonly { readonly id: string; readonly name: string }[];
}

export interface PublicationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly etareNumber: string | null;
  readonly publicationNumber: number;
  readonly hasPdf: boolean;
  readonly pdfStorageKey: string | null;
}

/**
 * ETARE dossiers, revisions, decisions and publication requests. PostgreSQL
 * enforces the state machines, the frozen snapshot, the separation of duties
 * and the hash binding of decisions (ADR-005).
 */
export interface EtareRepository {
  /** Sites of the SIS (not archived) with their active publication and latest revision. */
  dossiers(): Promise<EtareDossier[]>;
  /** Null when the site is not visible. */
  overview(siteId: string): Promise<EtareOverview | null>;
  /** Opens a draft revision (and the dossier on first use). Null when the site is not visible. */
  createRevision(siteId: string, changeSummary: string | null): Promise<EtareRevision | null>;
  revision(id: string): Promise<RevisionRecord | null>;
  /** draft -> submitted with the frozen snapshot and its hash. */
  submit(
    id: string,
    expectedVersion: number,
    input: { readonly snapshot: EtareSnapshot; readonly contentHash: string; readonly changeSummary: string },
  ): Promise<EtareRevision | null>;
  /** Submitted revisions of the SIS, oldest first. */
  queue(): Promise<ValidationQueueItem[]>;
  /** Records the decision (append-only, bound to the hash) and moves the revision; returns the approval id. */
  decide(
    id: string,
    input: {
      readonly decision: 'approved' | 'changes_requested';
      readonly comment: string | null;
      readonly revisionHash: string;
    },
  ): Promise<string>;
  /** A publication visible to the caller (RLS: OPS only see the active ones). */
  publication(id: string): Promise<PublicationRecord | null>;
  /** Latest approval of an approved revision (to publish it again after a failed build). */
  approvalOf(revisionId: string): Promise<string | null>;
  /** Queues the publication of an approved revision; returns its id. */
  requestPublication(revisionId: string, approvalId: string): Promise<string>;
}

/** Zones of the levels, drawn on level plans. */
export interface ZoneRepository {
  /** Null when the site is not visible. */
  listBySite(siteId: string): Promise<Zone[] | null>;
  get(id: string): Promise<Zone | null>;
  /** Null when the site or the plan revision is not visible. */
  create(siteId: string, input: ZoneCreate): Promise<Zone | null>;
  update(id: string, expectedVersion: number, patch: ZoneUpdate): Promise<Zone | null>;
}

/** Risk catalogue (national and SIS entries) and risk occurrences of the sites. */
export interface RiskRepository {
  /** National types and those of the SIS; deprecated SIS types only when asked. */
  types(options?: { includeDeprecated?: boolean }): Promise<RiskType[]>;
  type(id: string): Promise<RiskType | null>;
  createType(input: RiskTypeCreate & { properties_schema: Record<string, unknown> }): Promise<RiskType>;
  updateType(
    id: string,
    expectedVersion: number,
    patch: Omit<RiskTypeUpdate, 'fields'> & { properties_schema?: Record<string, unknown> },
  ): Promise<RiskType | null>;
  /** Null when the site is not visible. */
  listBySite(siteId: string): Promise<Risk[] | null>;
  get(id: string): Promise<Risk | null>;
  /** Null when the site is not visible. */
  create(siteId: string, input: RiskCreate & { severity: number }): Promise<Risk | null>;
  update(id: string, expectedVersion: number, patch: RiskUpdate): Promise<Risk | null>;
}

/** Operational objects of the sites, placed on the map and/or on plans. */
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
  /** Declares a photo of a visible object, its file pending verification (PLAN-05). Null when the object is not visible. */
  createPhoto(
    objectId: string,
    input: ObjectPhotoCreate,
  ): Promise<{ photo: ObjectPhoto; upload: PendingUpload } | null>;
  updatePhoto(id: string, expectedVersion: number, patch: ObjectPhotoUpdate): Promise<ObjectPhoto | null>;
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

/** Ed25519 signer of distributed content: publication key (worker) or catalogue key (API). */
export interface ContentSigner {
  readonly keyId: string;
  /** Signs the context line followed by the content (canonical JSON). */
  sign(context: SignatureContext, content: string): Signature;
}

/** Checks the signature of a terminal with its raw public key. */
export interface DeviceSignatureVerifier {
  verify(publicKey: string, text: string, signature: string): boolean;
}

/** A publication as distributed to terminals: signed manifest and data, as built by the worker. */
export interface DistributedPackage {
  readonly manifest: unknown;
  readonly manifestHash: string;
  readonly signature: Signature;
  readonly payload: unknown;
}

/**
 * Terminals of the current SIS. The administration reads under RLS
 * (device:manage); enrollment and synchronization go through database
 * functions that re-check offline:download and the terminal (ADR-015).
 */
export interface DeviceRepository {
  list(): Promise<{ items: Device[]; currentGeneration: number; undistributedPublications: number }>;
  get(id: string): Promise<Device | null>;
  create(name: string, codeHash: string, expiresAt: Date): Promise<Device>;
  /** New code for a terminal waiting for its enrollment. */
  renewCode(id: string, expectedVersion: number, codeHash: string, expiresAt: Date): Promise<Device>;
  revoke(id: string, expectedVersion: number, reason: string): Promise<Device>;
  /** Consumes a valid code of the current SIS; throws when it is unknown, used or expired. */
  enroll(input: {
    readonly codeHash: string;
    readonly publicKey: string;
    readonly platform: DevicePlatform;
    readonly appVersion: string;
  }): Promise<DeviceEnrollment>;
  /** Status and key of a terminal of the current SIS (null when unknown). */
  syncDevice(id: string): Promise<{ status: DeviceStatus; publicKey: string | null } | null>;
  /** Distributable publications at the current generation; records the contact of the terminal. */
  catalog(
    deviceId: string,
    appVersion: string | null,
  ): Promise<{ generation: number; tenantName: string; publications: CatalogEntry[] }>;
  /** Null when the publication is not (or no longer) distributable. */
  package(deviceId: string, publicationId: string): Promise<DistributedPackage | null>;
  /** Storage keys of the requested files of a distributable publication, by hash. */
  packageFiles(
    deviceId: string,
    publicationId: string,
    sha256: readonly string[],
  ): Promise<{ sha256: string; storageKey: string }[]>;
  /** Records the receipt; returns the number of sites reported as installed. */
  receipt(deviceId: string, receipt: SyncReceipt): Promise<number>;
}
