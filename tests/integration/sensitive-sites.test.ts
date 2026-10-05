/**
 * Sprint 10 — sensitive sites through the real stack (PER-02, ADR-025): a
 * "restricted" site is never distributed in bulk; a habilitated agent opens it
 * on demand for 24 hours; consultations, exports and downloads are journaled,
 * from the back-office and from the tablet; a "high" site never reaches it.
 */
import { createHash } from 'node:crypto';
import {
  Ed25519Signer,
  PdfLibEtareRenderer,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  SharpImageResizer,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints, syncCatalogSchema, type EtareRevision } from '@etare/contracts';
import { HandlerRegistry, createWorker, publicationBuildHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, requireEnv, signIn, withSecondFactor } from './helpers';
import { Terminal } from './terminal';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-sensitive',
});
const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-sensitive'),
  registry: new HandlerRegistry([
    publicationBuildHandler({
      store: new PostgresPublicationBuildStore(workerPool),
      tools: {
        sha256,
        byteLength: (text) => Buffer.byteLength(text, 'utf8'),
        now: () => new Date(),
        signer: Ed25519Signer.fromPkcs8(requireEnv('PUBLICATION_SIGNING_KEY')),
      },
      artifacts: {
        renderer: new PdfLibEtareRenderer(),
        objects: SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY')),
        sha256Bytes: sha256,
        images: new SharpImageResizer(),
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

let admin06: Call;
let editor06: Call;
let ops06: Call;
let opsToken = '';
let adminFactor: { token: string; factorId: string } | undefined;
let validatorFactor: { token: string; factorId: string } | undefined;
let siteId = '';
let publicationId = '';
let device: Terminal;

const catalogOf = async () =>
  syncCatalogSchema.parse(
    JSON.parse(
      endpoints.getSyncCatalog.response.parse(await (await device.request('GET', '/sync/catalog')).json()).catalog,
    ),
  );
const opsMember = async () =>
  endpoints.listMembers.response
    .parse(await (await admin06('GET', '/members')).json())
    .items.find((member) => member.email === 'ops06@demo.etare.test');

beforeAll(async () => {
  const [editor, validator, admin, ops] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
  ]);
  opsToken = ops;
  editor06 = as(editor);
  ops06 = as(ops);
  adminFactor = await withSecondFactor(admin);
  admin06 = as(adminFactor.token);
  validatorFactor = await withSecondFactor(validator);
  const validator06 = as(validatorFactor.token);

  // A restricted site, published with its PDF.
  const created = await editor06('POST', '/sites', {
    name: `Site sensible ${Date.now()}`,
    site_type: 'industrial',
    status: 'active',
    sensitivity: 'restricted',
    location: { type: 'Point', coordinates: [7.12, 43.58] },
  });
  expect(created.status).toBe(201);
  siteId = ((await created.json()) as { id: string }).id;
  const draft = endpoints.createRevision.response.parse(
    await (await editor06('POST', `/sites/${siteId}/etare/revisions`, { change_summary: 'Sensible' })).json(),
  );
  const submitted: EtareRevision = endpoints.submitRevision.response.parse(
    await (
      await editor06('POST', `/etare-revisions/${draft.id}/submit`, { change_summary: 'Sensible' }, draft.row_version)
    ).json(),
  );
  const decided = await validator06('POST', `/etare-revisions/${draft.id}/decision`, {
    decision: 'approved',
    revision_hash: submitted.content_hash,
    publish: true,
  });
  expect(decided.status).toBe(200);
  await worker.runOnce();
  const overview = endpoints.getSiteEtare.response.parse(
    await (await editor06('GET', `/sites/${siteId}/etare`)).json(),
  );
  expect(overview.publications[0]?.status).toBe('published');
  publicationId = overview.publications[0]?.id ?? '';

  // An enrolled tablet of the whole SIS, used by the OPS agent.
  const code = endpoints.createDevice.response.parse(
    await (await admin06('POST', '/devices', { name: `TABLETTE SENSIBLE ${Date.now()}` })).json(),
  ).enrollment_code;
  device = new Terminal(app, opsToken, TENANT_06);
  const enrolled = await ops06('POST', '/sync/enrollment', device.enrollment(code));
  device.deviceId = endpoints.enrollDevice.response.parse(await enrolled.json()).device_id;
});

afterAll(async () => {
  const member = adminFactor ? await opsMember() : undefined;
  if (member?.sensitive_access) {
    await admin06(
      'PUT',
      `/members/${member.id}/sensitive-access`,
      { sector_ids: [], valid_until: null },
      member.row_version,
    );
  }
  for (const factor of [adminFactor, validatorFactor]) {
    if (factor) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  }
  await workerPool.end();
});

describe('sensitive sites (PER-02)', () => {
  it('never offers a restricted site in bulk, nor on demand without a habilitation', async () => {
    const catalog = await catalogOf();
    expect(catalog.publications.map((entry) => entry.site_id)).not.toContain(siteId);
    expect(catalog.on_demand.map((entry) => entry.site_id)).not.toContain(siteId);
    expect((await device.request('GET', `/sync/publications/${publicationId}`)).status).toBe(404);
    // An OPS agent reads published versions, but not the PDF of a sensitive site without habilitation.
    expect(await codeOf(await ops06('GET', `/publications/${publicationId}/pdf`))).toBe('FORBIDDEN');
  });

  it('offers it on demand to the habilitated agent, for 24 hours, and journals the download', async () => {
    const member = await opsMember();
    const tooLong = await admin06(
      'PUT',
      `/members/${member?.id}/sensitive-access`,
      { sector_ids: [], valid_until: new Date(Date.now() + 400 * 86_400_000).toISOString() },
      member?.row_version,
    );
    expect(await codeOf(tooLong)).toBe('VALIDATION_FAILED');
    const granted = await admin06(
      'PUT',
      `/members/${member?.id}/sensitive-access`,
      { sector_ids: [], valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      member?.row_version,
    );
    expect(granted.status).toBe(200);
    expect(endpoints.setMemberSensitiveAccess.response.parse(await granted.json()).sensitive_access).toMatchObject({
      sectors: [],
    });

    const catalog = await catalogOf();
    expect(catalog.publications.map((entry) => entry.site_id)).not.toContain(siteId);
    expect(catalog.on_demand.find((entry) => entry.site_id === siteId)).toMatchObject({
      publication_id: publicationId,
    });
    const opened = await device.request('GET', `/sync/publications/${publicationId}`);
    expect(opened.status).toBe(200);
    const pkg = endpoints.getSyncPackage.response.parse(await opened.json());
    const remaining = new Date(pkg.access_expires_at ?? 0).getTime() - Date.now();
    expect(remaining).toBeGreaterThan(23.9 * 3_600_000);
    expect(remaining).toBeLessThanOrEqual(24 * 3_600_000);
    expect((await ops06('GET', `/publications/${publicationId}/pdf`)).status).toBe(200);
  });

  it('journals the consultations of the tablet once, and those of the back-office', async () => {
    const event = {
      client_event_id: crypto.randomUUID(),
      site_id: siteId,
      publication_id: publicationId,
      action: 'view',
      occurred_at: new Date(Date.now() - 60_000).toISOString(),
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sent = await device.request('POST', '/sync/access-events', { events: [event] });
      expect(endpoints.submitAccessEvents.response.parse(await sent.json())).toEqual({ received: 1 });
    }
    expect((await editor06('GET', `/sites/${siteId}`)).status).toBe(200);
    expect(await codeOf(await editor06('GET', '/access-events'))).toBe('FORBIDDEN');

    const journal = endpoints.listAccessEvents.response.parse(
      await (await admin06('GET', `/access-events?site_id=${siteId}&limit=50`)).json(),
    );
    const seen = journal.items.map((item) => `${item.action}:${item.origin}:${item.device_name ? 'tablette' : 'web'}`);
    expect(seen.filter((item) => item === 'view:mobile:tablette')).toHaveLength(1);
    expect(seen).toEqual(
      expect.arrayContaining([
        'download_offline:mobile:tablette',
        'view:mobile:tablette',
        'export:web:web',
        'view:web:web',
      ]),
    );
    expect(journal.items.every((item) => item.sensitivity === 'restricted')).toBe(true);
  });

  it('never sends a high site to a tablet, habilitation or not', async () => {
    const site = endpoints.getSite.response.parse(await (await editor06('GET', `/sites/${siteId}`)).json());
    const raised = await editor06('PATCH', `/sites/${siteId}`, { sensitivity: 'high' }, site.row_version);
    expect(raised.status).toBe(200);
    const catalog = await catalogOf();
    expect(catalog.on_demand.map((entry) => entry.site_id)).not.toContain(siteId);
    expect((await device.request('GET', `/sync/publications/${publicationId}`)).status).toBe(404);
    expect(await codeOf(await ops06('GET', `/publications/${publicationId}/pdf`))).toBe('FORBIDDEN');
  });
});
