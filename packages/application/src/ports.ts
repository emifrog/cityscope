import type { BasemapRepository, DistributedBasemap } from './basemaps';
import type {
  AccountSession,
  CatalogBasemap,
  RecoveryCodesState,
  SecuritySettings,
  CatalogWithdrawal,
  PublicationSummary,
  EtareDossierList,
  EtareDossierListQuery,
  Notification,
  NotificationListQuery,
  Contribution,
  ContributionCreate,
  ContributionListQuery,
  ContributionUpdate,
  PortalContribution,
  MyPortalInvitation,
  PortalInvitation,
  PortalSettings,
  PortalSite,
  PortalSiteSummary,
  AddressCandidate,
  Building,
  Document,
  DocumentCreate,
  DocumentUpdate,
  DocumentVersionCreate,
  EtareOverview,
  EtareRevision,
  EtareSnapshot,
  BuildingCreate,
  CatalogEntry,
  Device,
  DeviceEnrollment,
  Signature,
  SignedKeyset,
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
  MemberPerimeterInput,
  MemberSensitiveAccessInput,
  MemberUpdate,
  AccessAction,
  AccessEventList,
  AccessEventListQuery,
  Sector,
  SectorCommuneList,
  SectorList,
  SectorSave,
  SiteCreate,
  SiteDetail,
  SiteListQuery,
  SiteListResponse,
  SiteUpdate,
  ValidationQueueItem,
  FieldReport,
  FieldReportListQuery,
  FieldReportSubmit,
  FieldReportUpdate,
  SyncReportStatus,
} from '@etare/contracts';
import type {
  DevicePlatform,
  DeviceStatus,
  OptionalSection,
  Permission,
  PortalAccessState,
  RequestContext,
  ResolvedAccess,
  ScanStatus,
  Sensitivity,
  SignatureContext,
  Keyset,
} from '@etare/domain';

/**
 * A request session: one database transaction carrying the verified request
 * context (user, tenant, assurance level, trace id). Every repository used
 * inside it is bound to that transaction, so RLS applies to each query.
 */
export interface RequestSession {
  readonly access: ResolvedAccess;
  /**
   * Records that the signature of the terminal named by the request was verified.
   * A session opened for a terminal request refuses to commit without it.
   */
  confirmDeviceProof(): void;
  readonly identity: IdentityReader;
  readonly account: AccountRepository;
  readonly security: SecuritySettingsRepository;
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
  readonly sectors: SectorRepository;
  readonly basemaps: BasemapRepository;
  readonly fieldReports: FieldReportRepository;
  readonly portal: PortalAccessRepository;
  readonly contributions: ContributionRepository;
  readonly notifications: NotificationRepository;
  readonly jobs: JobScheduler;
  readonly audit: AuditRecorder;
  readonly accessJournal: AccessJournal;
}

/**
 * Journal of the accesses to sensitive sites (PER-02): only sensitive sites are
 * written, web views of one person on one site counted once per five minutes,
 * tablet events once by their identifier.
 */
export interface AccessJournal {
  /** Returns the effective sensitivity of the site (null: unknown in the SIS). */
  record(
    siteId: string,
    publicationId: string | null,
    action: AccessAction,
    device?: { readonly deviceId: string; readonly clientEventId?: string; readonly occurredAt?: Date },
  ): Promise<Sensitivity | null>;
  /** audit:read; newest first. */
  list(query: AccessEventListQuery): Promise<AccessEventList>;
  /** May the caller export (PDF) this version? A sensitive site needs its back-office roles or a habilitation. */
  exportAllowed(publicationId: string): Promise<boolean>;
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
  /** True when the permission is held on part of the SIS only (sectors or sites, PER-01). */
  holdsOnPart(permission: Permission): Promise<boolean>;
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
  /** Archives the site and its dossier (MET-04); the database refuses while a version is in force or pending. */
  archive(id: string, expectedVersion: number, reason: string): Promise<SiteDetail | null>;
  restore(id: string, expectedVersion: number): Promise<SiteDetail | null>;
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

/** Rate limiting shared by the instances (SEC-03); a hit counts even when the request then fails. */
export interface RateLimiter {
  /** One hit on a hashed key: allowed or not, hits in the window, seconds before the window ends. */
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; hits: number; retryAfter: number }>;
}

