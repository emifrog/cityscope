import type { AccessTokenVerifier, Logger } from '@etare/adapters';
import {
  getMyRecoveryCodes,
  recoverSecondFactor,
  regenerateMyRecoveryCodes,
  resetMemberSecondFactor,
  getSecuritySettings,
  listMySessions,
  revokeMyOtherSessions,
  revokeMySession,
  updateSecuritySettings,
  addDocumentVersion,
  addPlanRevision,
  confirmFieldReportUploads,
  confirmPortalContributionUploads,
  confirmUpload,
  createPortalContribution,
  getContribution,
  getPortalContribution,
  listContributions,
  listNotifications,
  listPortalContributions,
  retryNotification,
  replyPortalContribution,
  updateContribution,
  withdrawPortalContribution,
  createBuilding,
  createDevice,
  createSyncDownloads,
  createSyncBasemapDownloads,
  getBasemapOverview,
  getSyncBasemap,
  recordSyncBasemapReceipt,
  requestBasemapBuild,
  getFieldReport,
  listFieldReports,
  listSyncReports,
  submitFieldReport,
  updateFieldReport,
  createDocument,
  createClassification,
  createContact,
  createExternalId,
  createLevel,
  createObjectPhoto,
  createPlan,
  createSite,
  createSiteObject,
  createRevision,
  createRiskType,
  createSiteRisk,
  createZone,
  decideRevision,
  enrollDevice,
  getAssetDownload,
  getSyncCatalog,
  getSyncKeyset,
  getSyncPackage,
  getRevision,
  getSiteEtare,
  getEtareLayoutSettings,
  updateEtareLayoutSettings,
  getMe,
  acceptPortalInvitation,
  createPortalInvitation,
  getPortalAccess,
  getPortalDocumentDownload,
  getPortalSettings,
  getPortalSite,
  listPortalSites,
  listMyPortalInvitations,
  listPortalInvitations,
  revokePortalInvitation,
  updatePortalSettings,
  getPublicationPdf,
  getMapCatalog,
  getSite,
  inviteMember,
  listBuildings,
  reverseGeocode,
  searchAddresses,
  listClassifications,
  listDevices,
  listContacts,
  listDocuments,
  listExternalIds,
  listMapFeatures,
  listMapSites,
  listMembers,
  listPlans,
  listObjectTypes,
  listSiteObjects,
  listEtareDossiers,
  listRiskTypes,
  listValidations,
  previewSiteEtare,
  publishRevision,
  recordSyncReceipt,
  renewDeviceEnrollment,
  revokeDevice,
  submitRevision,
  listSiteRisks,
  listSiteZones,
  listSites,
  updateBuilding,
  updateClassification,
  updateContact,
  updateDocument,
  updateLevel,
  updateMember,
  setMemberPerimeter,
  setMemberSensitiveAccess,
  listAccessEvents,
  submitAccessEvents,
  setDevicePerimeter,
  listSectors,
  listSectorCommunes,
  createSector,
  updateSector,
  archiveSector,
  updatePlan,
  updateSiteObject,
  updateObjectPhoto,
  updateRiskType,
  updateSiteRisk,
  updateZone,
  updateSite,
  archiveSite,
  restoreSite,
  withdrawPublication,
  type BasemapSourceInfo,
  type CartographyCatalog,
  type ContentSigner,
  type LoadedKeyset,
  type DeviceProof,
  type DeviceSignatureVerifier,
  type Geocoder,
  type HealthProbe,
  type IdentityProvisioner,
  type ObjectStorage,
  type RateLimiter,
  type SecurityEventRecorder,
  type SessionFactory,
} from '@etare/application';
import {
  API_BASE_PATH,
  APP_VERSION_HEADER,
  DEVICE_ID_HEADER,
  DEVICE_SIGNATURE_HEADER,
  DEVICE_TIME_HEADER,
  TENANT_HEADER,
  endpoints,
  type EndpointContract,
} from '@etare/contracts';
import {
  DeviceProofInvalid,
  EMPTY_BODY_SHA256,
  InvalidInput,
  PreconditionRequired,
  RateLimited,
  TenantRequired,
  Unauthenticated,
  type Principal,
  type RequestContext,
  type RequestOrigin,
} from '@etare/domain';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { toApiError } from './errors';
import {
  DEFAULT_RATE_LIMITS,
  OPERATION_LIMITS,
  clientAddress,
  originAllowed,
  rateLimitKey,
  securityAction,
  type RateLimitRule,
  type RateLimitRules,
} from './network';

export interface ApiDependencies {
  readonly sessions: SessionFactory;
  readonly tokens: AccessTokenVerifier;
  readonly health: HealthProbe;
  /** Null when file storage is not configured (document endpoints answer 503). */
  readonly storage: ObjectStorage | null;
  /** Null when identity administration is not configured (invitations of new addresses answer 503). */
  readonly identities: IdentityProvisioner | null;
  readonly cartography: CartographyCatalog;
  /** Source of the offline base maps (ADR-024); null or absent: none on this platform. */
  readonly basemapSource?: BasemapSourceInfo | null;
  readonly geocoder: Geocoder;
  /** SHA-256 (hex) of the UTF-8 bytes of a text (revision snapshots, enrollment codes, request bodies). */
  readonly sha256: (text: string) => Promise<string>;
  /** Catalogue key (offline distribution); null when not configured: terminal endpoints answer 503. */
  readonly catalogSigner: ContentSigner | null;
  /** Key set served to the terminals (SEC-04); null or absent: none (development). */
  readonly keyset?: (() => Promise<LoadedKeyset | null>) | null;
  /** Minimum OPS application version (SYN-02), announced in the catalogues; null: none. */
  readonly minAppVersion?: string | null;
  readonly verifier: DeviceSignatureVerifier;
  readonly randomBytes: (length: number) => Uint8Array;
  readonly now: () => Date;
  readonly logger: Logger;
  readonly version: string;
  readonly openApiDocument: () => unknown;
  /** Shared counters (SEC-03); null or absent: no rate limiting (automated tests). */
  readonly rateLimiter?: RateLimiter | null;
  readonly rateLimits?: RateLimitRules;
  /** Sensitive refusals traced in the audit log; null or absent: logs only. */
  readonly securityEvents?: SecurityEventRecorder | null;
  /** Trusted reverse proxies (client address in X-Forwarded-For); 0: unknown. */
  readonly trustedProxyHops?: number;
  /** Origins allowed besides the own origin of the API (browsers). */
  readonly allowedOrigins?: readonly string[];
}

type Env = { Variables: { traceId: string; principal?: Principal; operationId?: string } };

const CLIENT_HEADER = 'x-client-platform';
const tenantIdSchema = z.uuid();
const originSchema = z.enum(['web', 'mobile', 'integration']);
const MAX_JSON_BODY_BYTES = 64 * 1024;
/** An installation receipt lists the publications of the terminal (thousands of sites). */
const MAX_RECEIPT_BODY_BYTES = 1024 * 1024;
const deviceIdSchema = z.uuid();
const deviceTimeSchema = z.string().regex(/^\d{1,15}$/);
const appVersionSchema = z.string().regex(/^[0-9A-Za-z.+-]{1,32}$/);

