// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

const auth = vi.hoisted(() => ({ authenticated: true, level: { currentLevel: 'aal1', nextLevel: 'aal1' } }));
vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (cookies: { name: string; value: string; options: { path: string; httpOnly: boolean } }[]) => void;
      };
    },
  ) => ({
    auth: {
      getClaims: async () => {
        options.cookies.setAll([
          { name: 'sb-session', value: auth.authenticated ? 'refreshed' : '', options: { path: '/', httpOnly: true } },
        ]);
        return { data: auth.authenticated ? { claims: { sub: 'demo-user' } } : null };
      },
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: auth.level, error: null }) },
    },
  }),
}));

describe('authentication proxy', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'local-publishable');
    auth.authenticated = true;
    auth.level = { currentLevel: 'aal1', nextLevel: 'aal1' };
  });

  it('preserves refreshed cookies when redirecting a signed-in user', async () => {
    const response = await proxy(new NextRequest('http://localhost/login'));
    expect(response.headers.get('location')).toBe('http://localhost/');
    expect(response.cookies.get('sb-session')?.value).toBe('refreshed');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('preserves cleared cookies when redirecting an expired session', async () => {
    auth.authenticated = false;
    const response = await proxy(new NextRequest('http://localhost/sites?limit=10'));
    expect(response.cookies.get('sb-session')?.value).toBe('');
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/sites?limit=10');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('asks an account with a verified factor for its code before any page', async () => {
    auth.level = { currentLevel: 'aal1', nextLevel: 'aal2' };
    const response = await proxy(new NextRequest('http://localhost/administration?onglet=membres'));
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/verification');
    expect(location.searchParams.get('next')).toBe('/administration?onglet=membres');
    expect(response.cookies.get('sb-session')?.value).toBe('refreshed');
  });

  it('leaves the verification step once the code has been given', async () => {
    auth.level = { currentLevel: 'aal2', nextLevel: 'aal2' };
    const response = await proxy(new NextRequest('http://localhost/verification?next=%2Fsites%3Fq%3Dnice'));
    expect(response.headers.get('location')).toBe('http://localhost/sites?q=nice');
  });

  it('lets anyone open an invitation link', async () => {
    auth.authenticated = false;
    const response = await proxy(new NextRequest('http://localhost/auth/confirm?token_hash=abc&type=invite'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('disables caching on authenticated pages too', async () => {
    const response = await proxy(new NextRequest('http://localhost/sites'));
    expect(response.cookies.get('sb-session')?.value).toBe('refreshed');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
