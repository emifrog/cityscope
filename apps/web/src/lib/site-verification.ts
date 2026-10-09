/** After this delay without a field check, the working data of a site deserve a new one. */
export const VERIFICATION_MAX_AGE_MS = 365 * 86_400_000;

export type VerificationState = 'verified' | 'stale' | 'never';

/** Whether the last field check of a site is recent enough, overdue, or missing. */
export function verificationState(lastVerifiedAt: string | null, now: number = Date.now()): VerificationState {
  if (!lastVerifiedAt) return 'never';
  const at = Date.parse(lastVerifiedAt);
  if (Number.isNaN(at)) return 'never';
  return now - at > VERIFICATION_MAX_AGE_MS ? 'stale' : 'verified';
}