/** Accepts "3", W/"3" or 3 (the ETag previously returned by the API). */
export function parseIfMatch(header: string | undefined): number {
  if (!header) throw new PreconditionRequired();
  const match = /^(?:W\/)?"?(\d{1,9})"?$/.exec(header.trim());
  if (!match?.[1])
    throw new InvalidInput('En-tête If-Match invalide.', [{ path: 'if-match', message: 'Version attendue, ex. "3".' }]);
  return Number(match[1]);
}

/** Converts an OpenAPI path template (/sites/{id}) into a router path (/sites/:id). */
export function routerPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1');
}

/**
 * The product HTTP API. Framework-neutral (Fetch API Request/Response): served
 * by thin Next.js route handlers at MVP, and by src/server.ts if the API is
 * ever extracted — without duplicating any rule.
 */
export function createApiApp(deps: ApiDependencies): Hono<Env> {
  const app = new Hono<Env>().basePath(API_BASE_PATH);

  const rules = deps.rateLimits ?? DEFAULT_RATE_LIMITS;
  const addressOf = (c: Context<Env>) => clientAddress(c.req.header('x-forwarded-for'), deps.trustedProxyHops ?? 0);

  /** One hit on a counter; over the limit, the request is refused (429) before any work. */
  async function throttle(c: Context<Env>, rule: RateLimitRule, dimension: 'person' | 'address', value: string | null) {
    if (!deps.rateLimiter || value === null) return;
    const result = await deps.rateLimiter.consume(rateLimitKey(rule, dimension, value), rule.limit, rule.windowSeconds);
    if (!result.allowed) throw new RateLimited(result.retryAfter, result.hits === rule.limit + 1);
  }

  app.use('*', async (c, next) => {
    const traceId = crypto.randomUUID();
    c.set('traceId', traceId);
    // No CORS: browsers call the API from its own origin (or a configured one), never from elsewhere.
    const origin = c.req.header('origin');
    if ((origin && !originAllowed(origin, c.req.url, deps.allowedOrigins ?? [])) || c.req.method === 'OPTIONS') {
      deps.logger.warn('cross-origin request refused', { trace_id: traceId, method: c.req.method });
      await recordRefusal(c, 'security.cross_origin', 'Origine non autorisée.', { method: c.req.method });
      c.header('x-trace-id', traceId);
      return c.json({ error: { code: 'FORBIDDEN', message: 'Origine non autorisée.', trace_id: traceId } }, 403);
    }
    await next();
    c.header('x-trace-id', traceId);
    // Business answers are never cached by browsers or shared caches.
    c.header('cache-control', 'no-store');
    c.header('x-content-type-options', 'nosniff');
    // JSON only: nothing of an answer may run, be framed, or be read by another site.
    c.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    c.header('cross-origin-resource-policy', 'same-origin');
  });

  /** Traces a refusal in its own transaction; a failure of the trace never changes the answer. */
  async function recordRefusal(c: Context<Env>, action: string, reason: string, metadata: Record<string, unknown>) {
    if (!deps.securityEvents) return;
    const principal = c.get('principal');
    const address = addressOf(c);
    try {
      await deps.securityEvents.record({
        action,
        reason,
        principal: principal ? { provider: principal.provider, subject: principal.subject } : null,
        tenantId: c.req.header(TENANT_HEADER) ?? null,
        traceId: c.get('traceId'),
        origin: originSchema.safeParse(c.req.header(CLIENT_HEADER)).data ?? 'api',
        metadata: { ...metadata, ...(address ? { address } : {}) },
      });
    } catch (error) {
      deps.logger.warn('security event not recorded', { trace_id: c.get('traceId'), action, error });
    }
  }

  // JSON bodies are small: bigger payloads (files) go to object storage through signed URLs.
  // Installation receipts are the one exception (the list of the publications of a terminal).
  const tooLarge = (c: Context<Env>) =>
    c.json(
      { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Requête trop volumineuse.', trace_id: c.get('traceId') } },
      413,
    );
  const jsonLimit = bodyLimit({ maxSize: MAX_JSON_BODY_BYTES, onError: tooLarge });
  const receiptLimit = bodyLimit({ maxSize: MAX_RECEIPT_BODY_BYTES, onError: tooLarge });
  const receiptPath = `${API_BASE_PATH}${endpoints.recordSyncReceipt.path}`;
  app.use('*', (c, next) => (c.req.path === receiptPath ? receiptLimit(c, next) : jsonLimit(c, next)));

  app.onError(async (error, c) => {
    const traceId = c.get('traceId');
    const { status, body, expected } = toApiError(error, traceId);
    if (error instanceof RateLimited) c.header('retry-after', String(error.retryAfterSeconds));
    const action = securityAction(body.error.code, c.get('operationId') ?? null, c.get('principal') !== undefined);
    // Only the first refusal of a rate-limit window is traced: the next ones would flood the audit.
    if (action && !(error instanceof RateLimited && !error.firstRefusal)) {
      await recordRefusal(c, action, body.error.message, {
        method: c.req.method,
        route: c.req.routePath,
        code: body.error.code,
      });
    }
    const log = expected ? deps.logger.warn : deps.logger.error;
    log('request failed', {
      trace_id: traceId,
      method: c.req.method,
      route: c.req.routePath,
      status,
      code: body.error.code,
      ...(expected ? {} : { error }),
    });
    return c.json(body, status as ContentfulStatusCode);
  });

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: 'Route inconnue.', trace_id: c.get('traceId') } }, 404),
  );

  async function requestContext(c: Context<Env>, endpoint: EndpointContract): Promise<RequestContext> {
    const authorization = c.req.header('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(authorization);
    c.set('operationId', endpoint.operationId);
    let principal: Principal;
    try {
      if (!match?.[1]) throw new Unauthenticated();
      principal = await deps.tokens.verify(match[1]);
    } catch (error) {
      // Guessing tokens is counted per client address (known behind a trusted proxy).
      await throttle(c, rules.unauthenticated, 'address', addressOf(c));
      throw error;
    }
    c.set('principal', principal);
    await throttle(c, rules.api, 'person', principal.subject);
    for (const [rule, dimension] of OPERATION_LIMITS[endpoint.operationId] ?? []) {
      await throttle(c, rules[rule], dimension, dimension === 'person' ? principal.subject : addressOf(c));
    }

    let tenantId: string | null = null;
    if (endpoint.tenantScoped) {
      const header = c.req.header(TENANT_HEADER);
      if (!header) throw new TenantRequired();
      const parsed = tenantIdSchema.safeParse(header);
      if (!parsed.success) {
        throw new InvalidInput('SIS actif invalide.', [{ path: TENANT_HEADER, message: 'UUID attendu.' }]);
      }
      tenantId = parsed.data;
    }

    const client = originSchema.safeParse(c.req.header(CLIENT_HEADER));
    const origin: RequestOrigin = client.success ? client.data : 'api';
    return { principal, tenantId, traceId: c.get('traceId'), origin };
  }

  function respond(c: Context<Env>, endpoint: EndpointContract, body: unknown) {
    // Output validation: an answer that breaks its contract is a server bug, never sent as is.
    const parsed: unknown = endpoint.response.parse(body);
    if (endpoint.concurrency && typeof parsed === 'object' && parsed !== null && 'row_version' in parsed) {
      c.header('etag', `"${String(parsed.row_version)}"`);
    }
    return c.json(parsed as object, endpoint.successStatus);
  }

  async function readBody<S extends z.ZodType>(c: Context<Env>, schema: S): Promise<z.infer<S>> {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new InvalidInput('Corps de requête JSON invalide.');
    }
    return schema.parse(raw);
  }

  /**
   * A request of an enrolled terminal: the raw body is read once, so that the
   * signature covers the exact bytes received; the proof is checked by the use case.
   */
  async function deviceRequest<S extends z.ZodType>(
    c: Context<Env>,
    endpoint: EndpointContract,
    schema?: S,
  ): Promise<{ context: RequestContext; proof: DeviceProof; body: z.infer<S> | undefined }> {
    const context = await requestContext(c, endpoint);
    const deviceId = deviceIdSchema.safeParse(c.req.header(DEVICE_ID_HEADER));
    const time = deviceTimeSchema.safeParse(c.req.header(DEVICE_TIME_HEADER));
    const signature = c.req.header(DEVICE_SIGNATURE_HEADER);
    if (!deviceId.success || !time.success || !signature) throw new DeviceProofInvalid();
    const raw = schema ? await c.req.text() : '';
    let body: z.infer<S> | undefined;
    if (schema) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new InvalidInput('Corps de requête JSON invalide.');
      }
      body = schema.parse(parsed);
    }
    const url = new URL(c.req.url);
    const appVersion = appVersionSchema.safeParse(c.req.header(APP_VERSION_HEADER));
    return {
      context,
      body,
      proof: {
        deviceId: deviceId.data,
        timestamp: Number(time.data),
        signature,
        method: c.req.method,
        path: `${url.pathname}${url.search}`,
        bodySha256: schema ? await deps.sha256(raw) : EMPTY_BODY_SHA256,
        appVersion: appVersion.success ? appVersion.data : null,
      },
    };
  }

  const idOf = (c: Context<Env>) => endpoints.getSite.params.parse(c.req.param()).id;
  const expectedVersion = (c: Context<Env>) => parseIfMatch(c.req.header('if-match'));

  app.get(routerPath(endpoints.getHealth.path), async (c) => {
    const database = await deps.health.database();
    return respond(c, endpoints.getHealth, {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: deps.version,
      checks: { database },
    });
  });

  app.get('/openapi.json', (c) => c.json(deps.openApiDocument() as object));

  app.get(routerPath(endpoints.getMe.path), async (c) => {
    const context = await requestContext(c, endpoints.getMe);
    return respond(c, endpoints.getMe, await getMe(deps.sessions, context));
  });

  app.get(routerPath(endpoints.listMySessions.path), async (c) => {
    const context = await requestContext(c, endpoints.listMySessions);
    return respond(c, endpoints.listMySessions, await listMySessions(deps.sessions, context));
  });

  app.get(routerPath(endpoints.getMyRecoveryCodes.path), async (c) => {
    const context = await requestContext(c, endpoints.getMyRecoveryCodes);
    return respond(c, endpoints.getMyRecoveryCodes, await getMyRecoveryCodes(deps.sessions, context));
  });

  app.post(routerPath(endpoints.regenerateMyRecoveryCodes.path), async (c) => {
    const context = await requestContext(c, endpoints.regenerateMyRecoveryCodes);
    return respond(c, endpoints.regenerateMyRecoveryCodes, await regenerateMyRecoveryCodes(deps.sessions, context));
  });

  app.post(routerPath(endpoints.recoverSecondFactor.path), async (c) => {
    const context = await requestContext(c, endpoints.recoverSecondFactor);
    const input = await readBody(c, endpoints.recoverSecondFactor.body);
    return respond(c, endpoints.recoverSecondFactor, await recoverSecondFactor(deps.sessions, context, input));
  });

  app.post(routerPath(endpoints.revokeMyOtherSessions.path), async (c) => {
    const context = await requestContext(c, endpoints.revokeMyOtherSessions);
    return respond(c, endpoints.revokeMyOtherSessions, await revokeMyOtherSessions(deps.sessions, context));
  });

  app.post(routerPath(endpoints.revokeMySession.path), async (c) => {
    const context = await requestContext(c, endpoints.revokeMySession);
    return respond(c, endpoints.revokeMySession, await revokeMySession(deps.sessions, context, idOf(c)));
  });

  app.get(routerPath(endpoints.getMapCatalog.path), async (c) => {
    await requestContext(c, endpoints.getMapCatalog);
    return respond(c, endpoints.getMapCatalog, getMapCatalog(deps.cartography));
  });

  app.get(routerPath(endpoints.listMapSites.path), async (c) => {
    const context = await requestContext(c, endpoints.listMapSites);
    const query = endpoints.listMapSites.query.parse(c.req.query());
    return respond(c, endpoints.listMapSites, await listMapSites(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.listMapFeatures.path), async (c) => {
    const context = await requestContext(c, endpoints.listMapFeatures);
    const query = endpoints.listMapFeatures.query.parse(c.req.query());
    return respond(c, endpoints.listMapFeatures, await listMapFeatures(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.searchAddresses.path), async (c) => {
    const context = await requestContext(c, endpoints.searchAddresses);
    const query = endpoints.searchAddresses.query.parse(c.req.query());
    const geocoding = { sessions: deps.sessions, geocoder: deps.geocoder };
    return respond(c, endpoints.searchAddresses, await searchAddresses(geocoding, context, query));
  });

  app.get(routerPath(endpoints.reverseGeocode.path), async (c) => {
    const context = await requestContext(c, endpoints.reverseGeocode);
    const query = endpoints.reverseGeocode.query.parse(c.req.query());
    const geocoding = { sessions: deps.sessions, geocoder: deps.geocoder };
    return respond(c, endpoints.reverseGeocode, await reverseGeocode(geocoding, context, query));
  });

  app.get(routerPath(endpoints.listSites.path), async (c) => {
    const context = await requestContext(c, endpoints.listSites);
    const query = endpoints.listSites.query.parse(c.req.query());
    return respond(c, endpoints.listSites, await listSites(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.getSite.path), async (c) => {
    const context = await requestContext(c, endpoints.getSite);
    const { id } = endpoints.getSite.params.parse(c.req.param());
    return respond(c, endpoints.getSite, await getSite(deps.sessions, context, id));
  });

  // ---------------------------------------------------------------- sites (write)
  app.post(routerPath(endpoints.createSite.path), async (c) => {
    const context = await requestContext(c, endpoints.createSite);
    const input = await readBody(c, endpoints.createSite.body);
    const site = await createSite(deps.sessions, context, input);
    c.header('location', `${API_BASE_PATH}/sites/${site.id}`);
    return respond(c, endpoints.createSite, site);
  });

  app.patch(routerPath(endpoints.updateSite.path), async (c) => {
    const context = await requestContext(c, endpoints.updateSite);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateSite.body);
    return respond(c, endpoints.updateSite, await updateSite(deps.sessions, context, idOf(c), version, patch));
  });

  app.post(routerPath(endpoints.archiveSite.path), async (c) => {
    const context = await requestContext(c, endpoints.archiveSite);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.archiveSite.body);
    return respond(c, endpoints.archiveSite, await archiveSite(deps.sessions, context, idOf(c), version, input));
  });

  app.post(routerPath(endpoints.restoreSite.path), async (c) => {
    const context = await requestContext(c, endpoints.restoreSite);
    const version = expectedVersion(c);
    return respond(c, endpoints.restoreSite, await restoreSite(deps.sessions, context, idOf(c), version));
  });

  app.post(routerPath(endpoints.withdrawPublication.path), async (c) => {
    const context = await requestContext(c, endpoints.withdrawPublication);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.withdrawPublication.body);
    return respond(
      c,
      endpoints.withdrawPublication,
      await withdrawPublication(deps.sessions, context, idOf(c), version, input),
    );
  });

  // ---------------------------------------------------------------- buildings and levels
  app.get(routerPath(endpoints.listBuildings.path), async (c) => {
    const context = await requestContext(c, endpoints.listBuildings);
    const items = await listBuildings(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listBuildings, { items });
  });

  app.post(routerPath(endpoints.createBuilding.path), async (c) => {
    const context = await requestContext(c, endpoints.createBuilding);
    const input = await readBody(c, endpoints.createBuilding.body);
    return respond(c, endpoints.createBuilding, await createBuilding(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateBuilding.path), async (c) => {
    const context = await requestContext(c, endpoints.updateBuilding);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateBuilding.body);
    return respond(c, endpoints.updateBuilding, await updateBuilding(deps.sessions, context, idOf(c), version, patch));
  });

  app.post(routerPath(endpoints.createLevel.path), async (c) => {
    const context = await requestContext(c, endpoints.createLevel);
    const input = await readBody(c, endpoints.createLevel.body);
    return respond(c, endpoints.createLevel, await createLevel(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateLevel.path), async (c) => {
    const context = await requestContext(c, endpoints.updateLevel);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateLevel.body);
    return respond(c, endpoints.updateLevel, await updateLevel(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- classifications
  app.get(routerPath(endpoints.listClassifications.path), async (c) => {
    const context = await requestContext(c, endpoints.listClassifications);
    const items = await listClassifications(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listClassifications, { items });
  });

  app.post(routerPath(endpoints.createClassification.path), async (c) => {
    const context = await requestContext(c, endpoints.createClassification);
    const input = await readBody(c, endpoints.createClassification.body);
    return respond(
      c,
      endpoints.createClassification,
      await createClassification(deps.sessions, context, idOf(c), input),
    );
  });

  app.patch(routerPath(endpoints.updateClassification.path), async (c) => {
    const context = await requestContext(c, endpoints.updateClassification);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateClassification.body);
    return respond(
      c,
      endpoints.updateClassification,
      await updateClassification(deps.sessions, context, idOf(c), version, patch),
    );
  });

  // ---------------------------------------------------------------- contacts
  app.get(routerPath(endpoints.listContacts.path), async (c) => {
    const context = await requestContext(c, endpoints.listContacts);
    const items = await listContacts(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listContacts, { items });
  });

  app.post(routerPath(endpoints.createContact.path), async (c) => {
    const context = await requestContext(c, endpoints.createContact);
    const input = await readBody(c, endpoints.createContact.body);
    return respond(c, endpoints.createContact, await createContact(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateContact.path), async (c) => {
    const context = await requestContext(c, endpoints.updateContact);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateContact.body);
    return respond(c, endpoints.updateContact, await updateContact(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- external identifiers
  app.get(routerPath(endpoints.listExternalIds.path), async (c) => {
    const context = await requestContext(c, endpoints.listExternalIds);
    const items = await listExternalIds(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listExternalIds, { items });
  });

  app.post(routerPath(endpoints.createExternalId.path), async (c) => {
    const context = await requestContext(c, endpoints.createExternalId);
    const input = await readBody(c, endpoints.createExternalId.body);
    return respond(c, endpoints.createExternalId, await createExternalId(deps.sessions, context, idOf(c), input));
  });

  // ---------------------------------------------------------------- operational objects
  app.get(routerPath(endpoints.listObjectTypes.path), async (c) => {
    const context = await requestContext(c, endpoints.listObjectTypes);
    return respond(c, endpoints.listObjectTypes, { items: await listObjectTypes(deps.sessions, context) });
  });

  app.get(routerPath(endpoints.listSiteObjects.path), async (c) => {
    const context = await requestContext(c, endpoints.listSiteObjects);
    const items = await listSiteObjects(deps.sessions, context, idOf(c));
    return respond(c, endpoints.listSiteObjects, { items });
  });

  app.post(routerPath(endpoints.createSiteObject.path), async (c) => {
    const context = await requestContext(c, endpoints.createSiteObject);
    const input = await readBody(c, endpoints.createSiteObject.body);
    return respond(c, endpoints.createSiteObject, await createSiteObject(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateObject.path), async (c) => {
    const context = await requestContext(c, endpoints.updateObject);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateObject.body);
    return respond(c, endpoints.updateObject, await updateSiteObject(deps.sessions, context, idOf(c), version, patch));
  });

  // Photos follow the controlled upload chain of documents (PLAN-05).
  app.post(routerPath(endpoints.createObjectPhoto.path), async (c) => {
    const context = await requestContext(c, endpoints.createObjectPhoto);
    const input = await readBody(c, endpoints.createObjectPhoto.body);
    const files = { sessions: deps.sessions, storage: deps.storage };
    return respond(c, endpoints.createObjectPhoto, await createObjectPhoto(files, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateObjectPhoto.path), async (c) => {
    const context = await requestContext(c, endpoints.updateObjectPhoto);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateObjectPhoto.body);
    return respond(
      c,
      endpoints.updateObjectPhoto,
      await updateObjectPhoto(deps.sessions, context, idOf(c), version, patch),
    );
  });

  // ---------------------------------------------------------------- plans
  const plans = { sessions: deps.sessions, storage: deps.storage };

  app.get(routerPath(endpoints.listSitePlans.path), async (c) => {
    const context = await requestContext(c, endpoints.listSitePlans);
    return respond(c, endpoints.listSitePlans, { items: await listPlans(plans, context, idOf(c)) });
  });

  app.post(routerPath(endpoints.createPlan.path), async (c) => {
    const context = await requestContext(c, endpoints.createPlan);
    const input = await readBody(c, endpoints.createPlan.body);
    return respond(c, endpoints.createPlan, await createPlan(plans, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updatePlan.path), async (c) => {
    const context = await requestContext(c, endpoints.updatePlan);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updatePlan.body);
    return respond(c, endpoints.updatePlan, await updatePlan(plans, context, idOf(c), version, patch));
  });

  app.post(routerPath(endpoints.createPlanRevision.path), async (c) => {
    const context = await requestContext(c, endpoints.createPlanRevision);
    const input = await readBody(c, endpoints.createPlanRevision.body);
    return respond(c, endpoints.createPlanRevision, await addPlanRevision(plans, context, idOf(c), input));
  });

  app.get(routerPath(endpoints.listSiteZones.path), async (c) => {
    const context = await requestContext(c, endpoints.listSiteZones);
    return respond(c, endpoints.listSiteZones, { items: await listSiteZones(deps.sessions, context, idOf(c)) });
  });

  app.post(routerPath(endpoints.createZone.path), async (c) => {
    const context = await requestContext(c, endpoints.createZone);
    const input = await readBody(c, endpoints.createZone.body);
    return respond(c, endpoints.createZone, await createZone(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateZone.path), async (c) => {
    const context = await requestContext(c, endpoints.updateZone);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateZone.body);
    return respond(c, endpoints.updateZone, await updateZone(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- risks
  app.get(routerPath(endpoints.listRiskTypes.path), async (c) => {
    const context = await requestContext(c, endpoints.listRiskTypes);
    const query = endpoints.listRiskTypes.query.parse(c.req.query());
    const items = await listRiskTypes(deps.sessions, context, {
      includeDeprecated: query.include_deprecated === 'true',
    });
    return respond(c, endpoints.listRiskTypes, { items });
  });

  app.post(routerPath(endpoints.createRiskType.path), async (c) => {
    const context = await requestContext(c, endpoints.createRiskType);
    const input = await readBody(c, endpoints.createRiskType.body);
    return respond(c, endpoints.createRiskType, await createRiskType(deps.sessions, context, input));
  });

  app.patch(routerPath(endpoints.updateRiskType.path), async (c) => {
    const context = await requestContext(c, endpoints.updateRiskType);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateRiskType.body);
    return respond(c, endpoints.updateRiskType, await updateRiskType(deps.sessions, context, idOf(c), version, patch));
  });

  app.get(routerPath(endpoints.listSiteRisks.path), async (c) => {
    const context = await requestContext(c, endpoints.listSiteRisks);
    return respond(c, endpoints.listSiteRisks, { items: await listSiteRisks(deps.sessions, context, idOf(c)) });
  });

  app.post(routerPath(endpoints.createSiteRisk.path), async (c) => {
    const context = await requestContext(c, endpoints.createSiteRisk);
    const input = await readBody(c, endpoints.createSiteRisk.body);
    return respond(c, endpoints.createSiteRisk, await createSiteRisk(deps.sessions, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateRisk.path), async (c) => {
    const context = await requestContext(c, endpoints.updateRisk);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateRisk.body);
    return respond(c, endpoints.updateRisk, await updateSiteRisk(deps.sessions, context, idOf(c), version, patch));
  });

  // ---------------------------------------------------------------- ETARE workflow
  app.get(routerPath(endpoints.listEtareDossiers.path), async (c) => {
    const context = await requestContext(c, endpoints.listEtareDossiers);
    const query = endpoints.listEtareDossiers.query.parse(c.req.query());
    return respond(c, endpoints.listEtareDossiers, await listEtareDossiers(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.getSiteEtare.path), async (c) => {
    const context = await requestContext(c, endpoints.getSiteEtare);
    return respond(c, endpoints.getSiteEtare, await getSiteEtare(deps.sessions, context, idOf(c)));
  });

  app.get(routerPath(endpoints.previewSiteEtare.path), async (c) => {
    const context = await requestContext(c, endpoints.previewSiteEtare);
    return respond(c, endpoints.previewSiteEtare, await previewSiteEtare(deps, context, idOf(c)));
  });

  app.post(routerPath(endpoints.createRevision.path), async (c) => {
    const context = await requestContext(c, endpoints.createRevision);
    const input = await readBody(c, endpoints.createRevision.body);
    return respond(c, endpoints.createRevision, await createRevision(deps.sessions, context, idOf(c), input));
  });

  app.post(routerPath(endpoints.submitRevision.path), async (c) => {
    const context = await requestContext(c, endpoints.submitRevision);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.submitRevision.body);
    return respond(c, endpoints.submitRevision, await submitRevision(deps, context, idOf(c), version, input));
  });

  app.get(routerPath(endpoints.listValidations.path), async (c) => {
    const context = await requestContext(c, endpoints.listValidations);
    return respond(c, endpoints.listValidations, { items: await listValidations(deps.sessions, context) });
  });

  app.get(routerPath(endpoints.getRevision.path), async (c) => {
    const context = await requestContext(c, endpoints.getRevision);
    return respond(c, endpoints.getRevision, await getRevision(deps.sessions, context, idOf(c)));
  });

  app.post(routerPath(endpoints.decideRevision.path), async (c) => {
    const context = await requestContext(c, endpoints.decideRevision);
    const input = await readBody(c, endpoints.decideRevision.body);
    return respond(c, endpoints.decideRevision, await decideRevision(deps.sessions, context, idOf(c), input));
  });

  app.get(routerPath(endpoints.getPublicationPdf.path), async (c) => {
    const context = await requestContext(c, endpoints.getPublicationPdf);
    const pdf = await getPublicationPdf({ sessions: deps.sessions, storage: deps.storage }, context, idOf(c));
    return respond(c, endpoints.getPublicationPdf, pdf);
  });

  app.post(routerPath(endpoints.publishRevision.path), async (c) => {
    const context = await requestContext(c, endpoints.publishRevision);
    return respond(c, endpoints.publishRevision, await publishRevision(deps.sessions, context, idOf(c)));
  });

  // ---------------------------------------------------------------- documents and files
  const documents = { sessions: deps.sessions, storage: deps.storage };

  app.get(routerPath(endpoints.listDocuments.path), async (c) => {
    const context = await requestContext(c, endpoints.listDocuments);
    const items = await listDocuments(documents, context, idOf(c));
    return respond(c, endpoints.listDocuments, { items });
  });

  app.post(routerPath(endpoints.createDocument.path), async (c) => {
    const context = await requestContext(c, endpoints.createDocument);
    const input = await readBody(c, endpoints.createDocument.body);
    return respond(c, endpoints.createDocument, await createDocument(documents, context, idOf(c), input));
  });

  app.patch(routerPath(endpoints.updateDocument.path), async (c) => {
    const context = await requestContext(c, endpoints.updateDocument);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateDocument.body);
    return respond(c, endpoints.updateDocument, await updateDocument(documents, context, idOf(c), version, patch));
  });

  app.post(routerPath(endpoints.createDocumentVersion.path), async (c) => {
    const context = await requestContext(c, endpoints.createDocumentVersion);
    const input = await readBody(c, endpoints.createDocumentVersion.body);
    return respond(c, endpoints.createDocumentVersion, await addDocumentVersion(documents, context, idOf(c), input));
  });

  app.post(routerPath(endpoints.confirmUpload.path), async (c) => {
    const context = await requestContext(c, endpoints.confirmUpload);
    return respond(c, endpoints.confirmUpload, await confirmUpload(documents, context, idOf(c)));
  });

  app.get(routerPath(endpoints.getAssetDownload.path), async (c) => {
    const context = await requestContext(c, endpoints.getAssetDownload);
    const query = endpoints.getAssetDownload.query.parse(c.req.query());
    return respond(c, endpoints.getAssetDownload, await getAssetDownload(documents, context, idOf(c), query.variant));
  });

  // ---------------------------------------------------------------- members of the SIS
  app.get(routerPath(endpoints.listMembers.path), async (c) => {
    const context = await requestContext(c, endpoints.listMembers);
    return respond(c, endpoints.listMembers, { items: await listMembers(deps.sessions, context) });
  });

  app.post(routerPath(endpoints.inviteMember.path), async (c) => {
    const context = await requestContext(c, endpoints.inviteMember);
    const input = await readBody(c, endpoints.inviteMember.body);
    const members = { sessions: deps.sessions, identities: deps.identities };
    return respond(c, endpoints.inviteMember, await inviteMember(members, context, input));
  });

  app.patch(routerPath(endpoints.updateMember.path), async (c) => {
    const context = await requestContext(c, endpoints.updateMember);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateMember.body);
    return respond(c, endpoints.updateMember, await updateMember(deps.sessions, context, idOf(c), version, patch));
  });

  app.put(routerPath(endpoints.setMemberPerimeter.path), async (c) => {
    const context = await requestContext(c, endpoints.setMemberPerimeter);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.setMemberPerimeter.body);
    return respond(
      c,
      endpoints.setMemberPerimeter,
      await setMemberPerimeter(deps.sessions, context, idOf(c), version, input),
    );
  });

  app.put(routerPath(endpoints.setMemberSensitiveAccess.path), async (c) => {
    const context = await requestContext(c, endpoints.setMemberSensitiveAccess);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.setMemberSensitiveAccess.body);
    return respond(
      c,
      endpoints.setMemberSensitiveAccess,
      await setMemberSensitiveAccess(deps.sessions, context, idOf(c), version, input),
    );
  });

  // ---------------------------------------------------------------- journal of the sensitive sites (PER-02)
  app.get(routerPath(endpoints.listAccessEvents.path), async (c) => {
    const context = await requestContext(c, endpoints.listAccessEvents);
    const query = endpoints.listAccessEvents.query.parse(c.req.query());
    return respond(c, endpoints.listAccessEvents, await listAccessEvents(deps.sessions, context, query));
  });

  // ---------------------------------------------------------------- sectors (PER-01, ADR-025)
  app.get(routerPath(endpoints.listSectors.path), async (c) => {
    const context = await requestContext(c, endpoints.listSectors);
    return respond(c, endpoints.listSectors, await listSectors(deps.sessions, context));
  });

  app.get(routerPath(endpoints.listSectorCommunes.path), async (c) => {
    const context = await requestContext(c, endpoints.listSectorCommunes);
    return respond(c, endpoints.listSectorCommunes, await listSectorCommunes(deps.sessions, context));
  });

  app.post(routerPath(endpoints.createSector.path), async (c) => {
    const context = await requestContext(c, endpoints.createSector);
    const input = await readBody(c, endpoints.createSector.body);
    return respond(c, endpoints.createSector, await createSector(deps.sessions, context, input));
  });

  app.put(routerPath(endpoints.updateSector.path), async (c) => {
    const context = await requestContext(c, endpoints.updateSector);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.updateSector.body);
    return respond(c, endpoints.updateSector, await updateSector(deps.sessions, context, idOf(c), version, input));
  });

  app.post(routerPath(endpoints.archiveSector.path), async (c) => {
    const context = await requestContext(c, endpoints.archiveSector);
    const version = expectedVersion(c);
    return respond(c, endpoints.archiveSector, await archiveSector(deps.sessions, context, idOf(c), version));
  });

  // ---------------------------------------------------------------- base maps of the tablets (ADR-024)
  app.get(routerPath(endpoints.getBasemapOverview.path), async (c) => {
    const context = await requestContext(c, endpoints.getBasemapOverview);
    const basemaps = { sessions: deps.sessions, source: deps.basemapSource ?? null };
    return respond(c, endpoints.getBasemapOverview, await getBasemapOverview(basemaps, context));
  });

  app.post(routerPath(endpoints.requestBasemapBuild.path), async (c) => {
    const context = await requestContext(c, endpoints.requestBasemapBuild);
    const basemaps = { sessions: deps.sessions, source: deps.basemapSource ?? null };
    return respond(c, endpoints.requestBasemapBuild, await requestBasemapBuild(basemaps, context, idOf(c)));
  });

  // ---------------------------------------------------------------- exploitant access (POR-01, ADR-019)
  app.get(routerPath(endpoints.listPortalInvitations.path), async (c) => {
    const context = await requestContext(c, endpoints.listPortalInvitations);
    return respond(c, endpoints.listPortalInvitations, await listPortalInvitations(deps.sessions, context));
  });

  app.post(routerPath(endpoints.createPortalInvitation.path), async (c) => {
    const context = await requestContext(c, endpoints.createPortalInvitation);
    const input = await readBody(c, endpoints.createPortalInvitation.body);
    const portal = { sessions: deps.sessions, identities: deps.identities, now: deps.now };
    return respond(c, endpoints.createPortalInvitation, await createPortalInvitation(portal, context, input));
  });

  app.post(routerPath(endpoints.revokePortalInvitation.path), async (c) => {
    const context = await requestContext(c, endpoints.revokePortalInvitation);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.revokePortalInvitation.body);
    return respond(
      c,
      endpoints.revokePortalInvitation,
      await revokePortalInvitation(deps.sessions, context, idOf(c), version, input),
    );
  });

  app.get(routerPath(endpoints.listMyPortalInvitations.path), async (c) => {
    const context = await requestContext(c, endpoints.listMyPortalInvitations);
    return respond(c, endpoints.listMyPortalInvitations, await listMyPortalInvitations(deps.sessions, context));
  });

  app.post(routerPath(endpoints.acceptPortalInvitation.path), async (c) => {
    const context = await requestContext(c, endpoints.acceptPortalInvitation);
    return respond(c, endpoints.acceptPortalInvitation, await acceptPortalInvitation(deps.sessions, context, idOf(c)));
  });

  app.post(routerPath(endpoints.resetMemberSecondFactor.path), async (c) => {
    const context = await requestContext(c, endpoints.resetMemberSecondFactor);
    return respond(
      c,
      endpoints.resetMemberSecondFactor,
      await resetMemberSecondFactor(deps.sessions, context, idOf(c), expectedVersion(c)),
    );
  });

  app.get(routerPath(endpoints.getSecuritySettings.path), async (c) => {
    const context = await requestContext(c, endpoints.getSecuritySettings);
    return respond(c, endpoints.getSecuritySettings, await getSecuritySettings(deps.sessions, context));
  });

  app.put(routerPath(endpoints.updateSecuritySettings.path), async (c) => {
    const context = await requestContext(c, endpoints.updateSecuritySettings);
    const input = await readBody(c, endpoints.updateSecuritySettings.body);
    return respond(c, endpoints.updateSecuritySettings, await updateSecuritySettings(deps.sessions, context, input));
  });

  app.get(routerPath(endpoints.getPortalSettings.path), async (c) => {
    const context = await requestContext(c, endpoints.getPortalSettings);
    return respond(c, endpoints.getPortalSettings, await getPortalSettings(deps.sessions, context));
  });

  app.put(routerPath(endpoints.updatePortalSettings.path), async (c) => {
    const context = await requestContext(c, endpoints.updatePortalSettings);
    const input = await readBody(c, endpoints.updatePortalSettings.body);
    return respond(c, endpoints.updatePortalSettings, await updatePortalSettings(deps.sessions, context, input));
  });

  app.get(routerPath(endpoints.getEtareLayoutSettings.path), async (c) => {
    const context = await requestContext(c, endpoints.getEtareLayoutSettings);
    return respond(c, endpoints.getEtareLayoutSettings, await getEtareLayoutSettings(deps.sessions, context));
  });

  app.put(routerPath(endpoints.updateEtareLayoutSettings.path), async (c) => {
    const context = await requestContext(c, endpoints.updateEtareLayoutSettings);
    const input = await readBody(c, endpoints.updateEtareLayoutSettings.body);
    return respond(
      c,
      endpoints.updateEtareLayoutSettings,
      await updateEtareLayoutSettings(deps.sessions, context, input),
    );
  });

  app.get(routerPath(endpoints.getPortalAccess.path), async (c) => {
    const context = await requestContext(c, endpoints.getPortalAccess);
    return respond(c, endpoints.getPortalAccess, await getPortalAccess(deps.sessions, context));
  });

  app.get(routerPath(endpoints.listPortalSites.path), async (c) => {
    const context = await requestContext(c, endpoints.listPortalSites);
    return respond(c, endpoints.listPortalSites, await listPortalSites(deps.sessions, context));
  });

  app.get(routerPath(endpoints.getPortalSite.path), async (c) => {
    const context = await requestContext(c, endpoints.getPortalSite);
    const { id } = endpoints.getPortalSite.params.parse(c.req.param());
    return respond(c, endpoints.getPortalSite, await getPortalSite(deps.sessions, context, id));
  });

  app.get(routerPath(endpoints.getPortalDocumentDownload.path), async (c) => {
    const context = await requestContext(c, endpoints.getPortalDocumentDownload);
    const { id, document_id } = endpoints.getPortalDocumentDownload.params.parse(c.req.param());
    const files = { sessions: deps.sessions, storage: deps.storage };
    return respond(
      c,
      endpoints.getPortalDocumentDownload,
      await getPortalDocumentDownload(files, context, id, document_id),
    );
  });

  // ---------------------------------------------------------------- terminals (administration)
  app.get(routerPath(endpoints.listDevices.path), async (c) => {
    const context = await requestContext(c, endpoints.listDevices);
    // The key set served (SEC-04): the administration sees the terminals behind the last rotation.
    const keyset = await (deps.keyset?.() ?? Promise.resolve(null)).catch(() => null);
    return respond(
      c,
      endpoints.listDevices,
      await listDevices(deps.sessions, context, deps.minAppVersion ?? null, keyset?.keyset.sequence ?? null),
    );
  });

  app.post(routerPath(endpoints.createDevice.path), async (c) => {
    const context = await requestContext(c, endpoints.createDevice);
    const input = await readBody(c, endpoints.createDevice.body);
    return respond(c, endpoints.createDevice, await createDevice(deps, context, input));
  });

  app.put(routerPath(endpoints.setDevicePerimeter.path), async (c) => {
    const context = await requestContext(c, endpoints.setDevicePerimeter);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.setDevicePerimeter.body);
    return respond(
      c,
      endpoints.setDevicePerimeter,
      await setDevicePerimeter(deps.sessions, context, idOf(c), version, input),
    );
  });

  app.post(routerPath(endpoints.renewDeviceEnrollment.path), async (c) => {
    const context = await requestContext(c, endpoints.renewDeviceEnrollment);
    const version = expectedVersion(c);
    return respond(c, endpoints.renewDeviceEnrollment, await renewDeviceEnrollment(deps, context, idOf(c), version));
  });

  app.post(routerPath(endpoints.revokeDevice.path), async (c) => {
    const context = await requestContext(c, endpoints.revokeDevice);
    const version = expectedVersion(c);
    const input = await readBody(c, endpoints.revokeDevice.body);
    return respond(c, endpoints.revokeDevice, await revokeDevice(deps.sessions, context, idOf(c), version, input));
  });

  // ---------------------------------------------------------------- offline distribution (terminals)
  app.post(routerPath(endpoints.enrollDevice.path), async (c) => {
    const context = await requestContext(c, endpoints.enrollDevice);
    const input = await readBody(c, endpoints.enrollDevice.body);
    return respond(c, endpoints.enrollDevice, await enrollDevice(deps, context, input));
  });

  app.get(routerPath(endpoints.getSyncKeyset.path), async (c) => {
    const { context, proof } = await deviceRequest(c, endpoints.getSyncKeyset);
    return respond(c, endpoints.getSyncKeyset, await getSyncKeyset(deps, context, proof));
  });

  app.get(routerPath(endpoints.getSyncCatalog.path), async (c) => {
    const { context, proof } = await deviceRequest(c, endpoints.getSyncCatalog);
    return respond(c, endpoints.getSyncCatalog, await getSyncCatalog(deps, context, proof));
  });

  app.get(routerPath(endpoints.getSyncPackage.path), async (c) => {
    const { context, proof } = await deviceRequest(c, endpoints.getSyncPackage);
    return respond(c, endpoints.getSyncPackage, await getSyncPackage(deps, context, proof, idOf(c)));
  });

  app.post(routerPath(endpoints.createSyncDownloads.path), async (c) => {
    const { context, proof, body } = await deviceRequest(
      c,
      endpoints.createSyncDownloads,
      endpoints.createSyncDownloads.body,
    );
    if (!body) throw new InvalidInput();
    return respond(c, endpoints.createSyncDownloads, await createSyncDownloads(deps, context, proof, idOf(c), body));
  });

  app.post(routerPath(endpoints.recordSyncReceipt.path), async (c) => {
    const { context, proof, body } = await deviceRequest(
      c,
      endpoints.recordSyncReceipt,
      endpoints.recordSyncReceipt.body,
    );
    if (!body) throw new InvalidInput();
    return respond(c, endpoints.recordSyncReceipt, await recordSyncReceipt(deps, context, proof, body));
  });

  app.get(routerPath(endpoints.getSyncBasemap.path), async (c) => {
    const { context, proof } = await deviceRequest(c, endpoints.getSyncBasemap);
    return respond(c, endpoints.getSyncBasemap, await getSyncBasemap(deps, context, proof, idOf(c)));
  });

  app.post(routerPath(endpoints.createSyncBasemapDownloads.path), async (c) => {
    const { context, proof, body } = await deviceRequest(
      c,
      endpoints.createSyncBasemapDownloads,
      endpoints.createSyncBasemapDownloads.body,
    );
    if (!body) throw new InvalidInput();
    return respond(
      c,
      endpoints.createSyncBasemapDownloads,
      await createSyncBasemapDownloads(deps, context, proof, idOf(c), body),
    );
  });

  app.post(routerPath(endpoints.recordSyncBasemapReceipt.path), async (c) => {
    const { context, proof, body } = await deviceRequest(
      c,
      endpoints.recordSyncBasemapReceipt,
      endpoints.recordSyncBasemapReceipt.body,
    );
    if (!body) throw new InvalidInput();
    return respond(c, endpoints.recordSyncBasemapReceipt, await recordSyncBasemapReceipt(deps, context, proof, body));
  });

  app.post(routerPath(endpoints.submitAccessEvents.path), async (c) => {
    const { context, proof, body } = await deviceRequest(
      c,
      endpoints.submitAccessEvents,
      endpoints.submitAccessEvents.body,
    );
    if (!body) throw new InvalidInput();
    return respond(c, endpoints.submitAccessEvents, await submitAccessEvents(deps, context, proof, body));
  });

  // ---------------------------------------------------------------- field reports (OPS-04, ADR-017)
  app.post(routerPath(endpoints.submitFieldReport.path), async (c) => {
    const { context, proof, body } = await deviceRequest(
      c,
      endpoints.submitFieldReport,
      endpoints.submitFieldReport.body,
    );
    if (!body) throw new InvalidInput();
    return respond(c, endpoints.submitFieldReport, await submitFieldReport(deps, context, proof, body));
  });

  app.post(routerPath(endpoints.confirmFieldReportUploads.path), async (c) => {
    const { context, proof } = await deviceRequest(c, endpoints.confirmFieldReportUploads);
    return respond(
      c,
      endpoints.confirmFieldReportUploads,
      await confirmFieldReportUploads(deps, context, proof, idOf(c)),
    );
  });

  app.get(routerPath(endpoints.listSyncReports.path), async (c) => {
    const { context, proof } = await deviceRequest(c, endpoints.listSyncReports);
    return respond(c, endpoints.listSyncReports, await listSyncReports(deps, context, proof));
  });

  app.get(routerPath(endpoints.listFieldReports.path), async (c) => {
    const context = await requestContext(c, endpoints.listFieldReports);
    const query = endpoints.listFieldReports.query.parse(c.req.query());
    return respond(c, endpoints.listFieldReports, await listFieldReports(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.getFieldReport.path), async (c) => {
    const context = await requestContext(c, endpoints.getFieldReport);
    return respond(c, endpoints.getFieldReport, await getFieldReport(deps.sessions, context, idOf(c)));
  });

  app.patch(routerPath(endpoints.updateFieldReport.path), async (c) => {
    const context = await requestContext(c, endpoints.updateFieldReport);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateFieldReport.body);
    return respond(
      c,
      endpoints.updateFieldReport,
      await updateFieldReport(deps.sessions, context, idOf(c), version, patch),
    );
  });

  // ---------------------------------------------------------------- proposals of the exploitants (POR-03/04)
  app.post(routerPath(endpoints.createPortalContribution.path), async (c) => {
    const context = await requestContext(c, endpoints.createPortalContribution);
    const input = await readBody(c, endpoints.createPortalContribution.body);
    const files = { sessions: deps.sessions, storage: deps.storage };
    return respond(
      c,
      endpoints.createPortalContribution,
      await createPortalContribution(files, context, idOf(c), input),
    );
  });

  app.post(routerPath(endpoints.confirmPortalContributionUploads.path), async (c) => {
    const context = await requestContext(c, endpoints.confirmPortalContributionUploads);
    return respond(
      c,
      endpoints.confirmPortalContributionUploads,
      await confirmPortalContributionUploads(deps.sessions, context, idOf(c)),
    );
  });

  app.get(routerPath(endpoints.listPortalContributions.path), async (c) => {
    const context = await requestContext(c, endpoints.listPortalContributions);
    const query = endpoints.listPortalContributions.query.parse(c.req.query());
    return respond(c, endpoints.listPortalContributions, await listPortalContributions(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.getPortalContribution.path), async (c) => {
    const context = await requestContext(c, endpoints.getPortalContribution);
    return respond(c, endpoints.getPortalContribution, await getPortalContribution(deps.sessions, context, idOf(c)));
  });

  app.post(routerPath(endpoints.replyPortalContribution.path), async (c) => {
    const context = await requestContext(c, endpoints.replyPortalContribution);
    const input = await readBody(c, endpoints.replyPortalContribution.body);
    return respond(
      c,
      endpoints.replyPortalContribution,
      await replyPortalContribution(deps.sessions, context, idOf(c), input),
    );
  });

  app.post(routerPath(endpoints.withdrawPortalContribution.path), async (c) => {
    const context = await requestContext(c, endpoints.withdrawPortalContribution);
    return respond(
      c,
      endpoints.withdrawPortalContribution,
      await withdrawPortalContribution(deps.sessions, context, idOf(c)),
    );
  });

  app.get(routerPath(endpoints.listContributions.path), async (c) => {
    const context = await requestContext(c, endpoints.listContributions);
    const query = endpoints.listContributions.query.parse(c.req.query());
    return respond(c, endpoints.listContributions, await listContributions(deps.sessions, context, query));
  });

  app.get(routerPath(endpoints.getContribution.path), async (c) => {
    const context = await requestContext(c, endpoints.getContribution);
    return respond(c, endpoints.getContribution, await getContribution(deps.sessions, context, idOf(c)));
  });

  app.patch(routerPath(endpoints.updateContribution.path), async (c) => {
    const context = await requestContext(c, endpoints.updateContribution);
    const version = expectedVersion(c);
    const patch = await readBody(c, endpoints.updateContribution.body);
    return respond(
      c,
      endpoints.updateContribution,
      await updateContribution(deps.sessions, context, idOf(c), version, patch),
    );
  });

  // ---------------------------------------------------------------- notifications (POR-05)
  app.get(routerPath(endpoints.listNotifications.path), async (c) => {
    const context = await requestContext(c, endpoints.listNotifications);
    const query = endpoints.listNotifications.query.parse(c.req.query());
    return respond(c, endpoints.listNotifications, await listNotifications(deps.sessions, context, query));
  });

  app.post(routerPath(endpoints.retryNotification.path), async (c) => {
    const context = await requestContext(c, endpoints.retryNotification);
    return respond(c, endpoints.retryNotification, await retryNotification(deps.sessions, context, idOf(c)));
  });

  return app;
}
