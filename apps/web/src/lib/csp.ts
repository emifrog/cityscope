import { MAP_TILE_ORIGINS } from '@etare/contracts';

export interface CspOptions {
  /** Fresh for every page: Next.js puts it on its own scripts and styles. */
  readonly nonce: string;
  /** Supabase (authentication, signed file URLs) called by the browser. */
  readonly supabaseUrl: string;
  readonly development: boolean;
  /** The page is served over HTTPS: sub-resources are upgraded too. */
  readonly secure: boolean;
}

/**
 * Content Security Policy of the pages (SEC-03, ADR-023): scripts only from the application,
 * with the nonce of the page; workers of the map and of the PDF reader from the application;
 * images and calls only to the application, Supabase and the map hosts; no frame, no plugin.
 * Inline style attributes stay allowed (server-rendered style props cannot carry a nonce);
 * style elements need the nonce. Development adds what React and the dev server need.
 */
export function contentSecurityPolicy(options: CspOptions): string {
  const supabase = new URL(options.supabaseUrl).origin;
  const nonce = `'nonce-${options.nonce}'`;
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", nonce, "'strict-dynamic'", ...(options.development ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", ...(options.development ? ["'unsafe-inline'"] : [nonce])],
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', supabase, ...MAP_TILE_ORIGINS],
    'font-src': ["'self'"],
    'connect-src': ["'self'", supabase, ...MAP_TILE_ORIGINS, ...(options.development ? ['ws:'] : [])],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (options.secure) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

/** A nonce of 128 random bits, base64. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
