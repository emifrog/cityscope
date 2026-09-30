import type { Permission } from './authorization';

export type AssuranceLevel = 'aal1' | 'aal2';
export type RequestOrigin = 'web' | 'mobile' | 'api' | 'integration';
export type IdentityProvider = 'supabase' | 'oidc' | 'saml';

/** An authenticated caller, as proven by the identity provider (not yet authorized). */
export interface Principal {
  readonly provider: IdentityProvider;
  readonly subject: string;
  readonly email: string | null;
  readonly assurance: AssuranceLevel;
}

/**
 * Context of a request. The tenant id comes from the client (active SIS) and
 * is NOT an authorization: the database re-checks the membership when the
 * request context is opened (app.begin_request).
 */
export interface RequestContext {
  readonly principal: Principal;
  readonly tenantId: string | null;
  readonly traceId: string;
  readonly origin: RequestOrigin;
}

export interface TenantRequestContext extends RequestContext {
  readonly tenantId: string;
}

/** What the database resolved for the request: the product user and its effective permissions. */
export interface ResolvedAccess {
  readonly userId: string;
  readonly tenantId: string | null;
  readonly permissions: ReadonlySet<Permission>;
}
