/**
 * Sprint 12 — SEC-04: rotation of the signing keys through the real stack (ADR-027). The key set
 * signed by a root key is served to an enrolled terminal; after a rotation, the worker re-signs the
 * content in force with the new publication key, held by a Transit engine (OpenBao) when one is
 * available; the API serves the newest signature the terminals trust, signs catalogues through the
 * engine, refuses to serve a content only a revoked key signed, and shows the key set of each terminal.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Ed25519Signer,
  PdfLibEtareRenderer,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  PostgresSignatureRenewalStore,
  SharpImageResizer,
  SupabaseObjectStorage,
  TransitSigner,
  createLogger,
  createPool,
  isKeysetSignedBy,
  parseRootKeys,
  parseSignedKeyset,
  signKeyset,
  verifyEd25519,
} from '@etare/adapters';
import { createApiApp, createApiDependencies, type ApiDependencies } from '@etare/api';
import type { ContentSigner, IdentifiedSigner, LoadedKeyset } from '@etare/application';
import { API_BASE_PATH, endpoints, type EtareRevision, type KeysetDocument } from '@etare/contracts';
import { SIGNATURE_CONTEXTS, signedText } from '@etare/domain';
import { HandlerRegistry, createWorker, publicationBuildHandler, signatureRenewalHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, drain, requireEnv, signIn, withSecondFactor } from './helpers';
import { Terminal } from './terminal';

const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-keys',
});
const base = createApiDependencies(process.env);
const oldPublication = Ed25519Signer.fromPkcs8(requireEnv('PUBLICATION_SIGNING_KEY'));
const oldCatalog = Ed25519Signer.fromPkcs8(requireEnv('CATALOG_SIGNING_KEY'));
const root = Ed25519Signer.generate().signer;
const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
const silent = createLogger({}, { write: () => undefined });

// The Transit engine of the local stack or of the CI (OpenBao in development mode), never a remote one.
const transitUrl = process.env['SIGNING_TRANSIT_TEST_URL'];
const transitToken = process.env['SIGNING_TRANSIT_TEST_TOKEN'];
if (transitUrl && !['127.0.0.1', 'localhost'].includes(new URL(transitUrl).hostname)) {
  throw new Error('SIGNING_TRANSIT_TEST_URL must point to a local OpenBao.');
}
const transit = transitUrl && transitToken ? { url: transitUrl, token: transitToken } : null;
const mount = `etare-it-${Date.now()}`;

async function bao(path: string, body?: unknown): Promise<unknown> {
  if (!transit) throw new Error('No Transit engine.');
  const response = await fetch(`${transit.url}/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-vault-token': transit.token, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`OpenBao ${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-keys'),
  registry: new HandlerRegistry([
    publicationBuildHandler({
      store: new PostgresPublicationBuildStore(workerPool),
      tools: {
        sha256,
        byteLength: (text) => Buffer.byteLength(text, 'utf8'),
        now: () => new Date(),
        signer: oldPublication,
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
  logger: silent,
  concurrency: 2,
  leaseSeconds: 30,
  pollIntervalMs: 100,
});

type Purpose = 'publication' | 'catalog';
type Status = 'active' | 'retired' | 'revoked';
const entry = (signer: IdentifiedSigner, purpose: Purpose, status: Status) => ({
  purpose,
  key_id: signer.keyId,
  public_key: signer.publicKey,
  status,
});

function keyset(sequence: number, keys: KeysetDocument['keys']): LoadedKeyset {
  return parseSignedKeyset(
    JSON.stringify(signKeyset({ keyset_version: 1, sequence, issued_at: new Date().toISOString(), keys }, root)),
  );
}

/** The API with a given key set and catalogue key, as after a deployment of the rotation. */
function apiWith(loaded: LoadedKeyset | null, catalogSigner: ContentSigner) {
  const deps: ApiDependencies = { ...base, keyset: async () => loaded, catalogSigner };
  return createApiApp(deps);
}

let adminFactor: { token: string; factorId: string } | undefined;
let validatorFactor: { token: string; factorId: string } | undefined;
let admin06: (method: string, path: string, body?: unknown) => Response | Promise<Response>;
let device: Terminal;
let publicationId = '';
let newPublication: IdentifiedSigner;
let newCatalog: IdentifiedSigner;
let tokenFile = '';

