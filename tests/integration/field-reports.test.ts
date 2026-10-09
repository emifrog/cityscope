/**
 * Sprint 5 — field reports through the real stack (OPS-04, ADR-017): an agent
 * reports a discrepancy from an enrolled terminal, with a photo, possibly
 * twice when the acknowledgement is lost; the Prévision instructs it,
 * integrates the correction into a draft revision, decides, and the new
 * version is published; the agent then sees the outcome on the terminal.
 */
import {
  Ed25519Signer,
  PdfLibEtareRenderer,
  SharpImageResizer,
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { antivirusNotConfigured } from '@etare/application';
import { API_BASE_PATH, endpoints, type EtareRevision, type FieldReportSubmit } from '@etare/contracts';
import { HandlerRegistry, assetVerificationHandler, createWorker, publicationBuildHandler } from '@etare/worker';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, TENANT_83, authApi, requireEnv, signIn, withSecondFactor } from './helpers';
import { Terminal, sha256Hex } from './terminal';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-reports',
});
const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
const sha256 = async (content: string | Uint8Array) => sha256Hex(content);
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-reports'),
  registry: new HandlerRegistry([
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects,
      scanner: antivirusNotConfigured,
      sha256,
    }),
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
        objects,
        sha256Bytes: sha256,
        images: new SharpImageResizer(),
        appBaseUrl: null,
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
  (token: string, tenant: string): Call =>
  async (method, path, body, ifMatch) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': tenant,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

let editor06: Call;
let reader06: Call;
let editor83: Call;
let validator06: Call;
let device: Terminal;
let siteId = '';
let objectId = '';
let publicationId = '';
const factors: { token: string; factorId: string }[] = [];
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(`portail ${Date.now()}`)]);

async function publish(editor: Call, site: string, summary: string) {
  const overview = endpoints.getSiteEtare.response.parse(await (await editor('GET', `/sites/${site}/etare`)).json());
  const draft =
    overview.revisions.find((revision) => revision.status === 'draft') ??
    endpoints.createRevision.response.parse(
      await (await editor('POST', `/sites/${site}/etare/revisions`, { change_summary: summary })).json(),
    );
  const submitted: EtareRevision = endpoints.submitRevision.response.parse(
    await (
      await editor('POST', `/etare-revisions/${draft.id}/submit`, { change_summary: summary }, draft.row_version)
    ).json(),
  );
  const decided = await validator06('POST', `/etare-revisions/${draft.id}/decision`, {
    decision: 'approved',
    revision_hash: submitted.content_hash,
    publish: true,
  });
  expect(decided.status).toBe(200);
  await worker.runOnce();
  return draft;
}

