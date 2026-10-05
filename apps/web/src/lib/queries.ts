'use client';

import type {
  Contribution,
  ContributionListQuery,
  Document,
  DocumentUploadResponse,
  EtareDossierListQuery,
  FieldReport,
  FieldReportListQuery,
  FileDeclaration,
  MapSitesQuery,
  OperationalObject,
  Plan,
  SiteListQuery,
  UploadTicket,
} from '@etare/contracts';
import { permissionsForRoles, type Permission } from '@etare/domain';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';
import { api, type ApiCallOptions } from './api-client';
import { uploadFile, type UploadStep } from './file-upload';

/** Tenant-scoped query keys always start with ['tenant', tenantId] (cache isolation between SIS). */
export const queryKeys = {
  sites: (tenantId: string) => ['tenant', tenantId, 'sites'] as const,
  site: (tenantId: string, id: string) => ['tenant', tenantId, 'site', id] as const,
  siteRecords: (tenantId: string, id: string, kind: string) => ['tenant', tenantId, 'site', id, kind] as const,
  members: (tenantId: string) => ['tenant', tenantId, 'members'] as const,
  devices: (tenantId: string) => ['tenant', tenantId, 'devices'] as const,
  sectors: (tenantId: string) => ['tenant', tenantId, 'sectors'] as const,
  sectorCommunes: (tenantId: string) => ['tenant', tenantId, 'sector-communes'] as const,
  etare: (tenantId: string) => ['tenant', tenantId, 'etare'] as const,
  revision: (tenantId: string, id: string) => ['tenant', tenantId, 'etare', 'revision', id] as const,
  fieldReports: (tenantId: string) => ['tenant', tenantId, 'field-reports'] as const,
  contributions: (tenantId: string) => ['tenant', tenantId, 'contributions'] as const,
  portalContributions: (tenantId: string) => ['tenant', tenantId, 'portal-contributions'] as const,
  notifications: (tenantId: string) => ['tenant', tenantId, 'notifications'] as const,
  portalInvitations: (tenantId: string) => ['tenant', tenantId, 'portal-invitations'] as const,
  portalSettings: (tenantId: string) => ['tenant', tenantId, 'portal-settings'] as const,
  etareLayoutSettings: (tenantId: string) => ['tenant', tenantId, 'etare-layout-settings'] as const,
  portalAccess: (tenantId: string) => ['tenant', tenantId, 'portal-access'] as const,
  portalSites: (tenantId: string) => ['tenant', tenantId, 'portal-sites'] as const,
  portalSite: (tenantId: string, siteId: string) => ['tenant', tenantId, 'portal-sites', siteId] as const,
  myPortalInvitations: (userId: string) => ['me', userId, 'portal-invitations'] as const,
  mySessions: (userId: string) => ['me', userId, 'sessions'] as const,
  myRecoveryCodes: (userId: string) => ['me', userId, 'recovery-codes'] as const,
  securitySettings: (tenantId: string) => ['tenant', tenantId, 'security-settings'] as const,
  riskTypes: (tenantId: string, includeDeprecated?: boolean) =>
    includeDeprecated === undefined
      ? (['tenant', tenantId, 'risk-types'] as const)
      : (['tenant', tenantId, 'risk-types', includeDeprecated] as const),
};

export type SiteFilters = Pick<SiteListQuery, 'q' | 'site_type' | 'status' | 'city' | 'risk_type_id' | 'min_severity'>;

function useApiContext() {
  const { session } = useSession();
  const { activeTenant } = useTenant();
  const token = session?.access_token ?? null;
  const tenantId = activeTenant?.tenant_id ?? null;
  const options: ApiCallOptions = { token: token ?? '', tenantId: tenantId ?? '' };
  return { token, tenantId, options, enabled: Boolean(token && tenantId) };
}

/** Effective permissions in the active SIS (display only: the server always re-checks). */
export function usePermissions(): ReadonlySet<Permission> {
  const { activeTenant } = useTenant();
  return useMemo(() => permissionsForRoles(activeTenant?.roles ?? []), [activeTenant]);
}

