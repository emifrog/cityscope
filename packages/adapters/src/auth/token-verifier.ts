import { Unauthenticated, type Principal } from '@etare/domain';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

export interface AccessTokenVerifier {
  verify(token: string): Promise<Principal>;
}

export interface TokenVerifierOptions {
  readonly issuer: string;
  readonly audience: string;
  readonly keys: JWTVerifyGetKey;
}

const claimsSchema = z.object({
  sub: z.string().min(1).max(255),
  // Only end-user tokens: never anon or service_role tokens.
  role: z.literal('authenticated'),
  aal: z.enum(['aal1', 'aal2']).default('aal1'),
  email: z.string().optional(),
  is_anonymous: z.literal(false).optional(),
});

/**
 * Verifies signature (asymmetric keys only), issuer, audience and expiry of
 * an access token, then extracts the principal. Authorization is NOT decided
 * here: roles present in a token may be stale, the database re-checks them.
 */
export function createTokenVerifier(options: TokenVerifierOptions): AccessTokenVerifier {
  return {
    async verify(token: string): Promise<Principal> {
      try {
        const { payload } = await jwtVerify(token, options.keys, {
          issuer: options.issuer,
          audience: options.audience,
          algorithms: ['ES256', 'RS256', 'EdDSA'],
          clockTolerance: 5,
          requiredClaims: ['sub', 'exp', 'iat'],
        });
        const claims = claimsSchema.parse(payload);
        return {
          provider: 'supabase',
          subject: claims.sub,
          email: claims.email ?? null,
          assurance: claims.aal,
        };
      } catch {
        throw new Unauthenticated('Jeton d’accès invalide ou expiré.');
      }
    },
  };
}

/** Supabase Auth: public keys fetched (and cached) from the JWKS endpoint. */
export function createSupabaseTokenVerifier(options: {
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUrl: string;
}): AccessTokenVerifier {
  return createTokenVerifier({
    issuer: options.issuer,
    audience: options.audience,
    keys: createRemoteJWKSet(new URL(options.jwksUrl), { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 }),
  });
}
