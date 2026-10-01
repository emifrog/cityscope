import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, PORTAL_PERMISSIONS, PRIVILEGED_PERMISSIONS } from './authorization';
import { portalInvitationState } from './portal';

describe('exploitant portal', () => {
  const now = new Date('2026-10-01T12:00:00Z');

  it('shows a pending invitation past its date as expired', () => {
    const expiresAt = new Date('2026-10-01T11:00:00Z');
    expect(portalInvitationState({ status: 'pending', expiresAt, now })).toBe('expired');
    expect(portalInvitationState({ status: 'pending', expiresAt: new Date('2026-10-08T12:00:00Z'), now })).toBe(
      'pending',
    );
    expect(portalInvitationState({ status: 'accepted', expiresAt, now })).toBe('accepted');
    expect(portalInvitationState({ status: 'revoked', expiresAt, now })).toBe('revoked');
  });

  it('lets the SIS administration and the Prévision invite, with the second factor', () => {
    expect(PRIVILEGED_PERMISSIONS.has('portal:invite')).toBe(true);
    expect(DEFAULT_ROLE_PERMISSIONS.SIS_ADMIN).toContain('portal:invite');
    expect(DEFAULT_ROLE_PERMISSIONS.PREVISION_EDITOR).toContain('portal:invite');
    expect(DEFAULT_ROLE_PERMISSIONS.PREVISION_VALIDATOR).not.toContain('portal:invite');
    expect(DEFAULT_ROLE_PERMISSIONS.EXPLOITANT).toEqual([...PORTAL_PERMISSIONS]);
  });
});