export function useSites(filters: SiteFilters = {}, pageSize = 25) {
  const { tenantId, options, enabled } = useApiContext();
  return useInfiniteQuery({
    queryKey: [...queryKeys.sites(tenantId ?? 'none'), pageSize, filters],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.listSites(
        { ...options, signal },
        { ...filters, limit: pageSize, ...(pageParam ? { cursor: pageParam } : {}) },
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** Base maps of the server-side catalogue: identical for every SIS, fetched once per session. */
export function useMapCatalog() {
  const { token, options } = useApiContext();
  return useQuery({
    queryKey: ['map-catalog'],
    enabled: Boolean(token),
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: ({ signal }) => api.getMapCatalog({ ...options, signal }),
  });
}

export type MapSiteFilters = Pick<
  MapSitesQuery,
  'q' | 'site_type' | 'status' | 'city' | 'risk_type_id' | 'min_severity'
>;

/**
 * Positioned sites for the map. Keyed under the site list, so any site change
 * refreshes the map too. With a bbox, only the visible extent is requested.
 */
export function useMapSites(filters: MapSiteFilters, bbox: string | null) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.sites(tenantId ?? 'none'), 'map', filters, bbox],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.listMapSites({ ...options, signal }, { ...filters, ...(bbox ? { bbox } : {}) }),
  });
}

/** Address suggestions (IGN geocoder through the API); starts at 3 characters. */
export function useAddressSearch(text: string) {
  const { tenantId, options, enabled } = useApiContext();
  const query = text.trim();
  return useQuery({
    queryKey: ['tenant', tenantId ?? 'none', 'geocoding', query],
    enabled: enabled && query.length >= 3,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: ({ signal }) => api.searchAddresses({ ...options, signal }, query),
  });
}

/** Imperative geocoding calls (e.g. the address nearest to a point that was just moved). */
export function useGeocodingClient() {
  const { token, tenantId } = useApiContext();
  return useMemo(() => {
    const options: ApiCallOptions = { token: token ?? '', tenantId: tenantId ?? '' };
    return { reverse: (lon: number, lat: number) => api.reverseGeocode(options, lon, lat) };
  }, [token, tenantId]);
}

export function useSite(id: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.site(tenantId ?? 'none', id),
    enabled,
    queryFn: ({ signal }) => api.getSite({ ...options, signal }, id),
  });
}

function useSiteList<T>(
  siteId: string,
  kind: string,
  lister: (options: ApiCallOptions, siteId: string) => Promise<T[]>,
) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId, kind),
    enabled,
    queryFn: ({ signal }) => lister({ ...options, signal }, siteId),
  });
}

export const useBuildings = (siteId: string) => useSiteList(siteId, 'buildings', api.listBuildings);
export const useClassifications = (siteId: string) => useSiteList(siteId, 'classifications', api.listClassifications);
export const useContacts = (siteId: string) => useSiteList(siteId, 'contacts', api.listContacts);
export const useExternalIds = (siteId: string) => useSiteList(siteId, 'external-ids', api.listExternalIds);
/**
 * Operational objects of a site; null (no site selected): nothing requested.
 * Refreshed while a photo waits for the verdict of the worker.
 */
export function useSiteObjects(siteId: string | null) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId ?? 'none', 'objects'),
    enabled: enabled && siteId !== null,
    queryFn: ({ signal }) => api.listSiteObjects({ ...options, signal }, siteId ?? ''),
    refetchInterval: (query) => (photosAwaitVerdict(query.state.data) ? VERDICT_POLL_MS : false),
  });
}

export const useSiteZones = (siteId: string) => useSiteList(siteId, 'zones', api.listSiteZones);
export const useSiteRisks = (siteId: string) => useSiteList(siteId, 'risks', api.listSiteRisks);

/** Risk catalogue of the active SIS; retired SIS types only for the catalogue screen. */
export function useRiskTypes(includeDeprecated = false) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.riskTypes(tenantId ?? 'none', includeDeprecated),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => api.listRiskTypes({ ...options, signal }, includeDeprecated),
  });
}

/** A publication being built: its status is followed until it is published (or failed). */
const BUILD_POLL_MS = 3000;
const building = (status: string | undefined) => status === 'queued' || status === 'building';

/** Pages of ETARE dossiers (by site name), filtered by text and state, with exact counts (MET-01). */
export function useEtareDossierPages(filters: Pick<EtareDossierListQuery, 'q' | 'state'>, pageSize = 50) {
  const { tenantId, options, enabled } = useApiContext();
  return useInfiniteQuery({
    queryKey: [...queryKeys.etare(tenantId ?? 'none'), 'dossiers', filters, pageSize],
    enabled,
    placeholderData: keepPreviousData,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.listEtareDossiers(
        { ...options, signal },
        { ...filters, limit: pageSize, ...(pageParam ? { cursor: pageParam } : {}) },
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** Exact counts of the ETARE dossiers of the SIS (dashboard). */
export function useEtareCounts(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.etare(tenantId ?? 'none'), 'counts'],
    enabled: enabled && wanted,
    queryFn: async ({ signal }) => (await api.listEtareDossiers({ ...options, signal }, { limit: 1 })).counts,
  });
}

export function useSiteEtare(siteId: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId, 'etare'),
    enabled,
    queryFn: ({ signal }) => api.getSiteEtare({ ...options, signal }, siteId),
    refetchInterval: (query) =>
      query.state.data?.revisions.some((revision) => building(revision.publication?.status)) ? BUILD_POLL_MS : false,
  });
}

