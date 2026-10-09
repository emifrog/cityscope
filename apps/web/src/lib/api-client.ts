import {
  API_BASE_PATH,
  TENANT_HEADER,
  apiErrorSchema,
  endpoints,
  type AccountSession,
  type RecoveryCodeUse,
  type RecoveryCodes,
  type RecoveryCodesState,
  type SecondFactorRecovery,
  type SecuritySettings,
  type SessionRevocation,
  type AddressCandidates,
  type ApiErrorCode,
  type Building,
  type BuildingCreate,
  type BuildingUpdate,
  type Classification,
  type ClassificationCreate,
  type ClassificationUpdate,
  type Contact,
  type ContactCreateInput,
  type ContactUpdate,
  type AssetDownload,
  type Document,
  type DocumentCreateInput,
  type DocumentUpdate,
  type DocumentUploadResponse,
  type DocumentVersionCreate,
  type EtareDossierList,
  type EtareDossierListQuery,
  type EtareOverview,
  type PublicationSummary,
  type PublicationWithdraw,
  type SiteArchive,
  type EtarePreview,
  type EtareRevision,
  type ExternalId,
  type ExternalIdCreate,
  type Contribution,
  type ContributionCreateInput,
  type ContributionList,
  type ContributionListQuery,
  type ContributionReceipt,
  type ContributionUpdate,
  type ContributionUploaded,
  type PortalContribution,
  type Notification,
  type NotificationListQuery,
  type FieldReport,
  type FieldReportList,
  type FieldReportListQuery,
  type FieldReportUpdate,
  type Level,
  type LevelCreate,
  type LevelUpdate,
  type MapCatalog,
  type MapFeaturesResponse,
  type MapSitesQuery,
  type MapSitesResponse,
  type MeResponse,
  type MyPortalInvitation,
  type PortalAccess,
  type PortalInvitation,
  type PortalInvitationAccepted,
  type PortalInvitationCreate,
  type PortalInvitationCreated,
  type PortalInvitationRevoke,
  type PortalSettings,
  type EtareLayoutSettings,
  type PortalSite,
  type PortalSiteSummary,
  type Device,
  type DeviceCreate,
  type DeviceEnrollmentCode,
  type DeviceList,
  type TerminalPolicySettings,
  type DeviceRevoke,
  type DevicePerimeterInput,
  type MemberPerimeterInput,
  type MemberSensitiveAccessInput,
  type AccessEventList,
  type BasemapOverview,
  type TenantSupervision,
  type AccessEventListQuery,
  type Sector,
  type SectorCommuneList,
  type SectorList,
  type SectorSave,
  type Member,
  type MemberInvitation,
  type MemberInvite,
  type MemberUpdate,
  type SiteCreateInput,
  type SiteDetail,
  type SiteListQuery,
  type SiteListResponse,
  type SiteUpdate,
  type ObjectType,
  type ObjectPhoto,
  type ObjectPhotoCreate,
  type ObjectPhotoUpdate,
  type ObjectPhotoUpload,
  type OperationalObject,
  type OperationalObjectCreateInput,
  type OperationalObjectUpdate,
  type Plan,
  type PlanCreateInput,
  type PlanRevisionCreateInput,
  type PlanUpdate,
  type PlanUploadResponse,
  type RevisionCreate,
  type RevisionDecisionInput,
  type RevisionDetail,
  type RevisionSubmit,
  type Risk,
  type RiskCreateInput,
  type RiskType,
  type RiskTypeCreateInput,
  type RiskTypeUpdate,
  type RiskUpdate,
  type Substance,
  type SubstanceCreateInput,
  type SubstanceUpdate,
  type UploadConfirmation,
  type ValidationQueueItem,
  type Zone,
  type ZoneCreate,
  type ZoneUpdate,
} from '@etare/contracts';
import type { z } from 'zod';

/** Error returned by the product API, with its stable code and trace id (for support). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly traceId: string | null,
    readonly fields: readonly { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiCallOptions {
  readonly token: string;
  readonly tenantId?: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

interface RequestSpec {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly body?: unknown;
  /** Version the change is based on (optimistic concurrency). */
  readonly ifMatch?: number;
}

