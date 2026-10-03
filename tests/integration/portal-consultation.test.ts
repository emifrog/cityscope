/**
 * Sprint 7 — consultation by the exploitant through the real stack (POR-02,
 * ADR-019): a site published for the test, with a document marked visible and
 * another one kept internal; the exploitant of the demo, invited on it, reads
 * the whitelist of the published version and downloads the visible document
 * only. Nothing else of the dossier reaches the portal.
 */
import { createHash } from 'node:crypto';
import {
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { antivirusNotConfigured } from '@etare/application';
import { API_BASE_PATH, endpoints, type EtareRevision } from '@etare/contracts';
import { HandlerRegistry, assetVerificationHandler, createWorker, publicationBuildHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, authApi, requireEnv, signIn, withSecondFactor, drain } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-portal',
});
const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-portal'),
  registry: new HandlerRegistry([
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects,
      scanner: antivirusNotConfigured,
      sha256,
    }),
    publicationBuildHandler({
      store: new PostgresPublicationBuildStore(workerPool),
      tools: { sha256, byteLength: (text) => Buffer.byteLength(text, 'utf8'), now: () => new Date() },
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 2,
  leaseSeconds: 30,
  pollIntervalMs: 100,
});

type Call = (method: string, path: string, body?: unknown, ifMatch?: number) => Promise<Response>;
const as =
  (token: string, tenant: string | null): Call =>
  async (method, path, body, ifMatch) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(tenant ? { 'x-tenant-id': tenant } : {}),
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

const factors: { token: string; factorId: string }[] = [];
const strong = async (token: string) => {
  const factor = await withSecondFactor(token);
  factors.push(factor);
  return factor.token;
};

const shared = new TextEncoder().encode(`%PDF-1.4\n% notice SSI ${Date.now()}\n%%EOF\n`);
const internal = new TextEncoder().encode(`%PDF-1.4\n% consignes internes ${Date.now()}\n%%EOF\n`);
let editor: Call;
let exploitantAal1: Call;
let exploitant: Call;
let siteId = '';
let sharedId = '';
let internalId = '';
let invitationId = '';

