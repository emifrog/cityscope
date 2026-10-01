import type { PortalInvitation } from '@etare/contracts';
import {
  AccessDenied,
  InvalidInput,
  ServiceUnavailable,
  permissionsForRoles,
  type RequestContext,
  type Role,
} from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { createPortalInvitation, endOfDayInParis, listPortalInvitations } from './portal-access';
import type { IdentityProvisioner, PortalAccessRepository, RequestSession, SessionFactory } from './ports';
import { stubSession } from './testing';

const TENANT = '06000000-0000-4000-8000-000000000000';
const EHPAD = '06000002-0000-4000-8000-000000000001';
const INVITATION = '0600bbbb-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-01T10:00:00.000Z');

const context: RequestContext = {
  principal: { provider: 'supabase', subject: 'editor', email: null, assurance: 'aal2' },
  tenantId: TENANT,
  traceId: 'trace',
  origin: 'web',
};

const invitation: PortalInvitation = {
  id: INVITATION,
  email: 'direction@ehpad.test',
  display_name: 'Direction',
  organization: 'EHPAD',
  sites: [{ id: EHPAD, name: 'EHPAD Les Oliviers' }],
  state: 'pending',
  expires_at: '2026-10-08T10:00:00.000Z',
  access_until: null,
  invited_by_name: 'Rédacteur',
  created_at: NOW.toISOString(),
  accepted_at: null,
  revoked_at: null,
  revocation_reason: null,
  row_version: 1,
};

function setup(roles: Role[], accountExists: boolean, identities: IdentityProvisioner | null = null) {
  const portal = {
    invite: vi.fn<PortalAccessRepository['invite']>(async (_input, subject) =>
      accountExists || subject ? { invitationId: INVITATION, accountCreated: !accountExists } : null,
    ),
    getInvitation: vi.fn<PortalAccessRepository['getInvitation']>(async () => invitation),
    listInvitations: vi.fn<PortalAccessRepository['listInvitations']>(async () => [invitation]),
    notifyInvitation: vi.fn<PortalAccessRepository['notifyInvitation']>(async () => undefined),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) =>
      work(
        stubSession(
          { userId: 'user', tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) },
          { portal, audit },
        ),
      ),
  };
  return { deps: { sessions, identities, now: () => NOW }, portal, audit };
}

const request = { email: 'direction@ehpad.test', site_ids: [EHPAD], valid_days: 7 };

describe('exploitant invitations', () => {
  it('ends the access at the end of the chosen day in Paris, summer or winter', () => {
    expect(endOfDayInParis('2026-12-31').toISOString()).toBe('2026-12-31T22:59:59.999Z');
    expect(endOfDayInParis('2027-07-14').toISOString()).toBe('2027-07-14T21:59:59.999Z');
  });

  it('invites an existing account with a notification instead of an account e-mail, dates resolved', async () => {
    const { deps, portal, audit } = setup(['PREVISION_EDITOR'], true);
    const result = await createPortalInvitation(deps, context, { ...request, access_until: '2027-09-30' });
    expect(result).toEqual({ invitation, notice: 'existing_account' });
    expect(portal.invite).toHaveBeenCalledTimes(1);
    const [input, subject] = portal.invite.mock.calls[0] ?? [];
    expect(subject).toBeNull();
    expect(input?.expiresAt.toISOString()).toBe('2026-10-08T10:00:00.000Z');
    expect(input?.accessUntil?.toISOString()).toBe('2027-09-30T21:59:59.999Z');
    expect(audit.record).toHaveBeenCalledWith('portal.invite', 'portal_invitation', INVITATION, { sites: 1 });
    expect(portal.notifyInvitation).toHaveBeenCalledWith(INVITATION);
  });

  it('provisions an identity only for a new address, after the permission check', async () => {
    const identities = { invite: vi.fn(async () => ({ subject: 'new-subject', invitationSent: true })) };
    const { deps, portal } = setup(['SIS_ADMIN'], false, identities);
    const result = await createPortalInvitation(deps, context, request);
    expect(result.notice).toBe('sent');
    expect(identities.invite).toHaveBeenCalledWith('direction@ehpad.test', null);
    expect(portal.invite).toHaveBeenLastCalledWith(expect.anything(), 'new-subject');
    // The account creation e-mail carries the invitation: no second e-mail.
    expect(portal.notifyInvitation).not.toHaveBeenCalled();

    const withoutProvider = setup(['SIS_ADMIN'], false);
    await expect(createPortalInvitation(withoutProvider.deps, context, request)).rejects.toThrow(ServiceUnavailable);
  });

  it('refuses people who may not invite, before any e-mail', async () => {
    const identities = { invite: vi.fn(async () => ({ subject: 's', invitationSent: true })) };
    const { deps } = setup(['PREVISION_VALIDATOR'], false, identities);
    await expect(createPortalInvitation(deps, context, request)).rejects.toThrow(AccessDenied);
    await expect(listPortalInvitations(deps.sessions, context)).rejects.toThrow(AccessDenied);
    expect(identities.invite).not.toHaveBeenCalled();
  });

  it('refuses an access ending before the invitation itself', async () => {
    const { deps } = setup(['PREVISION_EDITOR'], true);
    await expect(
      createPortalInvitation(deps, context, { ...request, valid_days: 30, access_until: '2026-10-15' }),
    ).rejects.toThrow(InvalidInput);
  });
});
