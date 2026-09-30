import type { MeResponse, SiteDetail, SiteListQuery, SiteListResponse } from '@etare/contracts';
import {
  AccessDenied,
  NotFound,
  PRIVILEGED_PERMISSIONS,
  StrongAuthenticationRequired,
  TenantRequired,
  type Permission,
  type RequestContext,
  type ResolvedAccess,
} from '@etare/domain';
import type { RequestSession, SessionFactory } from './ports';

/**
 * Application-level authorization. The database enforces the same rules
 * through RLS; this layer gives explicit errors and keeps the rules readable.
 */
export function requirePermission(access: ResolvedAccess, context: RequestContext, permission: Permission): void {
  if (access.permissions.has(permission)) return;
  if (PRIVILEGED_PERMISSIONS.has(permission) && context.principal.assurance !== 'aal2') {
    throw new StrongAuthenticationRequired();
  }
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
): Promise<T> {
  if (!context.tenantId) throw new TenantRequired();
  return sessions.run(context, async (session) => {
    requirePermission(session.access, context, permission);
    return work(session);
  });
}

/** Same answer for "does not exist" and "belongs to another SIS": identifiers reveal nothing. */
export function found<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new NotFound(message);
  return value;
}

export async function getMe(sessions: SessionFactory, context: RequestContext): Promise<MeResponse> {
  return sessions.run({ ...context, tenantId: null }, (session) => session.identity.me());
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