beforeAll(async () => {
  const [editorToken, validatorToken, exploitantToken] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('exploitant.oliviers@demo.etare.test'),
  ]);
  editor = as(await strong(editorToken), TENANT_06);
  const validator = as(await strong(validatorToken), TENANT_06);

  // A site published for the test: two contacts, a water point, two documents (one shared).
  const created = await editor('POST', '/sites', {
    name: `Site portail ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { street: '1 rue du Port', city: 'Nice', postal_code: '06300' },
    location: { type: 'Point', coordinates: [7.28, 43.7] },
  });
  expect(created.status).toBe(201);
  siteId = ((await created.json()) as { id: string }).id;
  for (const contact of [
    { name: 'Accueil du site', phone: '+33493000001', visibility: 'ops' },
    { name: 'SECRET contact interne', phone: '+33493000002', visibility: 'prevision' },
  ]) {
    expect((await editor('POST', `/sites/${siteId}/contacts`, contact)).status).toBe(201);
  }
  const types = endpoints.listObjectTypes.response.parse(await (await editor('GET', '/object-types')).json()).items;
  await editor('POST', `/sites/${siteId}/objects`, {
    object_type_id: types.find((type) => type.code === 'PEI')?.id,
    label: 'SECRET PEI',
    geometry: { type: 'Point', coordinates: [7.2801, 43.7001] },
  });
  const upload = async (title: string, bytes: Uint8Array, portalVisible: boolean) => {
    const document = endpoints.createDocument.response.parse(
      await (
        await editor('POST', `/sites/${siteId}/documents`, {
          title,
          category: 'notice',
          portal_visible: portalVisible,
          file: {
            filename: `${portalVisible ? 'notice' : 'interne'}.pdf`,
            mime_type: 'application/pdf',
            size_bytes: bytes.byteLength,
            sha256: await sha256(bytes),
          },
        })
      ).json(),
    );
    expect(document.document.portal_visible).toBe(portalVisible);
    await fetch(document.upload.url, { method: 'PUT', headers: document.upload.headers, body: bytes });
    await editor('POST', `/assets/${document.upload.asset_id}/uploaded`);
    return document.document.id;
  };
  sharedId = await upload('Notice du système de sécurité incendie', shared, true);
  internalId = await upload('SECRET consignes internes', internal, false);
  await drain(worker);

  const draft = endpoints.createRevision.response.parse(
    await (await editor('POST', `/sites/${siteId}/etare/revisions`, { change_summary: 'Portail' })).json(),
  );
  const submitted: EtareRevision = endpoints.submitRevision.response.parse(
    await (
      await editor('POST', `/etare-revisions/${draft.id}/submit`, { change_summary: 'Portail' }, draft.row_version)
    ).json(),
  );
  const decided = await validator('POST', `/etare-revisions/${draft.id}/decision`, {
    decision: 'approved',
    revision_hash: submitted.content_hash,
    publish: true,
  });
  expect(decided.status).toBe(200);
  await drain(worker);

  // The exploitant of the demo, invited on this site too (existing account: no e-mail).
  const invited = endpoints.createPortalInvitation.response.parse(
    await (
      await editor('POST', '/portal-invitations', { email: 'exploitant.oliviers@demo.etare.test', site_ids: [siteId] })
    ).json(),
  );
  expect(invited.notice).toBe('existing_account');
  invitationId = invited.invitation.id;
  const accepted = await as(exploitantToken, null)('POST', `/me/portal-invitations/${invitationId}/acceptance`);
  expect(accepted.status).toBe(200);
  exploitantAal1 = as(exploitantToken, TENANT_06);
  exploitant = as(await strong(exploitantToken), TENANT_06);
});

afterAll(async () => {
  if (invitationId) {
    const current = endpoints.listPortalInvitations.response
      .parse(await (await editor('GET', '/portal-invitations')).json())
      .items.find((item) => item.id === invitationId);
    await editor(
      'POST',
      `/portal-invitations/${invitationId}/revocation`,
      { reason: 'Fin du test' },
      current?.row_version,
    );
  }
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  await workerPool.end();
});

describe('exploitant consultation', () => {
  it('lists the sites of the exploitant with their published version, with the second factor only', async () => {
    const list = async (call: Call) =>
      endpoints.listPortalSites.response.parse(await (await call('GET', '/portal/sites')).json()).items;
    // Without its code, the enrolled exploitant is refused outright (ADR-022).
    const withoutCode = await exploitantAal1('GET', '/portal/sites');
    expect(withoutCode.status).toBe(403);
    expect(((await withoutCode.json()) as { error: { code: string } }).error.code).toBe('MFA_REQUIRED');
    const sites = await list(exploitant);
    expect(sites.map((site) => site.id)).toEqual(expect.arrayContaining([EHPAD_ID, siteId]));
    expect(sites.find((site) => site.id === siteId)).toMatchObject({ publication_number: 1 });
    // Back-office people do not read through the portal.
    expect(await list(editor)).toEqual([]);
  });

  it('shows the whitelist of the published version, nothing else', async () => {
    const response = await exploitant('GET', `/portal/sites/${siteId}`);
    expect(response.status).toBe(200);
    const text = await response.text();
    const site = endpoints.getPortalSite.response.parse(JSON.parse(text));
    expect(site.publication?.publication_number).toBe(1);
    expect(site.address).toMatchObject({ street: '1 rue du Port', city: 'Nice', postal_code: '06300' });
    expect(site.contacts.map((contact) => contact.name)).toEqual(['Accueil du site']);
    expect(site.documents.map((document) => document.id)).toEqual([sharedId]);
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain(internalId);
    expect((await exploitantAal1('GET', `/portal/sites/${siteId}`)).status).toBe(403);
  });

  it('downloads the shared document only', async () => {
    const response = await exploitant('GET', `/portal/sites/${siteId}/documents/${sharedId}/download`);
    expect(response.status).toBe(200);
    const ticket = endpoints.getPortalDocumentDownload.response.parse(await response.json());
    expect(ticket.filename).toBe('notice.pdf');
    expect(new Uint8Array(await (await fetch(ticket.url)).arrayBuffer())).toEqual(shared);
    expect((await exploitant('GET', `/portal/sites/${siteId}/documents/${internalId}/download`)).status).toBe(404);
    // The working files of the site stay out of reach.
    expect((await exploitant('GET', `/sites/${siteId}/documents`)).status).toBe(403);
  });
});
