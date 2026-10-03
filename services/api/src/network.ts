import { createHash } from 'node:crypto';
import type { ApiErrorCode } from '@etare/contracts';

/** A rate limit: at most `limit` hits per fixed window of `windowSeconds`. */
export interface RateLimitRule {
  /** Part of the hashed key: changing it starts fresh windows. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

/**
 * Default limits (SEC-03, ADR-023). Generous for a person at work, tight on what an attacker
 * repeats: enrollment codes, recovery codes, invitations, uploads, outbound geocoding calls.
 * The sign-in itself goes to the identity provider, which has its own limits.
 */
export const DEFAULT_RATE_LIMITS = {
  /** Every authenticated request, per person. */
  api: { name: 'api', limit: 600, windowSeconds: 60 },
  /** Rejected tokens, per client address (when a trusted proxy gives it). */
  unauthenticated: { name: 'unauthenticated', limit: 120, windowSeconds: 60 },
  enrollment: { name: 'enrollment', limit: 10, windowSeconds: 3600 },
  enrollmentAddress: { name: 'enrollment-address', limit: 30, windowSeconds: 3600 },
  recovery: { name: 'recovery', limit: 5, windowSeconds: 900 },
  invitation: { name: 'invitation', limit: 30, windowSeconds: 3600 },
  upload: { name: 'upload', limit: 120, windowSeconds: 3600 },
  geocoding: { name: 'geocoding', limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitRules = { readonly [K in keyof typeof DEFAULT_RATE_LIMITS]: RateLimitRule };
type RuleName = keyof RateLimitRules;

/** Limits of particular operations, on top of the per-person limit of every request. */
export const OPERATION_LIMITS: Readonly<Record<string, readonly (readonly [RuleName, 'person' | 'address'])[]>> = {
  enrollDevice: [
    ['enrollment', 'person'],
    ['enrollmentAddress', 'address'],
  ],
  recoverSecondFactor: [['recovery', 'person']],
  inviteMember: [['invitation', 'person']],
  createPortalInvitation: [['invitation', 'person']],
  createDocument: [['upload', 'person']],
  createDocumentVersion: [['upload', 'person']],
  createPlan: [['upload', 'person']],
  createPlanRevision: [['upload', 'person']],
  createObjectPhoto: [['upload', 'person']],
  createPortalContribution: [['upload', 'person']],
  submitFieldReport: [['upload', 'person']],
  searchAddresses: [['geocoding', 'person']],
  reverseGeocode: [['geocoding', 'person']],
};

/** Hashed key of a counter: no identifier nor address is stored in clear. */
export function rateLimitKey(rule: RateLimitRule, dimension: 'person' | 'address', value: string): string {
  return createHash('sha256').update(`${rule.name}|${dimension}|${value}`).digest('hex');
}

/**
 * Client address given by trusted proxies: the entry of X-Forwarded-For `trustedHops` positions
 * from the right (each trusted proxy appends the address it saw). Without a trusted proxy the
 * header may come from the client itself (Next.js keeps it): the address is then unknown.
 */
export function clientAddress(forwardedFor: string | undefined, trustedHops: number): string | null {
  if (trustedHops <= 0 || !forwardedFor) return null;
  const entries = forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const entry = entries[entries.length - trustedHops];
  return entry && /^[0-9A-Fa-f:.]{2,45}$/.test(entry) ? entry : null;
}

/** Browsers may call the API from its own origin, or from the configured ones; never from elsewhere. */
export function originAllowed(origin: string, requestUrl: string, allowed: readonly string[]): boolean {
  if (origin === 'null') return false;
  try {
    const parsed = new URL(origin).origin;
    return parsed === new URL(requestUrl).origin || allowed.includes(parsed);
  } catch {
    return false;
  }
}

/** Refusals traced in the audit log, by error code (some only on sensitive operations). */
export function securityAction(code: ApiErrorCode, operationId: string | null, authenticated: boolean): string | null {
  switch (code) {
    case 'FORBIDDEN':
      return 'security.forbidden';
    case 'SELF_APPROVAL_FORBIDDEN':
      return 'security.self_approval';
    case 'MFA_REQUIRED':
      return 'security.mfa_required';
    case 'RATE_LIMITED':
      return 'security.rate_limited';
    case 'DEVICE_PROOF_INVALID':
      return 'security.device_proof_invalid';
    case 'DEVICE_REVOKED':
      return 'security.device_revoked';
    case 'DEVICE_NOT_ENROLLED':
      return 'security.device_not_enrolled';
    // A valid token refused (closed session, unknown account); rejected tokens are only counted.
    case 'UNAUTHENTICATED':
      return authenticated ? 'security.session_refused' : null;
    case 'VALIDATION_FAILED':
      if (operationId === 'enrollDevice') return 'security.enrollment_refused';
      if (operationId === 'recoverSecondFactor') return 'security.recovery_refused';
      return null;
    default:
      return null;
  }
}
