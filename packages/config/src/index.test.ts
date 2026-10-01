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

describe('signing keys (ADR-015)', () => {
  const api = { DATABASE_URL: 'postgresql://etare_api:pw@db:5432/etare', SUPABASE_URL: 'https://auth.example.org' };
  const worker = { WORKER_DATABASE_URL: 'postgresql://etare_worker:pw@db:5432/etare' };

  it('are optional in development: distribution is simply off', () => {
    expect(readApiEnv(api).catalogSigningKey).toBeNull();
    expect(readWorkerEnv(worker).publicationSigningKey).toBeNull();
  });

  it('announce an optional minimum application version (SYN-02)', () => {
    expect(readApiEnv(api).minAppVersion).toBeNull();
    expect(readApiEnv({ ...api, MOBILE_MIN_APP_VERSION: '0.2.0' }).minAppVersion).toBe('0.2.0');
    expect(() => readApiEnv({ ...api, MOBILE_MIN_APP_VERSION: '0.2' })).toThrow(/MOBILE_MIN_APP_VERSION/);
  });

  it('are mandatory in shared environments', () => {
    for (const appEnv of ['staging', 'production']) {
      expect(() => readApiEnv({ ...api, APP_ENV: appEnv })).toThrow(/CATALOG_SIGNING_KEY/);
      expect(() => readWorkerEnv({ ...worker, APP_ENV: appEnv })).toThrow(/PUBLICATION_SIGNING_KEY/);
      expect(readApiEnv({ ...api, APP_ENV: appEnv, CATALOG_SIGNING_KEY: 'k' }).catalogSigningKey).toBe('k');
      expect(
        readWorkerEnv({ ...worker, APP_ENV: appEnv, PUBLICATION_SIGNING_KEY: 'k', ANTIVIRUS_URL: 'tcp://clamav:3310' })
          .publicationSigningKey,
      ).toBe('k');
    }
  });
});

describe('antivirus (SEC-01)', () => {
  const worker = { WORKER_DATABASE_URL: 'postgresql://etare_worker:pw@db:5432/etare', PUBLICATION_SIGNING_KEY: 'k' };

  it('is optional in development only, where files are checked without it', () => {
    expect(readWorkerEnv(worker).antivirusUrl).toBeNull();
    for (const appEnv of ['staging', 'production']) {
      expect(() => readWorkerEnv({ ...worker, APP_ENV: appEnv })).toThrow(/ANTIVIRUS_URL/);
    }
  });

  it('is a clamd address', () => {
    expect(readWorkerEnv({ ...worker, ANTIVIRUS_URL: 'tcp://127.0.0.1:3310' }).antivirusUrl).toBe(
      'tcp://127.0.0.1:3310',
    );
    expect(() => readWorkerEnv({ ...worker, ANTIVIRUS_URL: 'http://clamav' })).toThrow(/ANTIVIRUS_URL/);
  });
});
