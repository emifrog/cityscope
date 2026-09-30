import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  generatePassword,
  isLocalUrl,
  roleConnectionString,
  scramSha256Verifier,
  upsertEnvValues,
} from './integration';

describe('role connection strings', () => {
  it('keeps host, port, database and TLS options of the pooler URL', () => {
    const admin =
      'postgresql://postgres.abcdefghij:admin-pw@aws-0-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert=C%3A%2Fca.crt';
    const url = new URL(roleConnectionString(admin, 'etare_api', 'p@ss/word'));
    expect(url.username).toBe('etare_api.abcdefghij');
    expect(decodeURIComponent(url.password)).toBe('p@ss/word');
    expect(url.host).toBe('aws-0-eu-west-3.pooler.supabase.com:5432');
    expect(url.pathname).toBe('/postgres');
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('sslrootcert')).toBe('C:/ca.crt');
  });

  it('supports direct connections', () => {
    const url = new URL(
      roleConnectionString('postgresql://postgres:x@db.abc.supabase.co:5432/postgres', 'etare_worker', 'pw'),
    );
    expect(url.username).toBe('etare_worker');
  });

  it('refuses unexpected admin users', () => {
    expect(() => roleConnectionString('postgresql://etare_api:x@host/postgres', 'etare_api', 'pw')).toThrow();
  });
});

describe('SCRAM-SHA-256 verifier', () => {
  it('matches the PostgreSQL format and the RFC 7677 derivation', () => {
    const salt = Buffer.from('0123456789abcdef');
    const verifier = scramSha256Verifier('secret', salt, 4096);
    const [method, rest] = verifier.split('$', 2);
    expect(method).toBe('SCRAM-SHA-256');
    expect(rest).toBe(`4096:${salt.toString('base64')}`);

    const salted = pbkdf2Sync('secret', salt, 4096, 32, 'sha256');
    const stored = createHash('sha256').update(createHmac('sha256', salted).update('Client Key').digest()).digest();
    const server = createHmac('sha256', salted).update('Server Key').digest();
    expect(verifier.endsWith(`$${stored.toString('base64')}:${server.toString('base64')}`)).toBe(true);
  });

  it('never contains the password', () => {
    const password = generatePassword();
    expect(scramSha256Verifier(password)).not.toContain(password);
  });
});

describe('dotenv update', () => {
  it('replaces existing keys, keeps comments and appends missing keys', () => {
    const content = '# comment\nAPP_ENV=integration\nDATABASE_URL=\n';
    expect(upsertEnvValues(content, { DATABASE_URL: 'postgresql://x', WORKER_DATABASE_URL: 'postgresql://y' })).toBe(
      '# comment\nAPP_ENV=integration\nDATABASE_URL=postgresql://x\nWORKER_DATABASE_URL=postgresql://y\n',
    );
  });
});

describe('misc', () => {
  it('generates long URL-safe passwords', () => {
    expect(generatePassword()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('recognises local URLs', () => {
    expect(isLocalUrl('postgresql://postgres@127.0.0.1:54322/postgres')).toBe(true);
    expect(isLocalUrl('https://abc.supabase.co')).toBe(false);
  });
});
