'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';
import { api } from './api-client';

/** Tenant-scoped query keys always start with ['tenant', tenantId] (cache isolation between SIS). */
export const queryKeys = {
  sites: (tenantId: string) => ['tenant', tenantId, 'sites'] as const,
  site: (tenantId: string, id: string) => ['tenant', tenantId, 'site', id] as const,
};

function useApiContext() {
  const { session } = useSession();
  const { activeTenant } = useTenant();
  return { token: session?.access_token ?? null, tenantId: activeTenant?.tenant_id ?? null };
}

export function useSites(pageSize = 25) {
  const { token, tenantId } = useApiContext();
  return useInfiniteQuery({
    queryKey: [...queryKeys.sites(tenantId ?? 'none'), pageSize],
    enabled: Boolean(token && tenantId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.listSites(
        { token: token ?? '', tenantId: tenantId ?? '', signal },
        pageParam ? { limit: pageSize, cursor: pageParam } : { limit: pageSize },
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export function useSite(id: string) {
  const { token, tenantId } = useApiContext();
  return useQuery({
    queryKey: queryKeys.site(tenantId ?? 'none', id),
    enabled: Boolean(token && tenantId),
    queryFn: ({ signal }) => api.getSite({ token: token ?? '', tenantId: tenantId ?? '', signal }, id),
  });
}