async function call<T extends z.ZodType>(
  schema: T,
  path: string,
  options: ApiCallOptions,
  spec: RequestSpec = {},
): Promise<z.infer<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(spec.query ?? {})) {
    if (value !== undefined) search.set(key, String(value));
  }
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${options.token}`,
    'x-client-platform': 'web',
  };
  if (options.tenantId) headers[TENANT_HEADER] = options.tenantId;
  if (spec.body !== undefined) headers['content-type'] = 'application/json';
  if (spec.ifMatch !== undefined) headers['if-match'] = `"${spec.ifMatch}"`;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${API_BASE_PATH}${path}${search.size ? `?${search}` : ''}`, {
      method: spec.method ?? 'GET',
      headers,
      cache: 'no-store',
      ...(spec.body !== undefined ? { body: JSON.stringify(spec.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new ApiRequestError(0, 'INTERNAL', 'Le service est injoignable. Vérifiez votre connexion.', null);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, trace_id, fields } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, trace_id, fields ?? []);
    }
    throw new ApiRequestError(response.status, 'INTERNAL', 'Réponse inattendue du service.', null);
  }
  return schema.parse(body);
}

function pathOf(template: string, params: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => encodeURIComponent(params[name] ?? ''));
}

const itemsOf = async <T>(promise: Promise<{ items: T[] }>) => (await promise).items;

