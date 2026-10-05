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
 * Permissions a member may hold on part of the SIS only (sectors or sites,
 * PER-01, ADR-025): the use case runs and row-level security shows that part.
 * The others (administration, catalogue, invitations) need the whole SIS.
 */
const PART_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  'site:read',
  'site:write',
  'etare:read',
  'etare:edit',
  'etare:submit',
  'etare:approve',
  'publication:publish',
  'publication:read',
  'offline:download',
  'field_report:create',
  'field_report:review',
  'contribution:review',
]);

export interface TenantOptions extends SessionOptions {
  /** Refuses a member limited to sectors or sites (creating a site, for instance). */
  readonly wholeTenant?: boolean;
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
  options?: TenantOptions,
): Promise<T> {
  if (!context.tenantId) throw new TenantRequired();
  const { wholeTenant = false, ...sessionOptions } = options ?? {};
  return sessions.run(
    context,
    async (session) => {
      const held =
        session.access.permissions.has(permission) ||
        (!wholeTenant && PART_PERMISSIONS.has(permission) && (await session.identity.holdsOnPart(permission)));
      if (!held) {
        // MFA_REQUIRED only for people whose roles grant the permission once the second factor is used;
        // the others get FORBIDDEN (checked lazily: only when a privileged permission is missing).
        const grantedWithSecondFactor =
          PRIVILEGED_PERMISSIONS.has(permission) &&
          context.principal.assurance !== 'aal2' &&
          (await session.identity.holdsWithSecondFactor(permission));
        requirePermission(session.access, context, permission, grantedWithSecondFactor);
      }
      return work(session);
    },
    sessionOptions,
  );
}

/**
 * Like inTenant, for read-only work open to several permissions over the whole
 * SIS (any of them); the error of the first one is kept when none is held.
 */
export async function inTenantWithAny<T>(
  sessions: SessionFactory,
  context: RequestContext,
  permissions: readonly [Permission, ...Permission[]],
  work: (session: RequestSession) => Promise<T>,
): Promise<T> {
  const [first, ...others] = permissions;
  try {
    return await inTenant(sessions, context, first, work);
  } catch (error) {
    const [next, ...rest] = others;
    if (!next || !(error instanceof AccessDenied || error instanceof StrongAuthenticationRequired)) throw error;
    return inTenantWithAny(sessions, context, [next, ...rest], work).catch(() => {
      throw error;
    });
  }
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