/** What would be submitted now, with the checks; recomputed on demand (it reads all the working data). */
export function useEtarePreview(siteId: string, enabled = true) {
  const { tenantId, options, enabled: ready } = useApiContext();
  return useQuery({
    queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId, 'etare-preview'),
    enabled: ready && enabled,
    queryFn: ({ signal }) => api.previewSiteEtare({ ...options, signal }, siteId),
  });
}

export function useValidations(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.etare(tenantId ?? 'none'), 'validations'],
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listValidations({ ...options, signal }),
  });
}

export function useRevision(id: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.revision(tenantId ?? 'none', id),
    enabled,
    queryFn: ({ signal }) => api.getRevision({ ...options, signal }, id),
    refetchInterval: (query) => (building(query.state.data?.revision.publication?.status) ? BUILD_POLL_MS : false),
  });
}

const reportAwaitsPhotos = (report: FieldReport | undefined, now = Date.now()) =>
  (report?.photos ?? []).some(
    (asset) => asset.scan_status === 'pending' && now - Date.parse(asset.created_at) < VERDICT_WAIT_MS,
  );

/** Invitations of exploitants in the active SIS (inviters only). */
export function usePortalInvitations(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.portalInvitations(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listPortalInvitations({ ...options, signal }),
  });
}

export function usePortalSettings(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.portalSettings(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.getPortalSettings({ ...options, signal }),
  });
}

/** Optional sections of the ETARE hidden by the SIS (DEC-05). */
export function useEtareLayoutSettings(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.etareLayoutSettings(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.getEtareLayoutSettings({ ...options, signal }),
  });
}

/** Second-factor policy of the SIS (administration). */
export function useSecuritySettings(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.securitySettings(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.getSecuritySettings({ ...options, signal }),
  });
}

/** Open sessions of the signed-in person (Mon compte). */
export function useMySessions() {
  const { session } = useSession();
  const token = session?.access_token;
  return useQuery({
    queryKey: queryKeys.mySessions(session?.user.id ?? 'none'),
    enabled: Boolean(token),
    queryFn: ({ signal }) => api.listMySessions({ token: token ?? '', signal }),
  });
}

/** How many recovery codes remain (never the codes themselves). */
export function useMyRecoveryCodes(wanted = true) {
  const { session } = useSession();
  const token = session?.access_token;
  return useQuery({
    queryKey: queryKeys.myRecoveryCodes(session?.user.id ?? 'none'),
    enabled: Boolean(token) && wanted,
    queryFn: ({ signal }) => api.getMyRecoveryCodes({ token: token ?? '', signal }),
  });
}

/** Where the signed-in person stands on the portal of the active SIS. */
export function usePortalAccess(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.portalAccess(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.getPortalAccess({ ...options, signal }),
  });
}

/** Sites open to the exploitant in the active SIS (POR-02). */
export function usePortalSites(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.portalSites(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listPortalSites({ ...options, signal }),
  });
}

/** What the exploitant sees of one site: the whitelist of its published version. */
export function usePortalSite(siteId: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.portalSite(tenantId ?? 'none', siteId),
    enabled,
    queryFn: ({ signal }) => api.getPortalSite({ ...options, signal }, siteId),
  });
}

/** Pending invitations of the signed-in person (no active SIS needed: they may not be a member yet). */
export function useMyPortalInvitations() {
  const { session } = useSession();
  const token = session?.access_token;
  return useQuery({
    queryKey: queryKeys.myPortalInvitations(session?.user.id ?? 'none'),
    enabled: Boolean(token),
    queryFn: ({ signal }) => api.listMyPortalInvitations({ token: token ?? '', signal }),
  });
}

/** Field reports of the SIS (OPS-04); `wanted`: only for those who instruct them. */
export function useFieldReports(query: Partial<FieldReportListQuery> = {}, wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.fieldReports(tenantId ?? 'none'), 'list', query],
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listFieldReports({ ...options, signal }, query),
  });
}

