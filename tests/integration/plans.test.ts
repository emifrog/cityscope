/**
 * Sprint 3 — level plans through the real stack: background uploaded through
 * the controlled chain (quarantine, worker verification), revisions kept when
 * the background is replaced, SIS isolation.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { antivirusNotConfigured } from '@etare/application';
import { API_BASE_PATH, endpoints, type PlanUploadResponse } from '@etare/contracts';
import { HandlerRegistry, assetVerificationHandler, createWorker, noopHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, TENANT_83, requireEnv, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-plans',
});
afterAll(async () => {
  await workerPool.end();
});

const sha256 = (content: Uint8Array) => createHash('sha256').update(content).digest('hex');
const DEMO_PLAN = readFileSync(resolve(import.meta.dirname, '../../supabase/seed-assets/plan-batiment-a-rdc.png'));
const LEVEL_RDC_B = '06000004-0000-4000-8000-000000000006';
const LEVEL_83 = '83000004-0000-4000-8000-000000000001';

const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-plans'),
  registry: new HandlerRegistry([
    noopHandler,
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects: SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY')),
      scanner: antivirusNotConfigured,
      sha256: async (content) => sha256(content),
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 10,
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

let editor06: Call;
let reader06: Call;
let editor83: Call;

beforeAll(async () => {
  const [editor, reader, other] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('lecteur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor06 = as(editor, TENANT_06);
  reader06 = as(reader, TENANT_06);
  editor83 = as(other, TENANT_83);
});

const background = {
  filename: 'plan-rdc.png',
  mime_type: 'image/png',
  size_bytes: DEMO_PLAN.byteLength,
  sha256: sha256(DEMO_PLAN),
};

async function uploadAndVerify(created: PlanUploadResponse) {
  const put = await fetch(created.upload.url, { method: 'PUT', headers: created.upload.headers, body: DEMO_PLAN });
  expect(put.ok).toBe(true);
  expect((await editor06('POST', `/assets/${created.upload.asset_id}/uploaded`)).status).toBe(202);
  await worker.runOnce();
}

describe('level plans', () => {
  it('lists the demo plan with its checked background', async () => {
    const response = await reader06('GET', `/sites/${EHPAD_ID}/plans`);
    expect(response.status).toBe(200);
    const { items } = endpoints.listSitePlans.response.parse(await response.json());
    const demo = items.find((plan) => plan.title === 'Bâtiment A - RDC');
    expect(demo).toMatchObject({ plan_type: 'level', building_name: 'Bâtiment A', level_label: 'RDC' });
    expect(demo?.revisions[0]).toMatchObject({ width: 1600, height: 1000, is_current: true });
    expect(demo?.revisions[0]?.asset.scan_status).toBe('clean');
  });

  it('creates a level plan, then replaces its background while keeping the history', async () => {
    const created = await editor06('POST', `/sites/${EHPAD_ID}/plans`, {
      title: `Bâtiment B - RDC (test ${Date.now()})`,
      plan_type: 'level',
      level_id: LEVEL_RDC_B,
      width: 1600,
      height: 1000,
      file: background,
    });
    expect(created.status).toBe(201);
    const first = endpoints.createPlan.response.parse(await created.json());
    // The building comes from the level, whatever the client sends.
    expect(first.plan).toMatchObject({ building_name: 'Bâtiment B', level_label: 'RDC' });
    await uploadAndVerify(first);

    const replaced = await editor06('POST', `/plans/${first.plan.id}/revisions`, {
      width: 1600,
      height: 1000,
      page_number: 2,
      file: background,
    });
    expect(replaced.status).toBe(201);
    const second = endpoints.createPlanRevision.response.parse(await replaced.json());
    expect(second.plan.revisions.map((revision) => [revision.revision_no, revision.is_current])).toEqual([
      [2, true],
      [1, false],
    ]);
    await uploadAndVerify(second);
    const listed = endpoints.listSitePlans.response
      .parse(await (await editor06('GET', `/sites/${EHPAD_ID}/plans`)).json())
      .items.find((plan) => plan.id === first.plan.id);
    expect(listed?.revisions.map((revision) => revision.asset.scan_status)).toEqual(['clean', 'clean']);
  });

  it('refuses a raw PDF background, a level plan without level and a level of another SIS', async () => {
    const pdf = await editor06('POST', `/sites/${EHPAD_ID}/plans`, {
      title: 'PDF brut',
      plan_type: 'site',
      width: 100,
      height: 100,
      file: { ...background, filename: 'plan.pdf', mime_type: 'application/pdf' },
    });
    expect(pdf.status).toBe(400);
    const noLevel = await editor06('POST', `/sites/${EHPAD_ID}/plans`, {
      title: 'Sans niveau',
      plan_type: 'level',
      width: 100,
      height: 100,
      file: background,
    });
    expect(noLevel.status).toBe(400);
    const foreignLevel = await editor06('POST', `/sites/${EHPAD_ID}/plans`, {
      title: 'Niveau étranger',
      plan_type: 'level',
      level_id: LEVEL_83,
      width: 100,
      height: 100,
      file: background,
    });
    expect(foreignLevel.status).toBe(404);
  });

  it('keeps plans inside the SIS and writes to editors', async () => {
    expect((await editor83('GET', `/sites/${EHPAD_ID}/plans`)).status).toBe(404);
    const creation = { title: 'Lecteur', plan_type: 'site', width: 100, height: 100, file: background };
    expect((await reader06('POST', `/sites/${EHPAD_ID}/plans`, creation)).status).toBe(403);
  });
});
