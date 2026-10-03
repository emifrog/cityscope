import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, newNonce } from './csp';

const base = { nonce: 'abc123', supabaseUrl: 'https://project.supabase.co', development: false, secure: true };

describe('content security policy', () => {
  it('only runs the scripts of the application carrying the nonce of the page', () => {
    const policy = contentSecurityPolicy(base);
    expect(policy).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).toContain("style-src 'self' 'nonce-abc123'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain('upgrade-insecure-requests');
  });

  it('allows the map workers, Supabase and the map hosts, nothing else', () => {
    const policy = contentSecurityPolicy(base);
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("connect-src 'self' https://project.supabase.co https://data.geopf.fr");
    expect(policy).toContain("img-src 'self' data: blob: https://project.supabase.co https://data.geopf.fr");
  });

  it('adds what the development server needs, and no upgrade over plain HTTP', () => {
    const policy = contentSecurityPolicy({
      ...base,
      development: true,
      secure: false,
      supabaseUrl: 'http://127.0.0.1:54321',
    });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain('ws:');
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('draws a fresh nonce every time', () => {
    expect(newNonce()).not.toBe(newNonce());
    expect(newNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
