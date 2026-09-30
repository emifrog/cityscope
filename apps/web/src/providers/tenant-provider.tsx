'use client';

import type { Membership, MeResponse } from '@etare/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api-client';
import { useSession } from './session-provider';

interface TenantState {
  readonly me: MeResponse | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly memberships: readonly Membership[];
  readonly activeTenant: Membership | null;
  readonly setActiveTenant: (tenantId: string) => void;
}

const TenantContext = createContext<TenantState | null>(null);
const storageKey = (userId: string) => `etare.active-tenant.${userId}`;

function readStoredTenant(userId: string | undefined): string | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

/**
 * Active SIS of the session. The chosen tenant is only a hint sent to the API
 * (X-Tenant-Id): the server re-checks the membership on every request.
 * Every tenant-scoped query key starts with ['tenant', tenantId] so that
 * switching SIS never shows data cached for another SIS.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const token = session?.access_token;
  const userId = session?.user.id;

  const meQuery = useQuery({
    queryKey: ['me', userId],
    queryFn: ({ signal }) => api.getMe({ token: token ?? '', signal }),
    enabled: Boolean(token),
  });

  const [chosen, setChosen] = useState<string | null>(null);
  const memberships = useMemo(() => meQuery.data?.memberships ?? [], [meQuery.data]);
  const preferred = chosen ?? readStoredTenant(userId);
  const activeTenant = memberships.find((m) => m.tenant_id === preferred) ?? memberships[0] ?? null;

  const setActiveTenant = useCallback(
    (tenantId: string) => {
      if (!userId || !memberships.some((m) => m.tenant_id === tenantId)) return;
      setChosen(tenantId);
      try {
        window.localStorage.setItem(storageKey(userId), tenantId);
      } catch {
        // Storage unavailable (private mode): the choice lasts for the session only.
      }
      queryClient.removeQueries({ queryKey: ['tenant'] });
    },
    [memberships, queryClient, userId],
  );

  const value = useMemo(
    () => ({
      me: meQuery.data,
      loading: meQuery.isPending && Boolean(token),
      error: meQuery.error,
      memberships,
      activeTenant,
      setActiveTenant,
    }),
    [meQuery.data, meQuery.isPending, meQuery.error, token, memberships, activeTenant, setActiveTenant],
  );
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  const value = useContext(TenantContext);
  if (!value) throw new Error('useTenant must be used inside <TenantProvider>.');
  return value;
}