/** A sensitive refusal (second factor, permission, terminal proof, rate limit...), traced on its own. */
export interface SecurityEvent {
  readonly action: string;
  readonly reason: string;
  readonly principal: { readonly provider: string; readonly subject: string } | null;
  readonly tenantId: string | null;
  readonly traceId: string | null;
  readonly origin: string;
  readonly metadata: Record<string, unknown>;
}

export interface SecurityEventRecorder {
  record(event: SecurityEvent): Promise<void>;
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
  /** Reduced images (320 and 1 280 px, WebP) of a clean image, once computed by the worker. */
  readonly thumbnailKey?: string | null;
  readonly previewKey?: string | null;
  /** Site the file belongs to (null for a file of no site). */
  readonly siteId?: string | null;
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
  /** Limits the roles of a member to sectors and sites (both empty: the whole SIS). */
  setPerimeter(id: string, expectedVersion: number, input: MemberPerimeterInput): Promise<Member | null>;
  /** Grants (dated) or revokes the habilitation to the sensitive sites (PER-02). */
  setSensitiveAccess(id: string, expectedVersion: number, input: MemberSensitiveAccessInput): Promise<Member | null>;
  /** Removes the second factor of a member (and their sessions); a new one is then required. */
  resetSecondFactor(id: string, expectedVersion: number): Promise<Member | null>;
}

/** Sessions of the caller at the identity provider (Mon compte). */
export interface AccountRepository {
  sessions(): Promise<AccountSession[]>;
  /** Closes one session of the caller, or every other session when null; returns how many. */
  revoke(sessionId: string | null): Promise<number>;
  recoveryCodes(): Promise<RecoveryCodesState>;
  /** Replaces the codes of the caller (second factor in use); the only time they are readable. */
  regenerateRecoveryCodes(): Promise<string[]>;
  /** Uses a recovery code: the second factor is removed and a new one required (throws when invalid). */
  useRecoveryCode(code: string): Promise<void>;
}

