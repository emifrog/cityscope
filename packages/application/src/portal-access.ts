import type {
  MyPortalInvitationList,
  PortalAccess,
  PortalInvitation,
  PortalInvitationAccepted,
  PortalInvitationCreate,
  PortalInvitationCreated,
  PortalInvitationList,
  PortalInvitationRevoke,
  PortalSettings,
} from '@etare/contracts';
import { AccessDenied, InvalidInput, ServiceUnavailable, type RequestContext } from '@etare/domain';
import type { IdentityProvisioner, PortalInviteInput, SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

export interface PortalAccessDependencies {
  readonly sessions: SessionFactory;
  /** Null when the identity provider administration is not configured (new accounts answer 503). */
  readonly identities: IdentityProvisioner | null;
  readonly now: () => Date;
}

/** End of a calendar day in Paris (the access lasts the whole day shown to the inviter). */
export function endOfDayInParis(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) throw new InvalidInput('Date de fin d’accès invalide.');
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'longOffset' })
    .formatToParts(noonUtc)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(offset ?? '');
  const minutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - minutes * 60_000);
}

export async function listPortalInvitations(
  sessions: SessionFactory,
  context: RequestContext,
): Promise<PortalInvitationList> {
  return inTenant(sessions, context, 'portal:invite', async (session) => ({
    items: await session.portal.listInvitations(),
  }));
}

/**
 * Invites a person on sites of the active SIS. The permission (with the
 * second factor) is checked before anything is sent; an identity is created
 * (account creation e-mail) only for an address without account.
 */
export async function createPortalInvitation(
  deps: PortalAccessDependencies,
  context: RequestContext,
  input: PortalInvitationCreate,
): Promise<PortalInvitationCreated> {
  const now = deps.now();
  const request: PortalInviteInput = {
    email: input.email,
    displayName: input.display_name ?? null,
    organization: input.organization ?? null,
    siteIds: input.site_ids,
    expiresAt: new Date(now.getTime() + input.valid_days * 86_400_000),
    accessUntil: input.access_until ? endOfDayInParis(input.access_until) : null,
  };
  if (request.accessUntil && request.accessUntil.getTime() <= request.expiresAt.getTime()) {
    throw new InvalidInput('La fin de l’accès doit venir après la fin de validité de l’invitation.');
  }

  const record = (invitationId: string) =>
    inTenant(deps.sessions, context, 'portal:invite', async (session) => {
      const invitation = found(await session.portal.getInvitation(invitationId), 'Invitation introuvable.');
      await session.audit.record('portal.invite', 'portal_invitation', invitation.id, {
        sites: invitation.sites.length,
      });
      return invitation;
    });

  // An existing account is told by a notification (POR-05), written with the invitation.
  const existing = await inTenant(deps.sessions, context, 'portal:invite', async (session) => {
    const invited = await session.portal.invite(request, null);
    if (invited) await session.portal.notifyInvitation(invited.invitationId);
    return invited;
  });
  if (existing) return { invitation: await record(existing.invitationId), notice: 'existing_account' };

  if (!deps.identities) throw new ServiceUnavailable('Les invitations ne sont pas configurées sur ce serveur.');
  const identity = await deps.identities.invite(input.email, input.display_name ?? null);
  const created = found(
    await inTenant(deps.sessions, context, 'portal:invite', async (session) => {
      const invited = await session.portal.invite(request, identity.subject);
      // No account creation e-mail (the identity existed already): notify the invitation instead.
      if (invited && !identity.invitationSent) await session.portal.notifyInvitation(invited.invitationId);
      return invited;
    }),
    'Invitation introuvable.',
  );
  return {
    invitation: await record(created.invitationId),
    notice: identity.invitationSent ? 'sent' : 'existing_account',
  };
}

export async function revokePortalInvitation(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  input: PortalInvitationRevoke,
): Promise<PortalInvitation> {
  return inTenant(sessions, context, 'portal:invite', (session) =>
    session.portal.revoke(id, expectedVersion, input.reason),
  );
}

/** Pending invitations of the caller, in every SIS: they are not a member yet. */
export async function listMyPortalInvitations(
  sessions: SessionFactory,
  context: RequestContext,
): Promise<MyPortalInvitationList> {
  return sessions.run({ ...context, tenantId: null }, async (session) => ({
    items: await session.portal.myInvitations(),
  }));
}

export async function acceptPortalInvitation(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
): Promise<PortalInvitationAccepted> {
  return sessions.run({ ...context, tenantId: null }, async (session) => ({
    tenant_id: await session.portal.accept(id),
  }));
}

export async function getPortalSettings(sessions: SessionFactory, context: RequestContext): Promise<PortalSettings> {
  return inTenant(sessions, context, 'member:manage', async (session) => {
    const settings = await session.portal.settings();
    if (!settings) throw new AccessDenied();
    return settings;
  });
}

export async function updatePortalSettings(
  sessions: SessionFactory,
  context: RequestContext,
  input: PortalSettings,
): Promise<PortalSettings> {
  return inTenant(sessions, context, 'member:manage', (session) => session.portal.updateSettings(input));
}

/** Where the caller stands on the portal of the active SIS (any member may ask). */
export async function getPortalAccess(sessions: SessionFactory, context: RequestContext): Promise<PortalAccess> {
  return sessions.run(context, async (session) => ({ state: await session.portal.accessState() }));
}