beforeAll(async () => {
  const [editorToken, validatorToken, adminToken, opsToken] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn('ops06@demo.etare.test'),
  ]);
  adminFactor = await withSecondFactor(adminToken);
  validatorFactor = await withSecondFactor(validatorToken);
  const app = createApiApp(base);
  const as = (token: string) => (method: string, path: string, body?: unknown, ifMatch?: number) =>
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
  const editor06 = as(editorToken);
  const validator06 = as(validatorFactor.token);
  admin06 = as(adminFactor.token);

  // A site published for the test, signed at build time by the current ("old") publication key.
  const site = await editor06('POST', '/sites', {
    name: `Site clés ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    location: { type: 'Point', coordinates: [7.262, 43.704] },
  });
  expect(site.status).toBe(201);
  const siteId = ((await site.json()) as { id: string }).id;
  const draft = endpoints.createRevision.response.parse(
    await (await editor06('POST', `/sites/${siteId}/etare/revisions`, { change_summary: 'Clés' })).json(),
  );
  const submitted: EtareRevision = endpoints.submitRevision.response.parse(
    await (
      await editor06('POST', `/etare-revisions/${draft.id}/submit`, { change_summary: 'Clés' }, draft.row_version)
    ).json(),
  );
  const decided = await validator06('POST', `/etare-revisions/${draft.id}/decision`, {
    decision: 'approved',
    revision_hash: submitted.content_hash,
    publish: true,
  });
  expect(decided.status).toBe(200);
  await drain(worker);
  const overview = endpoints.getSiteEtare.response.parse(
    await (await editor06('GET', `/sites/${siteId}/etare`)).json(),
  );
  expect(overview.publications[0]?.status).toBe('published');
  publicationId = overview.publications[0]?.id ?? '';

  // An enrolled terminal of the SIS.
  const created = endpoints.createDevice.response.parse(
    await (await admin06('POST', '/devices', { name: `TABLETTE CLES ${Date.now()}` })).json(),
  );
  device = new Terminal(app, opsToken, TENANT_06);
  const enrolled = await as(opsToken)('POST', '/sync/enrollment', device.enrollment(created.enrollment_code));
  expect(enrolled.status).toBe(201);
  device.deviceId = endpoints.enrollDevice.response.parse(await enrolled.json()).device_id;

  // The new keys: in the Transit engine when there is one (the key never reaches the process).
  if (transit) {
    await bao(`sys/mounts/${mount}`, { type: 'transit' });
    await bao(`${mount}/keys/publication`, { type: 'ed25519' });
    await bao(`${mount}/keys/catalog`, { type: 'ed25519' });
    tokenFile = join(mkdtempSync(join(tmpdir(), 'etare-bao-')), 'token');
    writeFileSync(tokenFile, transit.token, { mode: 0o600 });
    const settings = (key: string) => ({ url: transit.url, mount, key, tokenFile });
    newPublication = await TransitSigner.connect(settings('publication'), 'publication', null);
    newCatalog = await TransitSigner.connect(settings('catalog'), 'catalog', null);
  } else {
    newPublication = Ed25519Signer.generate().signer;
    newCatalog = Ed25519Signer.generate().signer;
  }
});

afterAll(async () => {
  for (const factor of [adminFactor, validatorFactor]) {
    if (factor) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  }
  if (transit) await bao(`sys/mounts/${mount}`, undefined).catch(() => undefined);
  await workerPool.end();
});

describe('signing keys and their rotation (SEC-04)', () => {
  it('serves the key set signed by the root key to an enrolled terminal, 404 without one', async () => {
    const first = keyset(1, [entry(oldPublication, 'publication', 'active'), entry(oldCatalog, 'catalog', 'active')]);
    const response = await device.request('GET', '/sync/keyset', undefined, { app: apiWith(first, oldCatalog) });
    expect(response.status).toBe(200);
    const served = endpoints.getSyncKeyset.response.parse(await response.json());
    expect(served).toEqual(first.signed);
    expect(isKeysetSignedBy(served, parseRootKeys(`root:${root.keyId}:${root.publicKey}`))).toBe(true);
    const none = await device.request('GET', '/sync/keyset', undefined, { app: apiWith(null, oldCatalog) });
    expect(none.status).toBe(404);
  });

  it('re-signs the content in force with the new key, which the API then serves', async () => {
    const rotated = keyset(2, [
      entry(oldPublication, 'publication', 'retired'),
      entry(newPublication, 'publication', 'active'),
      entry(oldCatalog, 'catalog', 'retired'),
      entry(newCatalog, 'catalog', 'active'),
    ]);
    const handler = signatureRenewalHandler({
      store: new PostgresSignatureRenewalStore(workerPool),
      signer: newPublication,
      keyset: rotated.keyset,
      verify: verifyEd25519,
      sha256: async (text) => sha256(text),
    });
    await handler.run(
      { key_id: newPublication.keyId, slot: '2026-10-28T10' },
      {
        job: { id: 'j', type: 'signatures.renew', tenantId: null, attempt: 1 } as never,
        logger: silent,
        signal: new AbortController().signal,
      },
    );

    const api = apiWith(rotated, newCatalog);
    const served = endpoints.getSyncPackage.response.parse(
      await (await device.request('GET', `/sync/publications/${publicationId}`, undefined, { app: api })).json(),
    );
    expect(served.signature.key_id).toBe(newPublication.keyId);
    expect(
      verifyEd25519(
        newPublication.publicKey,
        signedText(SIGNATURE_CONTEXTS.manifest, served.manifest),
        served.signature.signature,
      ),
    ).toBe(true);
    // The catalogue is signed by the new catalogue key (through the Transit engine when there is one).
    const catalog = endpoints.getSyncCatalog.response.parse(
      await (await device.request('GET', '/sync/catalog', undefined, { app: api })).json(),
    );
    expect(catalog.signature.key_id).toBe(newCatalog.keyId);
    expect(
      verifyEd25519(
        newCatalog.publicKey,
        signedText(SIGNATURE_CONTEXTS.catalog, catalog.catalog),
        catalog.signature.signature,
      ),
    ).toBe(true);
    // A second run has nothing left to sign for this content.
    const again = await new PostgresSignatureRenewalStore(workerPool).candidates(newPublication.keyId, 500, []);
    expect(again.map((candidate) => candidate.contentId)).not.toContain(publicationId);
  });

  it('keeps serving the new signature once the old key is revoked, and nothing when no trusted key signed', async () => {
    const revoked = keyset(3, [
      entry(oldPublication, 'publication', 'revoked'),
      entry(newPublication, 'publication', 'active'),
      entry(newCatalog, 'catalog', 'active'),
    ]);
    const served = endpoints.getSyncPackage.response.parse(
      await (
        await device.request('GET', `/sync/publications/${publicationId}`, undefined, {
          app: apiWith(revoked, newCatalog),
        })
      ).json(),
    );
    expect(served.signature.key_id).toBe(newPublication.keyId);
    // A key the worker never used: no signature the terminals trust yet, the terminal asks again later.
    const unused = Ed25519Signer.generate().signer;
    const premature = keyset(4, [
      entry(oldPublication, 'publication', 'revoked'),
      entry(unused, 'publication', 'active'),
      entry(newCatalog, 'catalog', 'active'),
    ]);
    const refused = await device.request('GET', `/sync/publications/${publicationId}`, undefined, {
      app: apiWith(premature, newCatalog),
    });
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('SERVICE_UNAVAILABLE');

    // The terminal reports the key set it holds; the administration sees it beside the one served.
    const receipt = await device.request(
      'POST',
      '/sync/receipts',
      { generation: 0, status: 'installed', error_code: null, installed: [publicationId], keyset_sequence: 3 },
      { app: apiWith(revoked, newCatalog) },
    );
    expect(receipt.status).toBe(200);
    const list = endpoints.listDevices.response.parse(await (await admin06('GET', '/devices')).json());
    expect(list.items.find((item) => item.id === device.deviceId)?.keyset_sequence).toBe(3);
  });

  it.runIf(transit)('signs with a new version of a Transit key only once the key set announces it', async () => {
    const settings = { url: transit?.url ?? '', mount, key: 'catalog', tokenFile };
    await bao(`${mount}/keys/catalog/rotate`, {});
    const announced = keyset(5, [
      entry(newPublication, 'publication', 'active'),
      entry(newCatalog, 'catalog', 'active'),
    ]);
    const still = await TransitSigner.connect(settings, 'catalog', announced.keyset);
    expect(still.keyId).toBe(newCatalog.keyId);
    const latest = await TransitSigner.connect(settings, 'catalog', null);
    expect(latest.keyId).not.toBe(newCatalog.keyId);
    const next = keyset(6, [
      entry(newPublication, 'publication', 'active'),
      entry(newCatalog, 'catalog', 'retired'),
      entry(latest, 'catalog', 'active'),
    ]);
    const rotated = await TransitSigner.connect(settings, 'catalog', next.keyset);
    expect(rotated.keyId).toBe(latest.keyId);
    const signature = await rotated.sign(SIGNATURE_CONTEXTS.catalog, '{"a":1}');
    expect(
      verifyEd25519(latest.publicKey, signedText(SIGNATURE_CONTEXTS.catalog, '{"a":1}'), signature.signature),
    ).toBe(true);
  });
});
