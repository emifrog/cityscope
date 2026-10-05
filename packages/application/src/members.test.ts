import type { Member } from '@etare/contracts';
import {
  AccessDenied,
  ServiceUnavailable,
  StrongAuthenticationRequired,
  permissionsForRoles,
  type Permission,
  type RequestContext,
} from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { inviteMember, listMembers } from './members';
import type { IdentityProvisioner, RequestSession, SessionFactory } from './ports';
import { stubSession } from './testing';

const context: RequestContext = {
  principal: { provider: 'supabase', subject: 'admin', email: 'admin@demo.etare.test', assurance: 'aal2' },
  tenantId: '06000000-0000-4000-8000-000000000000',
  traceId: 'trace',
  origin: 'web',
};

const member: Member = {
  id: '0600000a-0000-4000-8000-0000000000aa',
  user_id: '00000000-0000-4000-b000-0000000000aa',
  email: 'nouveau@demo.etare.test',
  display_name: 'Nouveau',
  status: 'active',
  account_status: 'active',
  roles: ['READER'],
  site_roles: [],
  perimeter: null,
  is_self: false,
  last_sign_in_at: null,
  second_factor: false,
  row_version: 1,
  created_at: '2026-09-30T10:00:00.000Z',
};
const invite = { email: 'nouveau@demo.etare.test', display_name: 'Nouveau', roles: ['READER' as const] };

/** The database drops privileged permissions without the second factor: mirror it here. */
function fakeSessions(
  permissions: ReadonlySet<Permission>,
  add: (subject: string | null) => Member | null,
  heldWithSecondFactor = false,
) {
  const members = {
    add: vi.fn(async (_input: unknown, subject: string | null) => add(subject)),
    list: vi.fn(async () => []),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const identity = { holdsWithSecondFactor: vi.fn(async () => heldWithSecondFactor) };
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) =>
      work(stubSession({ userId: 'admin', tenantId: ctx.tenantId, permissions }, { members, audit, identity })),
  };
  return { sessions, members, audit };
}

const admin = permissionsForRoles(['SIS_ADMIN']);
const identities = (): IdentityProvisioner & { invite: ReturnType<typeof vi.fn> } => ({
  invite: vi.fn(async () => ({ subject: 'new-subject', invitationSent: true })),
});

describe('member administration', () => {
  it('asks for the second factor before anything else', async () => {
    const withoutPrivileges = new Set([...admin].filter((permission) => permission !== 'member:manage'));
    const { sessions, members } = fakeSessions(withoutPrivileges, () => member, true);
    const provisioner = identities();
    const aal1 = { ...context, principal: { ...context.principal, assurance: 'aal1' as const } };
    await expect(inviteMember({ sessions, identities: provisioner }, aal1, invite)).rejects.toBeInstanceOf(
      StrongAuthenticationRequired,
    );
    expect(members.add).not.toHaveBeenCalled();
    expect(provisioner.invite).not.toHaveBeenCalled();
  });

  it('is reserved to administrators, without suggesting a second factor to others', async () => {
    const { sessions } = fakeSessions(permissionsForRoles(['PREVISION_EDITOR']), () => member, false);
    const aal1 = { ...context, principal: { ...context.principal, assurance: 'aal1' as const } };
    await expect(listMembers(sessions, aal1)).rejects.toBeInstanceOf(AccessDenied);
  });

  it('attaches an existing account without sending an invitation', async () => {
    const { sessions, members, audit } = fakeSessions(admin, () => member);
    const provisioner = identities();
    await expect(inviteMember({ sessions, identities: provisioner }, context, invite)).resolves.toEqual({
      member,
      invitation: 'existing_account',
    });
    expect(members.add).toHaveBeenCalledOnce();
    expect(provisioner.invite).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('member.invite', 'membership', member.id, { invitation_sent: false });
  });

  it('creates the identity, then attaches it, for a new address', async () => {
    const { sessions, members, audit } = fakeSessions(admin, (subject) => (subject ? member : null));
    const provisioner = identities();
    await expect(inviteMember({ sessions, identities: provisioner }, context, invite)).resolves.toEqual({
      member,
      invitation: 'sent',
    });
    expect(provisioner.invite).toHaveBeenCalledWith('nouveau@demo.etare.test', 'Nouveau');
    expect(members.add).toHaveBeenLastCalledWith(invite, 'new-subject');
    expect(audit.record).toHaveBeenCalledWith('member.invite', 'membership', member.id, { invitation_sent: true });
  });

  it('answers 503 when invitations are not configured', async () => {
    const { sessions } = fakeSessions(admin, () => null);
    await expect(inviteMember({ sessions, identities: null }, context, invite)).rejects.toBeInstanceOf(
      ServiceUnavailable,
    );
  });
});
