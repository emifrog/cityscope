/**
 * Sprint 8 — life cycle of a dossier through the real stack (MET-04): the
 * version in force of a site, installed on an enrolled terminal, is withdrawn
 * by a validator with the second factor and a reason; the signed catalogue
 * tells the terminal why the site disappears. The site is then archived with
 * a reason (refused while a version is in force), nothing starts on it, and it
 * is restored.
 */
import { createHash } from 'node:crypto';
import {
  Ed25519Signer,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints, syncCatalogSchema, type EtareRevision } from '@etare/contracts';
import { HandlerRegistry, createWorker, publicationBuildHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, drain, requireEnv, signIn, withSecondFactor } from './helpers';
import { Terminal } from './terminal';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-lifecycle',
});
const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-lifecycle'),
  registry: new HandlerRegistry([
    publicationBuildHandler({
      store: new PostgresPublicationBuildStore(workerPool),
      tools: {
        sha256,
        byteLength: (text) => Buffer.byteLength(text, 'utf8'),
        now: () => new Date(),
        signer: Ed25519Signer.fromPkcs8(requireEnv('PUBLICATION_SIGNING_KEY')),
      },
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 2,
  leaseSeconds: 30,
  pollIntervalMs: 100,
});

type Call = (method: string, path: string, body?: unknown, ifMatch?: number) => Promise<Response>;
const as =
  (token: string): Call =>
  async (method, path, body, ifMatch) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': TENANT_06,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

const factors: { token: string; factorId: string }[] = [];
const strong = async (token: string) => {
  const factor = await withSecondFactor(token);
  factors.push(factor);
  return factor.token;
};

let editor: Call;
let validatorAal1: Call;
let validator: Call;
let device: Terminal;
let siteId = '';

const overview = async () =>
  endpoints.getSiteEtare.response.parse(await (await editor('GET', `/sites/${siteId}/etare`)).json());
const site = async () => endpoints.getSite.response.parse(await (await editor('GET', `/sites/${siteId}`)).json());
const catalog = async () =>
  syncCatalogSchema.parse(
    JSON.parse(
      endpoints.getSyncCatalog.response.parse(await (await device.request('GET', '/sync/catalog')).json()).catalog,
    ),
  );

beforeAll(async () => {
  const [editorToken, validatorToken, adminToken, opsToken] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
  ]);
  editor = as(editorToken);
  validatorAal1 = as(validatorToken);
  validator = as(await strong(validatorToken));
  const admin = as(await strong(adminToken));

  const created = await editor('POST', '/sites', {
    name: `Site cycle de vie ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { city: 'Nice', postal_code: '06000' },
    location: { type: 'Point', coordinates: [7.26, 43.7] },
  });
  siteId = ((await created.json()) as { id: string }).id;
  const draft = endpoints.createRevision.response.parse(
    await (await editor('POST', `/sites/${siteId}/etare/revisions`, { change_summary: 'Première' })).json(),
  );
  const submitted: EtareRevision = endpoints.submitRevision.response.parse(
    await (
      await editor('POST', `/etare-revisions/${draft.id}/submit`, { change_summary: 'Première' }, draft.row_version)
    ).json(),
  );
  await validator('POST', `/etare-revisions/${draft.id}/decision`, {
    decision: 'approved',
    revision_hash: submitted.content_hash,
    publish: true,
  });
  await drain(worker);

  // A terminal holding the version.
  const declared = endpoints.createDevice.response.parse(
    await (await admin('POST', '/devices', { name: `TABLETTE CYCLE ${Date.now()}` })).json(),
  );
  device = new Terminal(app, opsToken, TENANT_06);
  const enrolled = endpoints.enrollDevice.response.parse(
    await (await as(opsToken)('POST', '/sync/enrollment', device.enrollment(declared.enrollment_code))).json(),
  );
  device.deviceId = enrolled.device_id;
  const first = await catalog();
  const held = first.publications.find((entry) => entry.site_id === siteId);
  expect(held).toBeDefined();
  await device.request('POST', '/sync/receipts', {
    generation: first.generation,
    status: 'installed',
    error_code: null,
    installed: first.publications.map((entry) => entry.publication_id),
  });
});

afterAll(async () => {
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  await workerPool.end();
});

describe('life cycle of a dossier', () => {
  it('withdraws the version in force by a validator with the second factor and a reason', async () => {
    const active = (await overview()).publications.find((publication) => publication.status === 'published');
    expect(active).toBeDefined();
    const path = `/publications/${active?.id}/withdrawal`;
    expect(
      await codeOf(await editor('POST', `/sites/${siteId}/archive`, { reason: 'Fermé' }, (await site()).row_version)),
    ).toBe('CONFLICT');
    expect(await codeOf(await editor('POST', path, { reason: 'Plans faux' }, active?.row_version))).toBe('FORBIDDEN');
    expect(await codeOf(await validatorAal1('POST', path, { reason: 'Plans faux' }, active?.row_version))).toBe(
      'MFA_REQUIRED',
    );
    expect((await validator('POST', path, { reason: '' }, active?.row_version)).status).toBe(400);
    const response = await validator('POST', path, { reason: 'Bâtiment B démoli : plans faux.' }, active?.row_version);
    expect(response.status).toBe(200);
    expect(endpoints.withdrawPublication.response.parse(await response.json())).toMatchObject({
      status: 'withdrawn',
      withdrawal: { reason: 'Bâtiment B démoli : plans faux.' },
    });
    expect((await site()).active_publication).toBeNull();
  });

  it('tells the terminal why the site disappears', async () => {
    const current = await catalog();
    expect(current.publications.some((entry) => entry.site_id === siteId)).toBe(false);
    expect(current.withdrawals.find((entry) => entry.site_id === siteId)).toMatchObject({
      kind: 'withdrawn',
      reason: 'Bâtiment B démoli : plans faux.',
    });
  });

  it('archives the site with a reason; nothing starts on it until it is restored', async () => {
    const before = await site();
    expect((await editor('PATCH', `/sites/${siteId}`, { status: 'archived' }, before.row_version)).status).toBe(400);
    const archived = await editor(
      'POST',
      `/sites/${siteId}/archive`,
      { reason: 'Établissement fermé.' },
      before.row_version,
    );
    expect(archived.status).toBe(200);
    expect(endpoints.archiveSite.response.parse(await archived.json())).toMatchObject({
      status: 'archived',
      archive: { reason: 'Établissement fermé.' },
    });
    expect(await codeOf(await editor('POST', `/sites/${siteId}/etare/revisions`, {}))).toBe('CONFLICT');
    expect((await catalog()).withdrawals.find((entry) => entry.site_id === siteId)?.kind).toBe('archived');
    // The history stays readable.
    expect((await overview()).publications[0]?.withdrawal?.reason).toBe('Bâtiment B démoli : plans faux.');

    const restored = await editor('POST', `/sites/${siteId}/restore`, undefined, (await site()).row_version);
    expect(restored.status).toBe(200);
    expect(endpoints.restoreSite.response.parse(await restored.json())).toMatchObject({
      status: 'active',
      archive: null,
    });
    expect((await editor('POST', `/sites/${siteId}/etare/revisions`, {})).status).toBe(201);
  });
});
