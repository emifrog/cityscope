'use client';

import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

interface SessionState {
  readonly ready: boolean;
  readonly session: Session | null;
  readonly signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let active = true;
    let identity: string | null = null;
    let authEventReceived = false;
    function applySession(next: Session | null) {
      if (!active) return;
      const nextIdentity = next?.user.id ?? null;
      // Includes expiration and sign-out in another tab, not just our sign-out button.
      if (nextIdentity !== identity) queryClient.clear();
      identity = nextIdentity;
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

  const signOut = useCallback(async () => {
    await supabaseBrowser().auth.signOut();
    // Nothing of the previous user may survive in memory.
    queryClient.clear();
    router.replace('/login');
    router.refresh();
  }, [queryClient, router]);

  const value = useMemo(() => ({ ready, session, signOut }), [ready, session, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.');
  return value;
}
