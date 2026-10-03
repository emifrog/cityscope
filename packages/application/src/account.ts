import type { AccountSessionList, SecuritySettings, SessionRevocation } from '@etare/contracts';
import { AccessDenied, NotFound, type RequestContext } from '@etare/domain';
import type { SessionFactory } from './ports';
import { inTenant } from './use-cases';

/** Open sessions of the caller (browsers, applications), the current one flagged. */
export async function listMySessions(sessions: SessionFactory, context: RequestContext): Promise<AccountSessionList> {
  return sessions.run({ ...context, tenantId: null }, async (session) => ({ items: await session.account.sessions() }));
}

/** Closes one session of the caller: its token is refused at its next request. */
export async function revokeMySession(
  sessions: SessionFactory,
  context: RequestContext,
  sessionId: string,
): Promise<SessionRevocation> {
  return sessions.run({ ...context, tenantId: null }, async (session) => {
    const revoked = await session.account.revoke(sessionId);
    if (revoked === 0) throw new NotFound('Session introuvable ou déjà fermée.');
    return { revoked };
  });
}

/** Closes every session of the caller but the current one ("déconnecter les autres appareils"). */
export async function revokeMyOtherSessions(
  sessions: SessionFactory,
  context: RequestContext,
): Promise<SessionRevocation> {
  return sessions.run({ ...context, tenantId: null }, async (session) => ({
    revoked: await session.account.revoke(null),
  }));
}

export async function getSecuritySettings(
  sessions: SessionFactory,
  context: RequestContext,
): Promise<SecuritySettings> {
  return inTenant(sessions, context, 'member:manage', async (session) => {
    const settings = await session.security.get();
    if (!settings) throw new AccessDenied();
    return settings;
  });
}

/** Second-factor policy of the SIS: member:manage, and always with the second factor in use (database). */
export async function updateSecuritySettings(
  sessions: SessionFactory,
  context: RequestContext,
  input: SecuritySettings,
): Promise<SecuritySettings> {
  return inTenant(sessions, context, 'member:manage', (session) => session.security.update(input));
}