/** Pages of field reports for the instruction list (open, closed or all). */
export function useFieldReportPages(view: FieldReportListQuery['view'], pageSize = 50) {
  const { tenantId, options, enabled } = useApiContext();
  return useInfiniteQuery({
    queryKey: [...queryKeys.fieldReports(tenantId ?? 'none'), 'pages', view, pageSize],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.listFieldReports(
        { ...options, signal },
        { view, limit: pageSize, ...(pageParam ? { cursor: pageParam } : {}) },
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** One field report; refreshed while a photo waits for the verdict of the worker. */
export function useFieldReport(id: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.fieldReports(tenantId ?? 'none'), 'detail', id],
    enabled,
    queryFn: ({ signal }) => api.getFieldReport({ ...options, signal }, id),
    refetchInterval: (query) => (reportAwaitsPhotos(query.state.data) ? VERDICT_POLL_MS : false),
  });
}

const contributionAwaitsFiles = (contribution: Contribution | undefined, now = Date.now()) =>
  (contribution?.attachments ?? []).some(
    (asset) => asset.scan_status === 'pending' && now - Date.parse(asset.created_at) < VERDICT_WAIT_MS,
  );

/** Proposals of the exploitants (POR-03/04); `wanted`: only for those who instruct them. */
export function useContributions(query: Partial<ContributionListQuery> = {}, wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.contributions(tenantId ?? 'none'), 'list', query],
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listContributions({ ...options, signal }, query),
  });
}

/** Pages of proposals for the instruction list (open, closed or all). */
export function useContributionPages(view: ContributionListQuery['view'], pageSize = 50) {
  const { tenantId, options, enabled } = useApiContext();
  return useInfiniteQuery({
    queryKey: [...queryKeys.contributions(tenantId ?? 'none'), 'pages', view, pageSize],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.listContributions(
        { ...options, signal },
        { view, limit: pageSize, ...(pageParam ? { cursor: pageParam } : {}) },
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

/** One proposal; refreshed while a file waits for the verdict of the worker. */
export function useContribution(id: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.contributions(tenantId ?? 'none'), 'detail', id],
    enabled,
    queryFn: ({ signal }) => api.getContribution({ ...options, signal }, id),
    refetchInterval: (query) => (contributionAwaitsFiles(query.state.data) ? VERDICT_POLL_MS : false),
  });
}

/** Proposals of the exploitant on one site (portal). */
export function usePortalContributions(siteId: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.portalContributions(tenantId ?? 'none'), siteId],
    enabled,
    queryFn: ({ signal }) => api.listPortalContributions({ ...options, signal }, { site_id: siteId }),
  });
}

/** Notifications of the portal (administration of the SIS); refreshed while some wait to be sent. */
export function useNotifications(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.notifications(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listNotifications({ ...options, signal }),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((notification) => notification.status === 'pending') ? VERDICT_POLL_MS : false,
  });
}

/** Catalogue of operational object types of the active SIS (rarely changes). */
export function useObjectTypes() {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: ['tenant', tenantId ?? 'none', 'object-types'],
    enabled,
    staleTime: 10 * 60_000,
    queryFn: ({ signal }) => api.listObjectTypes({ ...options, signal }),
  });
}

/** Buildings and operational points of the visible extent; null bbox (zoomed out): nothing requested. */
export function useMapFeatures(bbox: string | null) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: [...queryKeys.sites(tenantId ?? 'none'), 'map-features', bbox],
    enabled: enabled && bbox !== null,
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: ({ signal }) => api.listMapFeatures({ ...options, signal }, bbox ?? ''),
  });
}

/** Members of the active SIS (administration: the API requires the second factor). */
export function useMembers() {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.members(tenantId ?? 'none'),
    enabled,
    queryFn: ({ signal }) => api.listMembers({ ...options, signal }),
    // MFA_REQUIRED / FORBIDDEN are answers, not transient failures.
    retry: false,
  });
}

/** Terminals of the SIS and their synchronization (device:manage, second factor). */
export function useDevices() {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.devices(tenantId ?? 'none'),
    enabled,
    queryFn: ({ signal }) => api.listDevices({ ...options, signal }),
    retry: false,
  });
}

/** Sectors of the SIS (PER-01): composed by the administration, perimeter of terminals and members. */
export function useSectors(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.sectors(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listSectors({ ...options, signal }),
    retry: false,
  });
}

