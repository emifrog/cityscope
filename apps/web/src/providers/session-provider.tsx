'use client';

import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api-client';
import { supabaseBrowser } from '@/lib/supabase-browser';

export type AssuranceLevel = 'aal1' | 'aal2';

interface SessionState {
  readonly ready: boolean;
  readonly session: Session | null;
  /** Authentication level of the current token (display only: the API verifies the token itself). */
  readonly assurance: AssuranceLevel | null;
  readonly signOut: () => Promise<void>;
}

/** Reads the aal claim of an access token without verifying it (UI hints only). */
export function assuranceOf(accessToken: string | undefined): AssuranceLevel | null {
  const payload = accessToken?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { aal?: unknown };
    return claims.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return null;
  }
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  // Bumped when answers must be fetched again with the new token (second factor verified,
  // token renewed after a refusal). Refetched in an effect: this provider's effects run after
  // those of its children, whose queries then already hold the new token.
  const [refetchRound, setRefetchRound] = useState(0);
  useEffect(() => {
    if (refetchRound > 0) void queryClient.invalidateQueries();
  }, [refetchRound, queryClient]);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let active = true;
    let identity: string | null = null;
    let assurance: AssuranceLevel | null = null;
    let authEventReceived = false;
    function applySession(next: Session | null) {
      if (!active) return;
      const nextIdentity = next?.user.id ?? null;
      // Includes expiration and sign-out in another tab, not just our sign-out button.
      const nextAssurance = assuranceOf(next?.access_token);
      if (nextIdentity !== identity) queryClient.clear();
      // Same person, new level (second factor verified): answers such as MFA_REQUIRED are stale.
      else if (nextAssurance !== assurance) setRefetchRound((round) => round + 1);
      identity = nextIdentity;
      assurance = nextAssurance;
      setSession(next);
      setReady(true);
    }
    void supabase.auth.getSession().then(({ data }) => {
      // An auth event can arrive while getSession is pending; it is more recent.
      if (!authEventReceived) applySession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventReceived = true;
      applySession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  // The API refuses the token of a closed session at once (sign-out elsewhere, revocation, suspension):
  // the local session is dropped instead of waiting for the next token renewal to fail.
  useEffect(() => {
    let closing = false;
    const closed = (error: unknown) => {
      if (closing || !(error instanceof ApiRequestError) || error.status !== 401) return;
      closing = true;
      const supabase = supabaseBrowser();
      // A token that merely expired (tab asleep) is renewed; a closed session cannot be.
      void supabase.auth.refreshSession().then(async ({ error: renewal }) => {
        if (!renewal) {
          closing = false;
          setRefetchRound((round) => round + 1);
          return;
        }
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        queryClient.clear();
        router.replace('/login?reason=session');
        router.refresh();
      });
    };
    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') closed(event.action.error);
    });
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') closed(event.action.error);
    });
    return () => {
      queries();
      mutations();
    };
  }, [queryClient, router]);

  const signOut = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
    // Nothing of the previous user may survive in memory.
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }, [queryClient, router]);

  const value = useMemo(
    () => ({ ready, session, assurance: assuranceOf(session?.access_token), signOut }),
    [ready, session, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
