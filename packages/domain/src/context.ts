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
  /** Session of the identity provider the token belongs to: a closed session is refused at once. */
  readonly sessionId?: string | null;
}

/**
 * Why a request may run without the second factor of an enrolled account:
 * 'profile' (reading one's own profile) or 'enrollment' (enrolling a terminal
 * with its single-use code). Terminal requests use deviceId instead.
 */
export type RequestPurpose = 'profile' | 'enrollment';

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
  /**
   * Terminal named by a signed request. Its key stands for the second factor of an
   * enrolled account; the session refuses to commit unless the signature was verified.
   */
  readonly deviceId?: string;
  readonly purpose?: RequestPurpose;
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
