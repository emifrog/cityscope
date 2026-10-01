/**
 * Exploitant portal (R2, POR-01 to POR-05, ADR-019): the exploitant of a site
 * is invited on that site only, sees a minimal white list of its published
 * version and proposes changes that the SIS instructs; nothing they send ever
 * changes a publication directly.
 */

/** Stored states of an invitation; « expired » is a pending one past its date. */
export const PORTAL_INVITATION_STATES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type PortalInvitationState = (typeof PORTAL_INVITATION_STATES)[number];

/** An invitation can be accepted during 1 to 30 days (7 by default). */
export const PORTAL_INVITATION_DEFAULT_DAYS = 7;
export const PORTAL_INVITATION_MAX_DAYS = 30;
/** Sites one invitation may open. */
export const PORTAL_INVITATION_MAX_SITES = 50;

export function portalInvitationState(input: {
  readonly status: 'pending' | 'accepted' | 'revoked';
  readonly expiresAt: Date;
  readonly now: Date;
}): PortalInvitationState {
  if (input.status === 'pending' && input.expiresAt.getTime() <= input.now.getTime()) return 'expired';
  return input.status;
}

/** Where the caller stands on the portal of the active SIS. */
export const PORTAL_ACCESS_STATES = ['granted', 'mfa_required', 'none'] as const;
export type PortalAccessState = (typeof PORTAL_ACCESS_STATES)[number];
