/**
 * Sprint 3 — revision, validation and publication through the real stack
 * (WF-01, WF-02, ETARE-01): checks, frozen snapshot and hash, decision of an
 * independent validator with a second factor, publication built by the worker
 * from the snapshot only, activation. Runs on a site created for the test.
 */
import { createHash } from 'node:crypto';
import { PostgresJobQueue, PostgresPublicationBuildStore, createLogger, createPool } from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints, type EtareRevision } from '@etare/contracts';
import { canonicalJson } from '@etare/domain';
import { HandlerRegistry, createWorker, publicationBuildHandler } from '@etare/worker';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, TENANT_83, authApi, requireEnv, signIn, withSecondFactor } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-etare',
});
const admin = new pg.Client({ connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL') });

const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-etare'),
  registry: new HandlerRegistry([
    publicationBuildHandler({
      store: new PostgresPublicationBuildStore(workerPool),
      tools: { sha256, byteLength: (text) => Buffer.byteLength(text, 'utf8'), now: () => new Date() },
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 5,
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
let validator06: Call;
let validatorWithMfa: Call;
let editor83: Call;
let validatorFactor: { token: string; factorId: string } | undefined;
let siteId = '';

beforeAll(async () => {
  await admin.connect();
  const [editor, reader, validator, other] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('lecteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  reader06 = as(reader, TENANT_06);
  validator06 = as(validator, TENANT_06);
  editor83 = as(other, TENANT_83);
  validatorFactor = await withSecondFactor(validator);
  validatorWithMfa = as(validatorFactor.token, TENANT_06);

  const created = await editor06('POST', '/sites', {
    name: `Site workflow ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { city: 'Nice', postal_code: '06000' },
    location: { type: 'Point', coordinates: [7.26, 43.7] },
  });
  expect(created.status).toBe(201);
  siteId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  if (validatorFactor) {
    await authApi(`/factors/${validatorFactor.factorId}`, { method: 'DELETE', token: validatorFactor.token });
  }
  await admin.end();
  await workerPool.end();
});

async function openRevision(summary: string): Promise<EtareRevision> {
  const response = await editor06('POST', `/sites/${siteId}/etare/revisions`, { change_summary: summary });
  expect(response.status).toBe(201);
  return endpoints.createRevision.response.parse(await response.json());
}

async function submit(revision: EtareRevision, summary: string): Promise<EtareRevision> {
  const response = await editor06(
    'POST',
    `/etare-revisions/${revision.id}/submit`,
    { change_summary: summary },
    revision.row_version,
  );
  expect(response.status).toBe(200);
  return endpoints.submitRevision.response.parse(await response.json());
}

describe('ETARE workflow', () => {
  it('previews the dossier with its checks', async () => {
    const response = await reader06('GET', `/sites/${siteId}/etare/preview`);
    expect(response.status).toBe(200);
    const preview = endpoints.previewSiteEtare.response.parse(await response.json());
    expect(preview.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.content_hash).toBe(await sha256(canonicalJson(preview.snapshot)));
    expect(preview.checks.find((check) => check.code === 'site_location')?.level).toBe('ok');
    expect(preview.checks.filter((check) => check.level === 'error')).toEqual([]);
  });

  it('submits, validates with a second factor, and publishes from the frozen snapshot', async () => {
    const draft = await openRevision('Première version');
    expect(draft).toMatchObject({
      revision_no: 1,
      status: 'draft',
      created_by: { name: 'Rédacteur Prévision 06 (démo)' },
    });
    // One open revision at a time.
    const second = await editor06('POST', `/sites/${siteId}/etare/revisions`, {});
    expect(second.status).toBe(409);

    const submitted = await submit(draft, 'Création du dossier : accès et point d’eau.');
    expect(submitted.status).toBe('submitted');
    expect(submitted.content_hash).toMatch(/^[0-9a-f]{64}$/);

    const queue = endpoints.listValidations.response.parse(await (await validator06('GET', '/validations')).json());
    expect(queue.items.map((item) => item.revision_id)).toContain(draft.id);
    const detail = endpoints.getRevision.response.parse(
      await (await validator06('GET', `/etare-revisions/${draft.id}`)).json(),
    );
    expect(detail.snapshot?.site.id).toBe(siteId);
    expect(detail.changes).toBeNull();
    expect(detail.contributors.map((person) => person.name)).toContain('Rédacteur Prévision 06 (démo)');
    expect(await sha256(canonicalJson(detail.snapshot))).toBe(submitted.content_hash);

    const decision = { decision: 'approved', revision_hash: submitted.content_hash, publish: true };
    // The editor cannot decide; the validator needs the second factor, and the exact content.
    expect(await codeOf(await editor06('POST', `/etare-revisions/${draft.id}/decision`, decision))).toBe('FORBIDDEN');
    expect(await codeOf(await validator06('POST', `/etare-revisions/${draft.id}/decision`, decision))).toBe(
      'MFA_REQUIRED',
    );
    const stale = await validatorWithMfa('POST', `/etare-revisions/${draft.id}/decision`, {
      ...decision,
      revision_hash: 'f'.repeat(64),
    });
    expect(stale.status).toBe(412);

    const approved = await validatorWithMfa('POST', `/etare-revisions/${draft.id}/decision`, decision);
    expect(approved.status).toBe(200);
    const revision = endpoints.decideRevision.response.parse(await approved.json());
    expect(revision).toMatchObject({
      status: 'approved',
      decision: { decision: 'approved' },
      publication: { status: 'queued' },
    });

    await worker.runOnce();
    const overview = endpoints.getSiteEtare.response.parse(
      await (await editor06('GET', `/sites/${siteId}/etare`)).json(),
    );
    const publication = overview.publications[0];
    expect(publication).toMatchObject({ publication_number: 1, status: 'published' });
    const site = (await (await editor06('GET', `/sites/${siteId}`)).json()) as {
      active_publication: { publication_number: number };
    };
    expect(site.active_publication.publication_number).toBe(1);

    // Integrity: the stored manifest hash and the data file hash are those of their canonical text.
    const stored = await admin.query<{
      payload: unknown;
      manifest: { files: { path: string; sha256: string }[] };
      manifest_hash: string;
    }>('select payload, manifest, manifest_hash from app.publication where id = $1', [publication?.id]);
    const row = stored.rows[0];
    expect(row?.manifest_hash).toBe(await sha256(canonicalJson(row?.manifest)));
    expect(row?.manifest.files[0]).toMatchObject({
      path: 'data/site.json',
      sha256: await sha256(canonicalJson(row?.payload)),
    });
    expect((row?.payload as { data: unknown }).data).toEqual(detail.snapshot);
  });

  it('sends a revision back with a reason, then a new revision can start', async () => {
    const draft = await openRevision('Mise à jour des accès');
    const submitted = await submit(draft, 'Ajout d’un accès secondaire.');
    const unmotivated = await validatorWithMfa('POST', `/etare-revisions/${draft.id}/decision`, {
      decision: 'changes_requested',
      revision_hash: submitted.content_hash,
    });
    expect(unmotivated.status).toBe(400);
    const refused = await validatorWithMfa('POST', `/etare-revisions/${draft.id}/decision`, {
      decision: 'changes_requested',
      comment: 'Précisez le moyen d’ouverture du portail.',
      revision_hash: submitted.content_hash,
    });
    expect(refused.status).toBe(200);
    expect(endpoints.decideRevision.response.parse(await refused.json())).toMatchObject({
      status: 'changes_requested',
      decision: { comment: 'Précisez le moyen d’ouverture du portail.' },
      publication: null,
    });
    const detail = endpoints.getRevision.response.parse(
      await (await validator06('GET', `/etare-revisions/${draft.id}`)).json(),
    );
    // Compared with publication 1: same content.
    expect(detail.changes).toEqual([]);
    expect((await openRevision('Corrections demandées')).revision_no).toBe(3);
  });

  it('keeps the workflow inside the SIS and to its roles', async () => {
    expect((await editor83('GET', `/sites/${siteId}/etare`)).status).toBe(404);
    expect((await reader06('POST', `/sites/${siteId}/etare/revisions`, {})).status).toBe(403);
    const overview = endpoints.getSiteEtare.response.parse(
      await (await reader06('GET', `/sites/${siteId}/etare`)).json(),
    );
    const open = overview.revisions.find((revision) => revision.status === 'draft');
    expect(open).toBeDefined();
    expect((await editor83('GET', `/etare-revisions/${open?.id}`)).status).toBe(404);
  });
});