/** Second-factor policy of the current SIS (null: not visible to the caller). */
export interface SecuritySettingsRepository {
  get(): Promise<SecuritySettings | null>;
  update(settings: SecuritySettings): Promise<SecuritySettings>;
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
  /** Dossiers of the SIS (archived sites excepted), by name, with counts over the whole SIS. */
  dossiers(query: EtareDossierListQuery): Promise<EtareDossierList>;
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
  /** Withdraws the version in force (MET-04); Conflict when it is not the one in force. */
  withdraw(id: string, expectedVersion: number, reason: string): Promise<PublicationSummary | null>;
  /** Optional sections hidden by the SIS (DEC-05), in the order of the registry. */
  layoutSettings(): Promise<OptionalSection[]>;
  /** catalog:manage; audited. Returns the stored setting. */
  updateLayoutSettings(hidden: readonly OptionalSection[]): Promise<OptionalSection[]>;
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
/** What an inviter asks for (dates already resolved by the use case). */
export interface PortalInviteInput {
  readonly email: string;
  readonly displayName: string | null;
  readonly organization: string | null;
  readonly siteIds: readonly string[];
  readonly expiresAt: Date;
  readonly accessUntil: Date | null;
}

/** Exploitant access to the portal of a SIS (POR-01, ADR-019). */
export interface PortalAccessRepository {
  /** Invitations of the current SIS (RLS: portal:invite). */
  listInvitations(): Promise<PortalInvitation[]>;
  getInvitation(id: string): Promise<PortalInvitation | null>;
  /**
   * Invites on sites of the current SIS. Null when the address has no account
   * and no identity is given: the identity is provisioned first.
   */
  invite(
    input: PortalInviteInput,
    authSubject: string | null,
  ): Promise<{ invitationId: string; accountCreated: boolean } | null>;
  revoke(id: string, expectedVersion: number, reason: string): Promise<PortalInvitation>;
  /** Pending invitations of the caller, in every SIS (no tenant context). */
  myInvitations(): Promise<MyPortalInvitation[]>;
  /** Accepts an invitation of the caller; returns its SIS. */
  accept(id: string): Promise<string>;
  /** Null when the caller may not read them. */
  settings(): Promise<PortalSettings | null>;
  updateSettings(settings: PortalSettings): Promise<PortalSettings>;
  accessState(): Promise<PortalAccessState>;
  /** Notifies an invitation to an existing account (once; the e-mail is sent by the worker). */
  notifyInvitation(id: string): Promise<void>;
  /** Sites open to the caller, with their published version (POR-02). */
  sites(): Promise<PortalSiteSummary[]>;
  /** Whitelist of the published version of a site; null when it is not open to the caller. */
  site(id: string): Promise<PortalSite | null>;
  /** File of a published document shown to the exploitant; null otherwise. */
  documentFile(siteId: string, documentId: string): Promise<StoredAsset | null>;
}

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
/**
 * Antivirus (SEC-01). `unscannable`: the engine refuses the file (e.g. above its
 * stream limit), which is then rejected; an unavailable engine throws, so the
 * job is retried and the file stays in quarantine. `not_scanned` is only
 * accepted in development (the worker requires an engine elsewhere).
 */
export interface MalwareScanner {
  scan(content: Uint8Array): Promise<{
    verdict: 'clean' | 'infected' | 'unscannable' | 'not_scanned';
    engine: string;
    signature?: string;
  }>;
}

/**
 * Ed25519 signer of distributed content: publication key (worker) or catalogue key
 * (API), held in the process (secret file) or by a Transit engine (SEC-04, ADR-027).
 */
export interface ContentSigner {
  /** Signs the context line followed by the content (canonical JSON). */
  sign(context: SignatureContext, content: string): Promise<Signature>;
}

/** A signer whose key is known: the worker re-signs what this key has not signed yet. */
export interface IdentifiedSigner extends ContentSigner {
  readonly keyId: string;
  /** Raw Ed25519 public key (32 bytes, base64). */
  readonly publicKey: string;
}

/** The key set of the platform as configured (SEC-04, ADR-027): the signed envelope and its content. */
export interface LoadedKeyset {
  readonly signed: SignedKeyset;
  readonly keyset: Keyset;
}

/** Checks the signature of a terminal with its raw public key. */
export interface DeviceSignatureVerifier {
  verify(publicKey: string, text: string, signature: string): boolean;
}

/** A publication as distributed to terminals: signed manifest and data, as built by the worker. */
export interface DistributedPackage {
  readonly siteId: string;
  readonly manifest: unknown;
  readonly manifestHash: string;
  /** Signature made at build time, then re-signatures after rotations (SEC-04), oldest first. */
  readonly signatures: readonly Signature[];
  readonly payload: unknown;
}

/**
 * Terminals of the current SIS. The administration reads under RLS
 * (device:manage); enrollment and synchronization go through database
 * functions that re-check offline:download and the terminal (ADR-015).
 */
/** A report as recorded, with the hash of the content the server accepted. */
export interface SubmittedReport {
  readonly reportId: string;
  /** False when the same report had already been received (replay). */
  readonly created: boolean;
  readonly contentHash: string;
  readonly receivedAt: string;
}

/** A photo of a report and the state of its file (quarantine key while pending). */
export interface ReportPhotoFile {
  readonly assetId: string;
  readonly quarantineKey: string | null;
  readonly mimeType: string;
  readonly sha256: string;
  readonly scanStatus: 'pending' | 'clean' | 'rejected';
}

/**
 * Field reports (OPS-04, ADR-017). Terminal operations go through PostgreSQL
 * functions that re-check the terminal, offline:download and
 * field_report:create; the instruction runs under RLS (field_report:review).
 */
export interface FieldReportRepository {
  /** Records the report once per terminal identifier; a replay returns the same report. */
  submit(deviceId: string, tenantId: string, input: FieldReportSubmit): Promise<SubmittedReport>;
  photos(deviceId: string, reportId: string): Promise<ReportPhotoFile[]>;
  /** Plans the verification of the photos still waiting; returns how many. */
  uploaded(deviceId: string, reportId: string): Promise<number>;
  /** Reports of the agent from this terminal (90 days), with their outcome. */
  forDevice(deviceId: string): Promise<SyncReportStatus[]>;
  list(query: FieldReportListQuery): Promise<{ items: FieldReport[]; nextCursor: string | null; openCount: number }>;
  get(id: string): Promise<FieldReport | null>;
  update(id: string, expectedVersion: number, patch: FieldReportUpdate): Promise<FieldReport | null>;
}

/** A file joined to a proposal and the state of its file (quarantine key while pending). */
export interface ContributionFile {
  readonly assetId: string;
  readonly quarantineKey: string | null;
  readonly mimeType: string;
  readonly sha256: string;
  readonly scanStatus: 'pending' | 'clean' | 'rejected';
}

/**
 * Proposals of the exploitants (POR-03/04, ADR-019). The exploitant goes
 * through PostgreSQL functions (their own proposals, on their sites); the
 * instruction runs under RLS (contribution:review).
 */
export interface ContributionRepository {
  /** Records a proposal of the caller on one of their sites; returns its identifier. */
  submit(siteId: string, tenantId: string, input: ContributionCreate): Promise<string>;
  files(id: string): Promise<ContributionFile[]>;
  /** Plans the verification of the files still waiting; returns how many. */
  uploaded(id: string): Promise<number>;
  /** Proposals of the caller, on one site or all of theirs. */
  mine(siteId: string | null): Promise<PortalContribution[]>;
  mineOne(id: string): Promise<PortalContribution | null>;
  reply(id: string, body: string): Promise<void>;
  withdraw(id: string): Promise<void>;
  list(query: ContributionListQuery): Promise<{ items: Contribution[]; nextCursor: string | null; openCount: number }>;
  get(id: string): Promise<Contribution | null>;
  /** Instruction; the message (question or note to the exploitant) is written first. */
  update(
    id: string,
    expectedVersion: number,
    patch: Omit<ContributionUpdate, 'message'>,
    message: { body: string; kind: 'message' | 'info_request' } | null,
  ): Promise<Contribution | null>;
}

/** Notifications of the SIS for its administration (RLS: member:manage). */
export interface NotificationRepository {
  list(query: NotificationListQuery): Promise<Notification[]>;
  get(id: string): Promise<Notification | null>;
  /** Plans the sending again (failed or sent notification). */
  retry(id: string): Promise<void>;
}

/** Sectors of the SIS (PER-01): administration only; writes through app.admin_* functions. */
export interface SectorRepository {
  list(): Promise<SectorList>;
  communes(): Promise<SectorCommuneList['items']>;
  /** Creates (id null) or updates a sector and replaces its communes and sites. */
  save(id: string | null, expectedVersion: number | null, input: SectorSave): Promise<Sector>;
  /** Archives a sector nobody uses; Conflict when members or terminals still do. */
  archive(id: string, expectedVersion: number): Promise<void>;
}

export interface DeviceRepository {
  list(): Promise<{ items: Device[]; currentGeneration: number; undistributedPublications: number }>;
  get(id: string): Promise<Device | null>;
  create(name: string, codeHash: string, expiresAt: Date): Promise<Device>;
  /** Assigns the terminal to sectors; none: the whole SIS (PER-01). */
  setPerimeter(id: string, expectedVersion: number, sectorIds: readonly string[]): Promise<Device>;
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
  ): Promise<{
    generation: number;
    tenantName: string;
    publications: CatalogEntry[];
    onDemand: CatalogEntry[];
    withdrawals: CatalogWithdrawal[];
  }>;
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
  /** Base maps in force for the sectors of the terminal (ADR-024). */
  basemaps(deviceId: string): Promise<CatalogBasemap[]>;
  /** Null when the base map is not (or no longer) in force for the terminal. */
  basemap(deviceId: string, packId: string): Promise<DistributedBasemap | null>;
  /** Storage keys of the requested parts of a base map in force, by hash. */
  basemapFiles(
    deviceId: string,
    packId: string,
    sha256: readonly string[],
  ): Promise<{ sha256: string; storageKey: string }[]>;
  /** Records the base maps complete on the terminal; returns how many it holds. */
  basemapReceipt(deviceId: string, packIds: readonly string[]): Promise<number>;
}
