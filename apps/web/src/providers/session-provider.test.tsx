import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider, useSession } from './session-provider';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
}));
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/lib/supabase-browser', () => ({ supabaseBrowser: () => ({ auth: mocks }) }));

function session(id: string): Session {
  return {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-09-30T00:00:00Z' },
  };
}

function Identity() {
  const state = useSession();
  return <p>{state.ready ? (state.session?.user.id ?? 'signed-out') : 'loading'}</p>;
}

describe('session cache isolation', () => {
  let emit: (event: string, next: Session | null) => void;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: session('user-a') } });
    mocks.onAuthStateChange.mockImplementation((listener: typeof emit) => {
      emit = listener;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
  });
  afterEach(cleanup);

  function mount() {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <SessionProvider>
          <Identity />
        </SessionProvider>
      </QueryClientProvider>,
    );
    return client;
  }

  it('clears all cached site data on a sign-out from another tab', async () => {
    const client = mount();
    await screen.findByText('user-a');
    client.setQueryData(['tenant', 'sis-06', 'sites'], ['private-data']);
    act(() => emit('SIGNED_OUT', null));
    expect(client.getQueryData(['tenant', 'sis-06', 'sites'])).toBeUndefined();
    expect(screen.getByText('signed-out')).toBeTruthy();
  });

  it('clears the cache on identity change but keeps it for token refresh', async () => {
    const client = mount();
    await screen.findByText('user-a');
    client.setQueryData(['tenant', 'sis-06', 'sites'], ['private-data']);
    act(() => emit('TOKEN_REFRESHED', session('user-a')));
    expect(client.getQueryData(['tenant', 'sis-06', 'sites'])).toEqual(['private-data']);
    act(() => emit('SIGNED_IN', session('user-b')));
    expect(client.getQueryData(['tenant', 'sis-06', 'sites'])).toBeUndefined();
  });

  it('does not restore a stale session after a newer sign-out event', async () => {
    let resolveSession: (value: { data: { session: Session } }) => void = () => {
      throw new Error('not mounted');
    };
    mocks.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    mount();
    act(() => emit('SIGNED_OUT', null));
    await act(async () => resolveSession({ data: { session: session('user-a') } }));
    await waitFor(() => expect(screen.getByText('signed-out')).toBeTruthy());
  });
});
