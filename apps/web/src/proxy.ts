import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, newNonce } from '@/lib/csp';
import { safeNextPath } from '@/lib/navigation';

/** Reachable without a session: sign-in, forgotten password, and the links of e-mails (invitation, reset). */
const PUBLIC_PATHS = new Set(['/login', '/mot-de-passe-oublie', '/auth/confirm']);

/**
 * Refreshes the Supabase session cookies and keeps unauthenticated visitors
 * on the login page. This is a navigation convenience only: authorization is
 * enforced by the API (bearer token + database membership) and by RLS.
 * API routes are excluded: they authenticate every request themselves.
 * Also sets the Content Security Policy of the page, with a fresh nonce.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return new NextResponse('Configuration manquante : lancez `pnpm setup:local`.', {
      status: 500,
      headers: { 'cache-control': 'private, no-store' },
    });
  }

  const nonce = newNonce();
  const secure = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const csp = contentSecurityPolicy({
    nonce,
    supabaseUrl: url,
    development: process.env.NODE_ENV === 'development',
    secure,
  });
  // Next.js reads the nonce from the policy of the request while rendering, and puts it on its scripts.
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set('content-security-policy', csp);
    headers.set('x-nonce', nonce);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = forward();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() verifies the token signature (JWKS); never trust a cookie without verification.
  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  function finish(target: NextResponse) {
    // A redirect is a new response: carry over refreshed (or cleared) auth cookies.
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    target.headers.set('content-security-policy', csp);
    if (secure) target.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
    target.headers.set('cache-control', 'private, no-store');
    target.headers.set('pragma', 'no-cache');
    target.headers.set('expires', '0');
    return target;
  }

  if (!authenticated && !PUBLIC_PATHS.has(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(pathname + search)}`;
    return finish(NextResponse.redirect(login));
  }
  if (authenticated && pathname !== '/auth/confirm') {
    // Second step of the sign-in: an account with a verified factor presents it before any page.
    // Read from the session cookie (no network call); the API enforces aal2 on its own.
    const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const secondFactorPending = level?.nextLevel === 'aal2' && level.currentLevel !== 'aal2';
    if (secondFactorPending && pathname !== '/verification') {
      const verification = request.nextUrl.clone();
      verification.pathname = '/verification';
      verification.search = `?next=${encodeURIComponent(safeNextPath(pathname + search))}`;
      return finish(NextResponse.redirect(verification));
    }
    if (!secondFactorPending && (pathname === '/login' || pathname === '/verification')) {
      const destination = request.nextUrl.clone();
      const next = new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.nextUrl.origin);
      destination.pathname = pathname === '/login' ? '/' : next.pathname;
      destination.search = pathname === '/login' ? '' : next.search;
      return finish(NextResponse.redirect(destination));
    }
  }
  return finish(response);
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
