import { describe, expect, it } from 'vitest';
import { assertDedicatedDatabaseRole, readApiEnv, readWorkerEnv } from './index';

describe('database role guard', () => {
  it('accepts the dedicated roles and their per-environment logins', () => {
    for (const url of [
      'postgresql://etare_api:pw@127.0.0.1:54322/postgres',
      'postgresql://etare_api_prod:pw@db:5432/etare',
      'postgres://etare_api.abcdefgh:pw@pooler:6543/postgres',
    ]) {
      expect(assertDedicatedDatabaseRole(url, 'etare_api')).toBe(url);
    }
  });

  it('refuses privileged or foreign identities', () => {
    for (const url of [
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      'postgresql://supabase_admin:x@127.0.0.1:54322/postgres',
      'postgresql://etare_worker:x@127.0.0.1:54322/postgres',
      'postgresql://etare_api_admin%20or:x@127.0.0.1/postgres',
      'mysql://etare_api:x@127.0.0.1/db',
      'not a url',
    ]) {
      expect(() => assertDedicatedDatabaseRole(url, 'etare_api')).toThrow();
    }
  });
});

describe('environment parsing', () => {
  it('derives the auth issuer and JWKS URL from the Supabase URL', () => {
    const env = readApiEnv({
      DATABASE_URL: 'postgresql://etare_api:pw@127.0.0.1:54322/postgres',
      SUPABASE_URL: 'http://127.0.0.1:54321',
    });
    expect(env.auth.issuer).toBe('http://127.0.0.1:54321/auth/v1');
    expect(env.auth.jwksUrl).toBe('http://127.0.0.1:54321/auth/v1/.well-known/jwks.json');
    expect(env.auth.audience).toBe('authenticated');
    expect(env.supabaseSecretKey).toBeUndefined();
  });

  it('requires the worker role for workers', () => {
    expect(() =>
      readWorkerEnv({ WORKER_DATABASE_URL: 'postgresql://etare_api:pw@127.0.0.1:54322/postgres' }),
    ).toThrow();
    expect(
      readWorkerEnv({ WORKER_DATABASE_URL: 'postgresql://etare_worker:pw@127.0.0.1:54322/postgres' }).concurrency,
    ).toBe(2);
  });
});
