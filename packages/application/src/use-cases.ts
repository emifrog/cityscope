import type { MeResponse, SiteDetail, SiteListQuery, SiteListResponse } from '@etare/contracts';
import {
  AccessDenied,
  NotFound,
  PRIVILEGED_PERMISSIONS,
  SerializationConflict,
  StrongAuthenticationRequired,
  TenantRequired,
  type Permission,
  type RequestContext,
  type ResolvedAccess,
} from '@etare/domain';
import type { RequestSession, SessionFactory, SessionOptions } from './ports';

/**
 * Application-level authorization. The database enforces the same rules
 * through RLS; this layer gives explicit errors and keeps the rules readable.
 */
export function requirePermission(
  access: ResolvedAccess,
  context: RequestContext,
  permission: Permission,
  grantedWithSecondFactor = false,
): void {
  if (access.permissions.has(permission)) return;
  if (grantedWithSecondFactor && context.principal.assurance !== 'aal2') throw new StrongAuthenticationRequired();
  throw new AccessDenied();
}

/**
 * Runs work in a tenant-scoped session after checking the permission. Every
 * tenant use case goes through here, so none can forget either check.
 */
export async function inTenant<T>(
  sessions: SessionFactory,
  context: RequestContext,
  permission: Permission,
  work: (session: RequestSession) => Promise<T>,
  options?: SessionOptions,
): Promise<T> {
  if (!context.tenantId) throw new TenantRequired();
  return sessions.run(
    context,
    async (session) => {
      // MFA_REQUIRED only for people whose roles grant the permission once the second factor is used;
      // the others get FORBIDDEN (checked lazily: only when a privileged permission is missing).
      const grantedWithSecondFactor =
        !session.access.permissions.has(permission) &&
        PRIVILEGED_PERMISSIONS.has(permission) &&
        context.principal.assurance !== 'aal2' &&
        (await session.identity.holdsWithSecondFactor(permission));
      requirePermission(session.access, context, permission, grantedWithSecondFactor);
      return work(session);
    },
    options,
  );
}

/**
 * Runs a transaction again when it crossed another one (serialization failure
 * under REPEATABLE READ): the rolled-back work is repeated on a fresh snapshot.
 * Only for work without effects outside the database.
 */
export async function retryOnSerializationConflict<T>(work: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!(error instanceof SerializationConflict) || attempt >= attempts) throw error;
    }
  }
}

/** Same answer for "does not exist" and "belongs to another SIS": identifiers reveal nothing. */
export function found<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new NotFound(message);
  return value;
}

export async function getMe(sessions: SessionFactory, context: RequestContext): Promise<MeResponse> {
  // Readable without the second factor of an enrolled account: the client learns what it must ask for.
  return sessions.run({ ...context, tenantId: null, purpose: 'profile' }, (session) => session.identity.me());
}

export async function listSites(
  sessions: SessionFactory,
  context: RequestContext,
  query: SiteListQuery,
): Promise<SiteListResponse> {
  return inTenant(sessions, context, 'site:read', (session) => session.sites.list(query));
}

export async function getSite(sessions: SessionFactory, context: RequestContext, id: string): Promise<SiteDetail> {
  return inTenant(sessions, context, 'site:read', async (session) =>
    found(await session.sites.get(id), 'Site introuvable.'),
  );
}
