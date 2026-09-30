'use client';

import type { Document, DocumentUploadResponse, FileDeclaration, MapSitesQuery, SiteListQuery } from '@etare/contracts';
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
import { uploadDocumentFile, type UploadStep } from './file-upload';

/** Tenant-scoped query keys always start with ['tenant', tenantId] (cache isolation between SIS). */
export const queryKeys = {
  sites: (tenantId: string) => ['tenant', tenantId, 'sites'] as const,
  site: (tenantId: string, id: string) => ['tenant', tenantId, 'site', id] as const,
  siteRecords: (tenantId: string, id: string, kind: string) => ['tenant', tenantId, 'site', id, kind] as const,
  members: (tenantId: string) => ['tenant', tenantId, 'members'] as const,
};

export type SiteFilters = Pick<SiteListQuery, 'q' | 'site_type' | 'status' | 'city'>;

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

export type MapSiteFilters = Pick<MapSitesQuery, 'q' | 'site_type' | 'status'>;

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

export interface DocumentUploadVariables {
  readonly file: File;
  readonly declare: (options: ApiCallOptions, file: FileDeclaration) => Promise<DocumentUploadResponse>;
}

/**
 * Uploads a document file (new document or new version) and exposes the
 * current step. The list is refreshed even on failure: the declaration may
 * already exist when the transfer itself fails.
 */
export function useDocumentUpload(siteId: string) {
  const { tenantId, options } = useApiContext();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<UploadStep | null>(null);
  const mutation = useMutation({
    mutationFn: ({ file, declare }: DocumentUploadVariables) => uploadDocumentFile(options, file, declare, setStep),
    onSettled: async () => {
      setStep(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.siteRecords(tenantId ?? 'none', siteId, 'documents') });
    },
  });
  return { ...mutation, step };
}

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