/** Communes of the sites of the SIS, to compose sectors. */
export function useSectorCommunes(wanted = true) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.sectorCommunes(tenantId ?? 'none'),
    enabled: enabled && wanted,
    queryFn: ({ signal }) => api.listSectorCommunes({ ...options, signal }),
    retry: false,
  });
}

const VERDICT_POLL_MS = 3000;
/** Past this delay a pending file is considered abandoned (upload never finished): polling stops. */
const VERDICT_WAIT_MS = 10 * 60 * 1000;

function awaitsVerdict(documents: readonly Document[] | undefined, now = Date.now()): boolean {
  return (documents ?? []).some((document) =>
    document.versions.some(
      (version) =>
        version.asset.scan_status === 'pending' && now - Date.parse(version.asset.created_at) < VERDICT_WAIT_MS,
    ),
  );
}

const photosAwaitVerdict = (objects: readonly OperationalObject[] | undefined, now = Date.now()) =>
  (objects ?? []).some((object) =>
    object.photos.some(
      (photo) => photo.asset.scan_status === 'pending' && now - Date.parse(photo.asset.created_at) < VERDICT_WAIT_MS,
    ),
  );

const plansAwaitVerdict = (plans: readonly Plan[] | undefined, now = Date.now()) =>
  (plans ?? []).some((plan) =>
    plan.revisions.some(
      (revision) =>
        revision.asset.scan_status === 'pending' && now - Date.parse(revision.asset.created_at) < VERDICT_WAIT_MS,
    ),
  );

/** Plans of a site; refreshed while a background waits for the verdict of the worker. */
export function useSitePlans(siteId: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId, 'plans'),
    enabled,
    queryFn: ({ signal }) => api.listSitePlans({ ...options, signal }, siteId),
    refetchInterval: (query) => (plansAwaitVerdict(query.state.data) ? VERDICT_POLL_MS : false),
  });
}

/**
 * Short-lived URL of a verified file (the access is audited server-side).
 * Kept a little less than its lifetime, then requested again.
 */
export function useAssetUrl(assetId: string | null, variant: 'original' | 'preview' | 'thumbnail' = 'original') {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: ['tenant', tenantId ?? 'none', 'asset-url', assetId, variant],
    enabled: enabled && assetId !== null,
    staleTime: 45_000,
    gcTime: 50_000,
    retry: false,
    queryFn: ({ signal }) => api.getAssetDownload({ ...options, signal }, assetId ?? '', variant),
  });
}

/** Documents of a site; refreshed while a file waits for the verdict of the worker. */
export function useDocuments(siteId: string) {
  const { tenantId, options, enabled } = useApiContext();
  return useQuery({
    queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId, 'documents'),
    enabled,
    queryFn: ({ signal }) => api.listDocuments({ ...options, signal }, siteId),
    refetchInterval: (query) => (awaitsVerdict(query.state.data) ? VERDICT_POLL_MS : false),
  });
}

export interface UploadVariables<T> {
  readonly file: File;
  readonly declare: (options: ApiCallOptions, file: FileDeclaration) => Promise<T>;
}
export type DocumentUploadVariables = UploadVariables<DocumentUploadResponse>;

/**
 * Uploads a file of a site (document version, plan background) and exposes
 * the current step. The records are refreshed even on failure: the
 * declaration may already exist when the transfer itself fails. `related`:
 * other records the upload changes (a new background supersedes positions).
 */
export function useSiteFileUpload<T extends { readonly upload: UploadTicket }>(
  siteId: string,
  kind: string,
  related: readonly string[] = [],
) {
  const { tenantId, options } = useApiContext();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<UploadStep | null>(null);
  const mutation = useMutation({
    mutationFn: ({ file, declare }: UploadVariables<T>) => uploadFile(options, file, declare, setStep),
    onSettled: async () => {
      setStep(null);
      await Promise.all(
        [kind, ...related].map((records) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId, records) }),
        ),
      );
    },
  });
  return { ...mutation, step };
}

export const useDocumentUpload = (siteId: string) => useSiteFileUpload<DocumentUploadResponse>(siteId, 'documents');

/**
 * A write through the API. On success, the given keys (relative to the
 * active SIS) are invalidated so every view shows the server state.
 */
export function useApiMutation<TVariables, TResult>(
  mutate: (options: ApiCallOptions, variables: TVariables) => Promise<TResult>,
  invalidate: (tenantId: string, result: TResult) => QueryKey[],
) {
  const { tenantId, options } = useApiContext();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: TVariables) => mutate(options, variables),
    onSuccess: async (result) => {
      await Promise.all(
        invalidate(tenantId ?? 'none', result).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}
