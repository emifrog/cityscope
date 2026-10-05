import type {
  Member,
  MemberInvitation,
  MemberInvite,
  MemberPerimeterInput,
  MemberSensitiveAccessInput,
  MemberUpdate,
} from '@etare/contracts';
import { ServiceUnavailable, type RequestContext } from '@etare/domain';
import type { IdentityProvisioner, RequestSession, SessionFactory } from './ports';
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

/** Limits a member invited with a perimeter, in the transaction that attaches them (PER-01). */
async function withPerimeter(session: RequestSession, member: Member, input: MemberInvite): Promise<Member> {
  const sectors = input.sector_ids ?? [];
  const sites = input.site_ids ?? [];
  if (sectors.length === 0 && sites.length === 0) return member;
  return found(
    await session.members.setPerimeter(member.id, member.row_version, { sector_ids: sectors, site_ids: sites }),
    'Membre introuvable.',
  );
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
    if (!member) return null;
    await session.audit.record('member.invite', 'membership', member.id, { invitation_sent: false });
    return withPerimeter(session, member, input);
  });
  if (attached) return { member: attached, invitation: 'existing_account' };

  if (!deps.identities) throw new ServiceUnavailable('Les invitations ne sont pas configurées sur ce serveur.');
  const identity = await deps.identities.invite(input.email, input.display_name ?? null);
  const member = await inTenant(deps.sessions, context, 'member:manage', async (session) => {
    const created = found(await session.members.add(input, identity.subject), 'Membre introuvable.');
    await session.audit.record('member.invite', 'membership', created.id, {
      invitation_sent: identity.invitationSent,
    });
    return withPerimeter(session, created, input);
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

/** Limits the roles of a member to sectors and sites, or gives them the whole SIS back (PER-01). */
export async function setMemberPerimeter(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  input: MemberPerimeterInput,
): Promise<Member> {
  return inTenant(sessions, context, 'member:manage', async (session) =>
    found(await session.members.setPerimeter(id, expectedVersion, input), 'Membre introuvable.'),
  );
}

/**
 * Habilitation to the "restricted" sensitive sites (PER-02): nominative, dated
 * (twelve months at most, renewable), for the whole SIS or sectors; null revokes it.
 */
export async function setMemberSensitiveAccess(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  input: MemberSensitiveAccessInput,
): Promise<Member> {
  return inTenant(sessions, context, 'member:manage', async (session) =>
    found(await session.members.setSensitiveAccess(id, expectedVersion, input), 'Membre introuvable.'),
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
