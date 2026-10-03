import { Unauthenticated } from '@etare/domain';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTokenVerifier, type AccessTokenVerifier } from './token-verifier';

const issuer = 'http://127.0.0.1:54321/auth/v1';
const session_id = '5e551011-0000-4000-8000-000000000001';
let verifier: AccessTokenVerifier;
let sign: (claims: JWTPayload, options?: { expiresIn?: string; issuer?: string; audience?: string }) => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256' };
  verifier = createTokenVerifier({ issuer, audience: 'authenticated', keys: createLocalJWKSet({ keys: [jwk] }) });
  sign = (claims, options = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(options.issuer ?? issuer)
      .setAudience(options.audience ?? 'authenticated')
      .setSubject('00000000-0000-4000-a000-000000000002')
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '5m')
      .sign(privateKey);
});

describe('access token verification', () => {
  it('extracts the principal of a valid end-user token', async () => {
    const token = await sign({ role: 'authenticated', aal: 'aal2', email: 'redacteur06@demo.etare.test', session_id });
    await expect(verifier.verify(token)).resolves.toEqual({
      provider: 'supabase',
      subject: '00000000-0000-4000-a000-000000000002',
      email: 'redacteur06@demo.etare.test',
      assurance: 'aal2',
      sessionId: session_id,
    });
  });

  it.each([
    ['an expired token', () => sign({ role: 'authenticated', session_id }, { expiresIn: '-10m' })],
    [
      'a token of another issuer',
      () => sign({ role: 'authenticated', session_id }, { issuer: 'https://evil.example/auth/v1' }),
    ],
    ['a token for another audience', () => sign({ role: 'authenticated', session_id }, { audience: 'other' })],
    ['a service_role token', () => sign({ role: 'service_role', session_id })],
    ['an anonymous session', () => sign({ role: 'authenticated', is_anonymous: true, session_id })],
    ['a token without session (it could never be revoked)', () => sign({ role: 'authenticated' })],
  ])('rejects %s', async (_label, makeToken) => {
    await expect(verifier.verify(await makeToken())).rejects.toBeInstanceOf(Unauthenticated);
  });

  it('rejects symmetric (HS256) tokens even when well-formed', async () => {
    const secret = new TextEncoder().encode('super-secret-jwt-token-with-at-least-32-characters-long');
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setSubject('x')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(Unauthenticated);
  });

  it('rejects garbage', async () => {
    await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(Unauthenticated);
  });
});
