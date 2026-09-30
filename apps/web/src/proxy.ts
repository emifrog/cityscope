import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = new Set(['/login']);

/**
 * Refreshes the Supabase session cookies and keeps unauthenticated visitors
 * on the login page. This is a navigation convenience only: authorization is
 * enforced by the API (bearer token + database membership) and by RLS.
 * API routes are excluded: they authenticate every request themselves.
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

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
  if (authenticated && pathname === '/login') {
    const home = request.nextUrl.clone();
    home.pathname = '/';
    home.search = '';
    return finish(NextResponse.redirect(home));
  }
  return finish(response);
}

export const config = {
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