/** Typed client of the product API, driven by the shared contracts. */
export const api = {
  getMe: (options: ApiCallOptions): Promise<MeResponse> =>
    call(endpoints.getMe.response, endpoints.getMe.path, options),

  listMySessions: (options: ApiCallOptions): Promise<AccountSession[]> =>
    itemsOf(call(endpoints.listMySessions.response, endpoints.listMySessions.path, options)),

  revokeMySession: (options: ApiCallOptions, id: string): Promise<SessionRevocation> =>
    call(endpoints.revokeMySession.response, pathOf(endpoints.revokeMySession.path, { id }), options, {
      method: 'POST',
    }),

  getMyRecoveryCodes: (options: ApiCallOptions): Promise<RecoveryCodesState> =>
    call(endpoints.getMyRecoveryCodes.response, endpoints.getMyRecoveryCodes.path, options),

  regenerateMyRecoveryCodes: (options: ApiCallOptions): Promise<RecoveryCodes> =>
    call(endpoints.regenerateMyRecoveryCodes.response, endpoints.regenerateMyRecoveryCodes.path, options, {
      method: 'POST',
    }),

  recoverSecondFactor: (options: ApiCallOptions, input: RecoveryCodeUse): Promise<SecondFactorRecovery> =>
    call(endpoints.recoverSecondFactor.response, endpoints.recoverSecondFactor.path, options, {
      method: 'POST',
      body: input,
    }),

  resetMemberSecondFactor: (options: ApiCallOptions, id: string, version: number): Promise<Member> =>
    call(endpoints.resetMemberSecondFactor.response, pathOf(endpoints.resetMemberSecondFactor.path, { id }), options, {
      method: 'POST',
      ifMatch: version,
    }),

  revokeMyOtherSessions: (options: ApiCallOptions): Promise<SessionRevocation> =>
    call(endpoints.revokeMyOtherSessions.response, endpoints.revokeMyOtherSessions.path, options, { method: 'POST' }),

  getSecuritySettings: (options: ApiCallOptions): Promise<SecuritySettings> =>
    call(endpoints.getSecuritySettings.response, endpoints.getSecuritySettings.path, options),

  updateSecuritySettings: (options: ApiCallOptions, input: SecuritySettings): Promise<SecuritySettings> =>
    call(endpoints.updateSecuritySettings.response, endpoints.updateSecuritySettings.path, options, {
      method: 'PUT',
      body: input,
    }),

  // ---------------------------------------------------------------- map
  getMapCatalog: (options: ApiCallOptions): Promise<MapCatalog> =>
    call(endpoints.getMapCatalog.response, endpoints.getMapCatalog.path, options),

  listMapSites: (options: ApiCallOptions, query: Partial<MapSitesQuery> = {}): Promise<MapSitesResponse> =>
    call(endpoints.listMapSites.response, endpoints.listMapSites.path, options, { query }),

  /** Building footprints and operational points of a small extent (close zoom). */
  listMapFeatures: (options: ApiCallOptions, bbox: string): Promise<MapFeaturesResponse> =>
    call(endpoints.listMapFeatures.response, endpoints.listMapFeatures.path, options, { query: { bbox } }),

  /** Address search through the server (IGN geocoder). */
  searchAddresses: (options: ApiCallOptions, q: string, limit = 5): Promise<AddressCandidates> =>
    call(endpoints.searchAddresses.response, endpoints.searchAddresses.path, options, { query: { q, limit } }),

  reverseGeocode: (options: ApiCallOptions, lon: number, lat: number): Promise<AddressCandidates> =>
    call(endpoints.reverseGeocode.response, endpoints.reverseGeocode.path, options, { query: { lon, lat } }),

  // ---------------------------------------------------------------- sites
  listSites: (options: ApiCallOptions, query: Partial<SiteListQuery> = {}): Promise<SiteListResponse> =>
    call(endpoints.listSites.response, endpoints.listSites.path, options, { query }),

  getSite: (options: ApiCallOptions, id: string): Promise<SiteDetail> =>
    call(endpoints.getSite.response, pathOf(endpoints.getSite.path, { id }), options),

  createSite: (options: ApiCallOptions, input: SiteCreateInput): Promise<SiteDetail> =>
    call(endpoints.createSite.response, endpoints.createSite.path, options, { method: 'POST', body: input }),

  updateSite: (options: ApiCallOptions, id: string, version: number, patch: SiteUpdate): Promise<SiteDetail> =>
    call(endpoints.updateSite.response, pathOf(endpoints.updateSite.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- buildings and levels
  listBuildings: (options: ApiCallOptions, siteId: string): Promise<Building[]> =>
    itemsOf(call(endpoints.listBuildings.response, pathOf(endpoints.listBuildings.path, { id: siteId }), options)),

  createBuilding: (options: ApiCallOptions, siteId: string, input: BuildingCreate): Promise<Building> =>
    call(endpoints.createBuilding.response, pathOf(endpoints.createBuilding.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  updateBuilding: (options: ApiCallOptions, id: string, version: number, patch: BuildingUpdate): Promise<Building> =>
    call(endpoints.updateBuilding.response, pathOf(endpoints.updateBuilding.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  createLevel: (options: ApiCallOptions, buildingId: string, input: LevelCreate): Promise<Level> =>
    call(endpoints.createLevel.response, pathOf(endpoints.createLevel.path, { id: buildingId }), options, {
      method: 'POST',
      body: input,
    }),

  updateLevel: (options: ApiCallOptions, id: string, version: number, patch: LevelUpdate): Promise<Level> =>
    call(endpoints.updateLevel.response, pathOf(endpoints.updateLevel.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- classifications
  listClassifications: (options: ApiCallOptions, siteId: string): Promise<Classification[]> =>
    itemsOf(
      call(endpoints.listClassifications.response, pathOf(endpoints.listClassifications.path, { id: siteId }), options),
    ),

  createClassification: (
    options: ApiCallOptions,
    siteId: string,
    input: ClassificationCreate,
  ): Promise<Classification> =>
    call(
      endpoints.createClassification.response,
      pathOf(endpoints.createClassification.path, { id: siteId }),
      options,
      {
        method: 'POST',
        body: input,
      },
    ),

  updateClassification: (
    options: ApiCallOptions,
    id: string,
    version: number,
    patch: ClassificationUpdate,
  ): Promise<Classification> =>
    call(endpoints.updateClassification.response, pathOf(endpoints.updateClassification.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- contacts
  listContacts: (options: ApiCallOptions, siteId: string): Promise<Contact[]> =>
    itemsOf(call(endpoints.listContacts.response, pathOf(endpoints.listContacts.path, { id: siteId }), options)),

  createContact: (options: ApiCallOptions, siteId: string, input: ContactCreateInput): Promise<Contact> =>
    call(endpoints.createContact.response, pathOf(endpoints.createContact.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  updateContact: (options: ApiCallOptions, id: string, version: number, patch: ContactUpdate): Promise<Contact> =>
    call(endpoints.updateContact.response, pathOf(endpoints.updateContact.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- external identifiers
  listExternalIds: (options: ApiCallOptions, siteId: string): Promise<ExternalId[]> =>
    itemsOf(call(endpoints.listExternalIds.response, pathOf(endpoints.listExternalIds.path, { id: siteId }), options)),

  createExternalId: (options: ApiCallOptions, siteId: string, input: ExternalIdCreate): Promise<ExternalId> =>
    call(endpoints.createExternalId.response, pathOf(endpoints.createExternalId.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  // ---------------------------------------------------------------- operational objects
  listObjectTypes: (options: ApiCallOptions): Promise<ObjectType[]> =>
    itemsOf(call(endpoints.listObjectTypes.response, endpoints.listObjectTypes.path, options)),

  listSiteObjects: (options: ApiCallOptions, siteId: string): Promise<OperationalObject[]> =>
    itemsOf(call(endpoints.listSiteObjects.response, pathOf(endpoints.listSiteObjects.path, { id: siteId }), options)),

  createSiteObject: (
    options: ApiCallOptions,
    siteId: string,
    input: OperationalObjectCreateInput,
  ): Promise<OperationalObject> =>
    call(endpoints.createSiteObject.response, pathOf(endpoints.createSiteObject.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  updateObject: (
    options: ApiCallOptions,
    id: string,
    version: number,
    patch: OperationalObjectUpdate,
  ): Promise<OperationalObject> =>
    call(endpoints.updateObject.response, pathOf(endpoints.updateObject.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  /** Declares a photo of an object; the answer carries the signed upload URL (PLAN-05). */
  createObjectPhoto: (
    options: ApiCallOptions,
    objectId: string,
    input: ObjectPhotoCreate,
  ): Promise<ObjectPhotoUpload> =>
    call(endpoints.createObjectPhoto.response, pathOf(endpoints.createObjectPhoto.path, { id: objectId }), options, {
      method: 'POST',
      body: input,
    }),

  updateObjectPhoto: (
    options: ApiCallOptions,
    id: string,
    version: number,
    patch: ObjectPhotoUpdate,
  ): Promise<ObjectPhoto> =>
    call(endpoints.updateObjectPhoto.response, pathOf(endpoints.updateObjectPhoto.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- plans
  listSitePlans: (options: ApiCallOptions, siteId: string): Promise<Plan[]> =>
    itemsOf(call(endpoints.listSitePlans.response, pathOf(endpoints.listSitePlans.path, { id: siteId }), options)),

  /** Declares the plan and its first background; the answer carries the signed upload URL. */
  createPlan: (options: ApiCallOptions, siteId: string, input: PlanCreateInput): Promise<PlanUploadResponse> =>
    call(endpoints.createPlan.response, pathOf(endpoints.createPlan.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  createPlanRevision: (
    options: ApiCallOptions,
    planId: string,
    input: PlanRevisionCreateInput,
  ): Promise<PlanUploadResponse> =>
    call(endpoints.createPlanRevision.response, pathOf(endpoints.createPlanRevision.path, { id: planId }), options, {
      method: 'POST',
      body: input,
    }),

  updatePlan: (options: ApiCallOptions, id: string, version: number, patch: PlanUpdate): Promise<Plan> =>
    call(endpoints.updatePlan.response, pathOf(endpoints.updatePlan.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  listSiteZones: (options: ApiCallOptions, siteId: string): Promise<Zone[]> =>
    itemsOf(call(endpoints.listSiteZones.response, pathOf(endpoints.listSiteZones.path, { id: siteId }), options)),

  createZone: (options: ApiCallOptions, siteId: string, input: ZoneCreate): Promise<Zone> =>
    call(endpoints.createZone.response, pathOf(endpoints.createZone.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  updateZone: (options: ApiCallOptions, id: string, version: number, patch: ZoneUpdate): Promise<Zone> =>
    call(endpoints.updateZone.response, pathOf(endpoints.updateZone.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- ETARE workflow
  listEtareDossiers: (options: ApiCallOptions, query: Partial<EtareDossierListQuery> = {}): Promise<EtareDossierList> =>
    call(endpoints.listEtareDossiers.response, endpoints.listEtareDossiers.path, options, { query }),

  withdrawPublication: (
    options: ApiCallOptions,
    id: string,
    version: number,
    input: PublicationWithdraw,
  ): Promise<PublicationSummary> =>
    call(endpoints.withdrawPublication.response, pathOf(endpoints.withdrawPublication.path, { id }), options, {
      method: 'POST',
      body: input,
      ifMatch: version,
    }),

  archiveSite: (options: ApiCallOptions, id: string, version: number, input: SiteArchive): Promise<SiteDetail> =>
    call(endpoints.archiveSite.response, pathOf(endpoints.archiveSite.path, { id }), options, {
      method: 'POST',
      body: input,
      ifMatch: version,
    }),

  restoreSite: (options: ApiCallOptions, id: string, version: number): Promise<SiteDetail> =>
    call(endpoints.restoreSite.response, pathOf(endpoints.restoreSite.path, { id }), options, {
      method: 'POST',
      ifMatch: version,
    }),

  getSiteEtare: (options: ApiCallOptions, siteId: string): Promise<EtareOverview> =>
    call(endpoints.getSiteEtare.response, pathOf(endpoints.getSiteEtare.path, { id: siteId }), options),

  previewSiteEtare: (options: ApiCallOptions, siteId: string): Promise<EtarePreview> =>
    call(endpoints.previewSiteEtare.response, pathOf(endpoints.previewSiteEtare.path, { id: siteId }), options),

  createRevision: (options: ApiCallOptions, siteId: string, input: RevisionCreate): Promise<EtareRevision> =>
    call(endpoints.createRevision.response, pathOf(endpoints.createRevision.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  submitRevision: (
    options: ApiCallOptions,
    id: string,
    version: number,
    input: RevisionSubmit,
  ): Promise<EtareRevision> =>
    call(endpoints.submitRevision.response, pathOf(endpoints.submitRevision.path, { id }), options, {
      method: 'POST',
      body: input,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- exploitant access (POR-01)
  listPortalInvitations: (options: ApiCallOptions): Promise<PortalInvitation[]> =>
    itemsOf(call(endpoints.listPortalInvitations.response, endpoints.listPortalInvitations.path, options)),

  createPortalInvitation: (options: ApiCallOptions, input: PortalInvitationCreate): Promise<PortalInvitationCreated> =>
    call(endpoints.createPortalInvitation.response, endpoints.createPortalInvitation.path, options, {
      method: 'POST',
      body: input,
    }),

  revokePortalInvitation: (
    options: ApiCallOptions,
    id: string,
    version: number,
    input: PortalInvitationRevoke,
  ): Promise<PortalInvitation> =>
    call(endpoints.revokePortalInvitation.response, pathOf(endpoints.revokePortalInvitation.path, { id }), options, {
      method: 'POST',
      body: input,
      ifMatch: version,
    }),

  /** Pending invitations of the signed-in person, in every SIS (no active SIS needed). */
  listMyPortalInvitations: (options: ApiCallOptions): Promise<MyPortalInvitation[]> =>
    itemsOf(call(endpoints.listMyPortalInvitations.response, endpoints.listMyPortalInvitations.path, options)),

  acceptPortalInvitation: (options: ApiCallOptions, id: string): Promise<PortalInvitationAccepted> =>
    call(endpoints.acceptPortalInvitation.response, pathOf(endpoints.acceptPortalInvitation.path, { id }), options, {
      method: 'POST',
    }),

  getPortalSettings: (options: ApiCallOptions): Promise<PortalSettings> =>
    call(endpoints.getPortalSettings.response, endpoints.getPortalSettings.path, options),

  updatePortalSettings: (options: ApiCallOptions, input: PortalSettings): Promise<PortalSettings> =>
    call(endpoints.updatePortalSettings.response, endpoints.updatePortalSettings.path, options, {
      method: 'PUT',
      body: input,
    }),

  getEtareLayoutSettings: (options: ApiCallOptions): Promise<EtareLayoutSettings> =>
    call(endpoints.getEtareLayoutSettings.response, endpoints.getEtareLayoutSettings.path, options),

  updateEtareLayoutSettings: (options: ApiCallOptions, input: EtareLayoutSettings): Promise<EtareLayoutSettings> =>
    call(endpoints.updateEtareLayoutSettings.response, endpoints.updateEtareLayoutSettings.path, options, {
      method: 'PUT',
      body: input,
    }),

  getPortalAccess: (options: ApiCallOptions): Promise<PortalAccess> =>
    call(endpoints.getPortalAccess.response, endpoints.getPortalAccess.path, options),

  listPortalSites: (options: ApiCallOptions): Promise<PortalSiteSummary[]> =>
    itemsOf(call(endpoints.listPortalSites.response, endpoints.listPortalSites.path, options)),

  getPortalSite: (options: ApiCallOptions, id: string): Promise<PortalSite> =>
    call(endpoints.getPortalSite.response, pathOf(endpoints.getPortalSite.path, { id }), options),

  getPortalDocumentDownload: (options: ApiCallOptions, siteId: string, documentId: string): Promise<AssetDownload> =>
    call(
      endpoints.getPortalDocumentDownload.response,
      pathOf(endpoints.getPortalDocumentDownload.path, { id: siteId, document_id: documentId }),
      options,
    ),

  // ---------------------------------------------------------------- field reports (OPS-04)
  // ---------------------------------------------------------------- proposals of the exploitants (POR-03/04)
  createPortalContribution: (
    options: ApiCallOptions,
    siteId: string,
    input: ContributionCreateInput,
  ): Promise<ContributionReceipt> =>
    call(
      endpoints.createPortalContribution.response,
      pathOf(endpoints.createPortalContribution.path, { id: siteId }),
      options,
      { method: 'POST', body: input },
    ),

  confirmPortalContributionUploads: (options: ApiCallOptions, id: string): Promise<ContributionUploaded> =>
    call(
      endpoints.confirmPortalContributionUploads.response,
      pathOf(endpoints.confirmPortalContributionUploads.path, { id }),
      options,
      { method: 'POST' },
    ),

  listPortalContributions: (options: ApiCallOptions, query: { site_id?: string } = {}): Promise<PortalContribution[]> =>
    itemsOf(
      call(endpoints.listPortalContributions.response, endpoints.listPortalContributions.path, options, { query }),
    ),

  replyPortalContribution: (options: ApiCallOptions, id: string, body: string): Promise<PortalContribution> =>
    call(endpoints.replyPortalContribution.response, pathOf(endpoints.replyPortalContribution.path, { id }), options, {
      method: 'POST',
      body: { body },
    }),

  withdrawPortalContribution: (options: ApiCallOptions, id: string): Promise<PortalContribution> =>
    call(
      endpoints.withdrawPortalContribution.response,
      pathOf(endpoints.withdrawPortalContribution.path, { id }),
      options,
      { method: 'POST' },
    ),

  listContributions: (options: ApiCallOptions, query: Partial<ContributionListQuery> = {}): Promise<ContributionList> =>
    call(endpoints.listContributions.response, endpoints.listContributions.path, options, { query }),

  getContribution: (options: ApiCallOptions, id: string): Promise<Contribution> =>
    call(endpoints.getContribution.response, pathOf(endpoints.getContribution.path, { id }), options),

  updateContribution: (
    options: ApiCallOptions,
    id: string,
    version: number,
    patch: ContributionUpdate,
  ): Promise<Contribution> =>
    call(endpoints.updateContribution.response, pathOf(endpoints.updateContribution.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- notifications (POR-05)
  listNotifications: (options: ApiCallOptions, query: Partial<NotificationListQuery> = {}): Promise<Notification[]> =>
    itemsOf(call(endpoints.listNotifications.response, endpoints.listNotifications.path, options, { query })),

  retryNotification: (options: ApiCallOptions, id: string): Promise<Notification> =>
    call(endpoints.retryNotification.response, pathOf(endpoints.retryNotification.path, { id }), options, {
      method: 'POST',
    }),

  listFieldReports: (options: ApiCallOptions, query: Partial<FieldReportListQuery> = {}): Promise<FieldReportList> =>
    call(endpoints.listFieldReports.response, endpoints.listFieldReports.path, options, { query }),

  getFieldReport: (options: ApiCallOptions, id: string): Promise<FieldReport> =>
    call(endpoints.getFieldReport.response, pathOf(endpoints.getFieldReport.path, { id }), options),

  updateFieldReport: (
    options: ApiCallOptions,
    id: string,
    version: number,
    patch: FieldReportUpdate,
  ): Promise<FieldReport> =>
    call(endpoints.updateFieldReport.response, pathOf(endpoints.updateFieldReport.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  listValidations: (options: ApiCallOptions): Promise<ValidationQueueItem[]> =>
    itemsOf(call(endpoints.listValidations.response, endpoints.listValidations.path, options)),

  getRevision: (options: ApiCallOptions, id: string): Promise<RevisionDetail> =>
    call(endpoints.getRevision.response, pathOf(endpoints.getRevision.path, { id }), options),

  decideRevision: (options: ApiCallOptions, id: string, input: RevisionDecisionInput): Promise<EtareRevision> =>
    call(endpoints.decideRevision.response, pathOf(endpoints.decideRevision.path, { id }), options, {
      method: 'POST',
      body: input,
    }),

  getPublicationPdf: (options: ApiCallOptions, id: string): Promise<AssetDownload> =>
    call(endpoints.getPublicationPdf.response, pathOf(endpoints.getPublicationPdf.path, { id }), options),

  publishRevision: (options: ApiCallOptions, id: string): Promise<EtareRevision> =>
    call(endpoints.publishRevision.response, pathOf(endpoints.publishRevision.path, { id }), options, {
      method: 'POST',
    }),

  // ---------------------------------------------------------------- risks
  listRiskTypes: (options: ApiCallOptions, includeDeprecated = false): Promise<RiskType[]> =>
    itemsOf(
      call(endpoints.listRiskTypes.response, endpoints.listRiskTypes.path, options, {
        query: { include_deprecated: includeDeprecated ? 'true' : undefined },
      }),
    ),

  createRiskType: (options: ApiCallOptions, input: RiskTypeCreateInput): Promise<RiskType> =>
    call(endpoints.createRiskType.response, endpoints.createRiskType.path, options, { method: 'POST', body: input }),

  updateRiskType: (options: ApiCallOptions, id: string, version: number, patch: RiskTypeUpdate): Promise<RiskType> =>
    call(endpoints.updateRiskType.response, pathOf(endpoints.updateRiskType.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  listSiteRisks: (options: ApiCallOptions, siteId: string): Promise<Risk[]> =>
    itemsOf(call(endpoints.listSiteRisks.response, pathOf(endpoints.listSiteRisks.path, { id: siteId }), options)),

  createSiteRisk: (options: ApiCallOptions, siteId: string, input: RiskCreateInput): Promise<Risk> =>
    call(endpoints.createSiteRisk.response, pathOf(endpoints.createSiteRisk.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  updateRisk: (options: ApiCallOptions, id: string, version: number, patch: RiskUpdate): Promise<Risk> =>
    call(endpoints.updateRisk.response, pathOf(endpoints.updateRisk.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- hazardous substances (RISK-03)
  listSiteSubstances: (options: ApiCallOptions, siteId: string): Promise<Substance[]> =>
    itemsOf(
      call(endpoints.listSiteSubstances.response, pathOf(endpoints.listSiteSubstances.path, { id: siteId }), options),
    ),

  createSiteSubstance: (options: ApiCallOptions, siteId: string, input: SubstanceCreateInput): Promise<Substance> =>
    call(endpoints.createSiteSubstance.response, pathOf(endpoints.createSiteSubstance.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  updateSubstance: (options: ApiCallOptions, id: string, version: number, patch: SubstanceUpdate): Promise<Substance> =>
    call(endpoints.updateSubstance.response, pathOf(endpoints.updateSubstance.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- documents and files
  listDocuments: (options: ApiCallOptions, siteId: string): Promise<Document[]> =>
    itemsOf(call(endpoints.listDocuments.response, pathOf(endpoints.listDocuments.path, { id: siteId }), options)),

  /** Declares the document and its first file; the answer carries the signed upload URL. */
  createDocument: (
    options: ApiCallOptions,
    siteId: string,
    input: DocumentCreateInput,
  ): Promise<DocumentUploadResponse> =>
    call(endpoints.createDocument.response, pathOf(endpoints.createDocument.path, { id: siteId }), options, {
      method: 'POST',
      body: input,
    }),

  createDocumentVersion: (
    options: ApiCallOptions,
    documentId: string,
    input: DocumentVersionCreate,
  ): Promise<DocumentUploadResponse> =>
    call(
      endpoints.createDocumentVersion.response,
      pathOf(endpoints.createDocumentVersion.path, { id: documentId }),
      options,
      { method: 'POST', body: input },
    ),

  updateDocument: (options: ApiCallOptions, id: string, version: number, patch: DocumentUpdate): Promise<Document> =>
    call(endpoints.updateDocument.response, pathOf(endpoints.updateDocument.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  /** The file has been sent to quarantine: asks the worker to verify it. */
  confirmUpload: (options: ApiCallOptions, assetId: string): Promise<UploadConfirmation> =>
    call(endpoints.confirmUpload.response, pathOf(endpoints.confirmUpload.path, { id: assetId }), options, {
      method: 'POST',
    }),

  /** Short-lived URL of a verified file (the download is audited server-side). */
  getAssetDownload: (
    options: ApiCallOptions,
    assetId: string,
    variant: 'original' | 'preview' | 'thumbnail' = 'original',
  ): Promise<AssetDownload> =>
    call(endpoints.getAssetDownload.response, pathOf(endpoints.getAssetDownload.path, { id: assetId }), options, {
      query: variant === 'original' ? {} : { variant },
    }),

  // ---------------------------------------------------------------- members of the SIS
  listMembers: (options: ApiCallOptions): Promise<Member[]> =>
    itemsOf(call(endpoints.listMembers.response, endpoints.listMembers.path, options)),

  /** Invites a person (invitation e-mail) or attaches an existing account. */
  inviteMember: (options: ApiCallOptions, input: MemberInvite): Promise<MemberInvitation> =>
    call(endpoints.inviteMember.response, endpoints.inviteMember.path, options, { method: 'POST', body: input }),

  updateMember: (options: ApiCallOptions, id: string, version: number, patch: MemberUpdate): Promise<Member> =>
    call(endpoints.updateMember.response, pathOf(endpoints.updateMember.path, { id }), options, {
      method: 'PATCH',
      body: patch,
      ifMatch: version,
    }),

  setMemberPerimeter: (
    options: ApiCallOptions,
    id: string,
    version: number,
    input: MemberPerimeterInput,
  ): Promise<Member> =>
    call(endpoints.setMemberPerimeter.response, pathOf(endpoints.setMemberPerimeter.path, { id }), options, {
      method: 'PUT',
      body: input,
      ifMatch: version,
    }),

  setMemberSensitiveAccess: (
    options: ApiCallOptions,
    id: string,
    version: number,
    input: MemberSensitiveAccessInput,
  ): Promise<Member> =>
    call(
      endpoints.setMemberSensitiveAccess.response,
      pathOf(endpoints.setMemberSensitiveAccess.path, { id }),
      options,
      {
        method: 'PUT',
        body: input,
        ifMatch: version,
      },
    ),

  listAccessEvents: (options: ApiCallOptions, query: Partial<AccessEventListQuery> = {}): Promise<AccessEventList> =>
    call(endpoints.listAccessEvents.response, endpoints.listAccessEvents.path, options, { query }),

  // ---------------------------------------------------------------- supervision of the SIS (EXP-03)
  getSupervision: (options: ApiCallOptions): Promise<TenantSupervision> =>
    call(endpoints.getSupervision.response, endpoints.getSupervision.path, options),

  // ---------------------------------------------------------------- base maps of the tablets (ADR-024)
  getBasemapOverview: (options: ApiCallOptions): Promise<BasemapOverview> =>
    call(endpoints.getBasemapOverview.response, endpoints.getBasemapOverview.path, options),

  requestBasemapBuild: (options: ApiCallOptions, sectorId: string): Promise<BasemapOverview> =>
    call(
      endpoints.requestBasemapBuild.response,
      pathOf(endpoints.requestBasemapBuild.path, { id: sectorId }),
      options,
      {
        method: 'POST',
      },
    ),

  // ---------------------------------------------------------------- sectors (PER-01)
  listSectors: (options: ApiCallOptions): Promise<SectorList> =>
    call(endpoints.listSectors.response, endpoints.listSectors.path, options),

  listSectorCommunes: (options: ApiCallOptions): Promise<SectorCommuneList> =>
    call(endpoints.listSectorCommunes.response, endpoints.listSectorCommunes.path, options),

  createSector: (options: ApiCallOptions, input: SectorSave): Promise<Sector> =>
    call(endpoints.createSector.response, endpoints.createSector.path, options, { method: 'POST', body: input }),

  updateSector: (options: ApiCallOptions, id: string, version: number, input: SectorSave): Promise<Sector> =>
    call(endpoints.updateSector.response, pathOf(endpoints.updateSector.path, { id }), options, {
      method: 'PUT',
      body: input,
      ifMatch: version,
    }),

  archiveSector: (options: ApiCallOptions, id: string, version: number): Promise<SectorList> =>
    call(endpoints.archiveSector.response, pathOf(endpoints.archiveSector.path, { id }), options, {
      method: 'POST',
      ifMatch: version,
    }),

  // ---------------------------------------------------------------- terminals (ADMIN-02)
  getTerminalPolicy: (options: ApiCallOptions): Promise<TerminalPolicySettings> =>
    call(endpoints.getTerminalPolicy.response, endpoints.getTerminalPolicy.path, options),

  updateTerminalPolicy: (options: ApiCallOptions, input: TerminalPolicySettings): Promise<TerminalPolicySettings> =>
    call(endpoints.updateTerminalPolicy.response, endpoints.updateTerminalPolicy.path, options, {
      method: 'PUT',
      body: input,
    }),

  listDevices: (options: ApiCallOptions): Promise<DeviceList> =>
    call(endpoints.listDevices.response, endpoints.listDevices.path, options),

  /** Declares a terminal: the one-time enrollment code is only in this answer. */
  createDevice: (options: ApiCallOptions, input: DeviceCreate): Promise<DeviceEnrollmentCode> =>
    call(endpoints.createDevice.response, endpoints.createDevice.path, options, { method: 'POST', body: input }),

  renewDeviceEnrollment: (options: ApiCallOptions, id: string, version: number): Promise<DeviceEnrollmentCode> =>
    call(endpoints.renewDeviceEnrollment.response, pathOf(endpoints.renewDeviceEnrollment.path, { id }), options, {
      method: 'POST',
      ifMatch: version,
    }),

  setDevicePerimeter: (
    options: ApiCallOptions,
    id: string,
    version: number,
    input: DevicePerimeterInput,
  ): Promise<Device> =>
    call(endpoints.setDevicePerimeter.response, pathOf(endpoints.setDevicePerimeter.path, { id }), options, {
      method: 'PUT',
      body: input,
      ifMatch: version,
    }),

  revokeDevice: (options: ApiCallOptions, id: string, version: number, input: DeviceRevoke): Promise<Device> =>
    call(endpoints.revokeDevice.response, pathOf(endpoints.revokeDevice.path, { id }), options, {
      method: 'POST',
      body: input,
      ifMatch: version,
    }),
};
