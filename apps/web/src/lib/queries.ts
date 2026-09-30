'use client';

import type { SiteListQuery } from '@etare/contracts';
import { permissionsForRoles, type Permission } from '@etare/domain';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';
import { api, type ApiCallOptions } from './api-client';

/** Tenant-scoped query keys always start with ['tenant', tenantId] (cache isolation between SIS). */
export const queryKeys = {
  sites: (tenantId: string) => ['tenant', tenantId, 'sites'] as const,
  site: (tenantId: string, id: string) => ['tenant', tenantId, 'site', id] as const,
  siteRecords: (tenantId: string, id: string, kind: string) => ['tenant', tenantId, 'site', id, kind] as const,
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