beforeAll(async () => {
  const [editor, reader, validator, adminToken, ops, other] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('lecteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  reader06 = as(reader, TENANT_06);
  editor83 = as(other, TENANT_83);
  const validatorFactor = await withSecondFactor(validator);
  const adminFactor = await withSecondFactor(adminToken);
  factors.push(validatorFactor, adminFactor);
  validator06 = as(validatorFactor.token, TENANT_06);

  // A site published with a hydrant: the version the agent consults.
  const created = await editor06('POST', '/sites', {
    name: `Site signalé ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { city: 'Nice', postal_code: '06000' },
    location: { type: 'Point', coordinates: [7.28, 43.72] },
  });
  siteId = ((await created.json()) as { id: string }).id;
  const types = endpoints.listObjectTypes.response.parse(await (await editor06('GET', '/object-types')).json()).items;
  objectId = endpoints.createSiteObject.response.parse(
    await (
      await editor06('POST', `/sites/${siteId}/objects`, {
        object_type_id: types.find((type) => type.code === 'PEI')?.id,
        label: 'PEI 1',
        geometry: { type: 'Point', coordinates: [7.2801, 43.7201] },
      })
    ).json(),
  ).id;
  await publish(editor06, siteId, 'Première version');
  const overview = endpoints.getSiteEtare.response.parse(
    await (await editor06('GET', `/sites/${siteId}/etare`)).json(),
  );
  publicationId = overview.publications[0]?.id ?? '';

  // The terminal of the agent, enrolled with a code of the administration.
  const declared = endpoints.createDevice.response.parse(
    await (
      await as(adminFactor.token, TENANT_06)('POST', '/devices', { name: `TABLETTE SIGNAL ${Date.now()}` })
    ).json(),
  );
  device = new Terminal(app, ops, TENANT_06);
  const enrolled = await as(ops, TENANT_06)('POST', '/sync/enrollment', device.enrollment(declared.enrollment_code));
  device.deviceId = endpoints.enrollDevice.response.parse(await enrolled.json()).device_id;
});

afterAll(async () => {
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  await workerPool.end();
});

describe('field reports', () => {
  const clientReportId = randomUUID();
  const observedAt = new Date(Date.now() - 60_000).toISOString();
  const report = (): FieldReportSubmit => ({
    client_report_id: clientReportId,
    site_id: siteId,
    publication_id: publicationId,
    category: 'access',
    severity: 'urgent',
    description: 'Portail secondaire condamné par une barrière. Accès engin impossible.',
    observed_at: observedAt,
    item: { type: 'object', id: objectId },
    plan_position: null,
    photos: [
      { filename: 'portail.jpg', mime_type: 'image/jpeg', size_bytes: photo.byteLength, sha256: sha256Hex(photo) },
    ],
  });
  let reportId = '';

  it('receives a report once, even when the acknowledgement was lost, and its photo through quarantine', async () => {
    const first = endpoints.submitFieldReport.response.parse(
      await (await device.request('POST', '/sync/reports', report())).json(),
    );
    expect(first).toMatchObject({ client_report_id: clientReportId, created: true });
    expect(first.uploads.map((upload) => upload.sha256)).toEqual([sha256Hex(photo)]);
    reportId = first.report_id;

    // The terminal did not get the answer: it sends the same report again.
    const replay = endpoints.submitFieldReport.response.parse(
      await (await device.request('POST', '/sync/reports', report())).json(),
    );
    expect(replay).toMatchObject({ report_id: reportId, created: false, content_hash: first.content_hash });

    const ticket = first.uploads[0]?.upload;
    const sent = await fetch(ticket?.url ?? '', { method: 'PUT', headers: ticket?.headers ?? {}, body: photo });
    expect(sent.ok, await sent.clone().text()).toBe(true);
    // Sent twice (lost answer): the storage refuses the second copy; the file is already there.
    const again = replay.uploads[0]?.upload;
    expect((await fetch(again?.url ?? '', { method: 'PUT', headers: again?.headers ?? {}, body: photo })).ok).toBe(
      false,
    );
    const confirmed = await device.request('POST', `/sync/reports/${reportId}/uploaded`);
    expect(confirmed.status).toBe(202);
    await worker.runOnce();

    const other = await device.request('POST', '/sync/reports', { ...report(), description: 'Un autre constat.' });
    expect(await codeOf(other)).toBe('CONFLICT');
  });

  it('refuses an element or a position absent from the version consulted', async () => {
    const response = await device.request('POST', '/sync/reports', {
      ...report(),
      client_report_id: randomUUID(),
      item: { type: 'risk', id: objectId },
      photos: [],
    });
    expect(await codeOf(response)).toBe('VALIDATION_FAILED');
  });

  it('is instructed by the Prévision only, with the version consulted and the checked photo', async () => {
    expect(await codeOf(await reader06('GET', '/field-reports'))).toBe('FORBIDDEN');
    expect((await editor83('GET', `/field-reports/${reportId}`)).status).toBe(404);
    const list = endpoints.listFieldReports.response.parse(
      await (await editor06('GET', `/field-reports?site_id=${siteId}`)).json(),
    );
    expect(list.open_count).toBeGreaterThanOrEqual(1);
    const listed = list.items.find((item) => item.id === reportId);
    expect(listed).toMatchObject({
      status: 'new',
      category: 'access',
      severity: 'urgent',
      reporter: { name: 'Intervenant OPS 06 (démo)' },
      publication: { id: publicationId, publication_number: 1 },
      current_publication_number: 1,
      item: { type: 'object', id: objectId, label: 'PEI 1', current_status: 'active' },
    });
    expect(listed?.photos.map((asset) => asset.scan_status)).toEqual(['clean']);
    const download = await editor06('GET', `/assets/${listed?.photos[0]?.id}/download`);
    expect(download.status).toBe(200);
  });

  it('integrates the correction into a draft, decides, and the agent sees the published fix', async () => {
    const detail = endpoints.getFieldReport.response.parse(
      await (await editor06('GET', `/field-reports/${reportId}`)).json(),
    );
    const triaged = endpoints.updateFieldReport.response.parse(
      await (await editor06('PATCH', `/field-reports/${reportId}`, { status: 'triaged' }, detail.row_version)).json(),
    );
    const draft = endpoints.createRevision.response.parse(
      await (
        await editor06('POST', `/sites/${siteId}/etare/revisions`, { change_summary: 'Signalement terrain' })
      ).json(),
    );
    const linked = endpoints.updateFieldReport.response.parse(
      await (
        await editor06('PATCH', `/field-reports/${reportId}`, { resolution_revision_id: draft.id }, triaged.row_version)
      ).json(),
    );
    expect(linked.resolution).toMatchObject({ revision_id: draft.id, revision_no: 2, publication_number: null });
    // The correction itself: the hydrant is out of service.
    const object = endpoints.listSiteObjects.response
      .parse(await (await editor06('GET', `/sites/${siteId}/objects`)).json())
      .items.find((item) => item.id === objectId);
    await editor06('PATCH', `/objects/${objectId}`, { status: 'out_of_service' }, object?.row_version);

    const missing = await editor06('PATCH', `/field-reports/${reportId}`, { status: 'resolved' }, linked.row_version);
    expect(await codeOf(missing)).toBe('VALIDATION_FAILED');
    const resolved = endpoints.updateFieldReport.response.parse(
      await (
        await editor06(
          'PATCH',
          `/field-reports/${reportId}`,
          {
            status: 'resolved',
            decision_comment: 'Accès condamné reporté sur le PEI ; version suivante en validation.',
          },
          linked.row_version,
        )
      ).json(),
    );
    expect(resolved).toMatchObject({ status: 'resolved', decided_by: { name: 'Rédacteur Prévision 06 (démo)' } });
    const closed = await editor06(
      'PATCH',
      `/field-reports/${reportId}`,
      { status: 'rejected', decision_comment: 'Non.' },
      resolved.row_version,
    );
    expect(await codeOf(closed)).toBe('CONFLICT');

    await publish(editor06, siteId, 'Signalement terrain');
    const byRevision = endpoints.listFieldReports.response.parse(
      await (await editor06('GET', `/field-reports?view=all&revision_id=${draft.id}`)).json(),
    );
    expect(byRevision.items.map((item) => item.id)).toEqual([reportId]);

    const feedback = endpoints.listSyncReports.response.parse(
      await (await device.request('GET', '/sync/reports')).json(),
    );
    expect(feedback.items.find((item) => item.report_id === reportId)).toMatchObject({
      client_report_id: clientReportId,
      status: 'resolved',
      decision_comment: 'Accès condamné reporté sur le PEI ; version suivante en validation.',
      photos: { pending: 0, clean: 1, rejected: 0 },
      resolution: { revision_no: 2, publication_number: 2 },
    });
  });
});
