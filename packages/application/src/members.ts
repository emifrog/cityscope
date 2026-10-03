import type { Member, MemberInvitation, MemberInvite, MemberUpdate } from '@etare/contracts';
import { ServiceUnavailable, type RequestContext } from '@etare/domain';
import type { IdentityProvisioner, SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

export interface MemberDependencies {
  readonly sessions: SessionFactory;
  /** Null when the identity provider administration is not configured (invitations answer 503). */
  readonly identities: IdentityProvisioner | null;
}

/** member:manage is privileged: the second factor is required (MFA_REQUIRED otherwise). */
export async function listMembers(sessions: SessionFactory, context: RequestContext): Promise<Member[]> {
  return inTenant(sessions, context, 'member:manage', (session) => session.members.list());
}

/**
 * Invites a person into the active SIS. An existing account is attached
 * directly; otherwise the identity is created (invitation e-mail) and then
 * attached. The permission is checked before anything is sent.
 */
export async function inviteMember(
  deps: MemberDependencies,
  context: RequestContext,
  input: MemberInvite,
): Promise<MemberInvitation> {
  const attached = await inTenant(deps.sessions, context, 'member:manage', async (session) => {
    const member = await session.members.add(input, null);
    if (member) await session.audit.record('member.invite', 'membership', member.id, { invitation_sent: false });
    return member;
  });
  if (attached) return { member: attached, invitation: 'existing_account' };

  if (!deps.identities) throw new ServiceUnavailable('Les invitations ne sont pas configurées sur ce serveur.');
  const identity = await deps.identities.invite(input.email, input.display_name ?? null);
  const member = await inTenant(deps.sessions, context, 'member:manage', async (session) => {
    const created = found(await session.members.add(input, identity.subject), 'Membre introuvable.');
    await session.audit.record('member.invite', 'membership', created.id, {
      invitation_sent: identity.invitationSent,
    });
    return created;
  });
  return { member, invitation: identity.invitationSent ? 'sent' : 'existing_account' };
}

/**
 * Resets the second factor of a member (lost telephone, identity checked by the SIS): the
 * factor and the sessions are removed, a new factor is required, the member is alerted.
 */
export async function resetMemberSecondFactor(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
): Promise<Member> {
  return inTenant(sessions, context, 'member:manage', async (session) =>
    found(await session.members.resetSecondFactor(id, expectedVersion), 'Membre introuvable.'),
  );
}

export async function updateMember(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: MemberUpdate,
): Promise<Member> {
  return inTenant(sessions, context, 'member:manage', async (session) =>
    found(await session.members.update(id, expectedVersion, patch), 'Membre introuvable.'),
  );
}
