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
import type { SessionFactory } from './ports';

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

function requireTenant(context: RequestContext): void {
  if (!context.tenantId) throw new TenantRequired();
}

export async function getMe(sessions: SessionFactory, context: RequestContext): Promise<MeResponse> {
  return sessions.run({ ...context, tenantId: null }, (session) => session.identity.me());
}

export async function listSites(
  sessions: SessionFactory,
  context: RequestContext,
  query: SiteListQuery,
): Promise<SiteListResponse> {
  requireTenant(context);
  return sessions.run(context, async (session) => {
    requirePermission(session.access, context, 'site:read');
    return session.sites.list(query);
  });
}

export async function getSite(sessions: SessionFactory, context: RequestContext, id: string): Promise<SiteDetail> {
  requireTenant(context);
  return sessions.run(context, async (session) => {
    requirePermission(session.access, context, 'site:read');
    const site = await session.sites.get(id);
    // Same answer for "does not exist" and "belongs to another SIS": ids reveal nothing.
    if (!site) throw new NotFound('Site introuvable.');
    return site;
  });
}
