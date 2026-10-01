import { createHash, randomUUID } from 'node:crypto';
import {
  Ed25519Signer,
  IgnCartographyCatalog,
  IgnGeocoder,
  createLogger,
  ed25519Verifier,
  verifyEd25519,
  type AccessTokenVerifier,
} from '@etare/adapters';
import type { DeviceRepository, RequestSession, SessionFactory } from '@etare/application';
import { stubSession } from '@etare/application/testing';
import { API_BASE_PATH, type SignedCatalog } from '@etare/contracts';
import { deviceRequestText, permissionsForRoles, signedText, type RequestContext } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { createApiApp } from './app';

const TENANT = '06000000-0000-4000-8000-000000000000';
const DEVICE = '06000010-0000-4000-8000-000000000001';
const USER = '00000000-0000-4000-b000-000000000004';
const sha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function makeApp() {
  const { signer: terminalKey } = Ed25519Signer.generate();
  const { signer: catalogKey } = Ed25519Signer.generate();
  const devices = {
    syncDevice: vi.fn<DeviceRepository['syncDevice']>(async () => ({
      status: 'active',
      publicKey: terminalKey.publicKey,
    })),
    catalog: vi.fn<DeviceRepository['catalog']>(async () => ({ generation: 3, tenantName: 'SDIS', publications: [] })),
    receipt: vi.fn<DeviceRepository['receipt']>(async (_device, receipt) => receipt.installed.length),
  };
  const sessions: SessionFactory = {
    run: async <T>(context: RequestContext, work: (session: RequestSession) => Promise<T>) =>
      work(
        stubSession(
          { userId: USER, tenantId: context.tenantId, permissions: permissionsForRoles(['OPS_USER']) },
          { devices },
        ),
      ),
  };
  const tokens: AccessTokenVerifier = {
    verify: async () => ({ provider: 'supabase', subject: 'ops', email: null, assurance: 'aal1' }),
  };
  const app = createApiApp({
    sessions,
    tokens,
    health: { database: async () => 'ok' },
    storage: null,
    identities: null,
    cartography: new IgnCartographyCatalog(),
    geocoder: new IgnGeocoder(async () => new Response('{"features":[]}')),
    sha256: async (text) => sha256Hex(text),
    catalogSigner: catalogKey,
    verifier: ed25519Verifier,
    randomBytes: (length) => new Uint8Array(length),
    now: () => new Date(),
    logger: createLogger({}, { write: () => undefined }),
    version: 'test',
    openApiDocument: () => ({}),
  });

  /** Sends a request the way the OPS application does: signed over method, path, time and body. */
  const send = async (
    method: string,
    path: string,
    body?: string,
    { sign = true, signedPath = path }: { sign?: boolean; signedPath?: string } = {},
  ) => {
    const timestamp = Date.now();
    const fullPath = `${API_BASE_PATH}${path}`;
    const text = deviceRequestText({
      method,
      path: `${API_BASE_PATH}${signedPath}`,
      timestamp,
      bodySha256: sha256Hex(body ?? ''),
    });
    const signature = terminalKey.sign('etare.device-request.v1', text.slice('etare.device-request.v1\n'.length));
    return app.request(fullPath, {
      method,
      headers: {
        authorization: 'Bearer token',
        'x-tenant-id': TENANT,
        'content-type': 'application/json',
        'x-app-version': '1.0.0',
        ...(sign
          ? { 'x-device-id': DEVICE, 'x-device-time': String(timestamp), 'x-device-signature': signature.signature }
          : {}),
      },
      ...(body === undefined ? {} : { body }),
    });
  };
  return { send, devices, catalogKey };
}

describe('requests of a terminal', () => {
  it('serve the catalogue to a request signed over its exact path', async () => {
    const { send, catalogKey, devices } = makeApp();
    const response = await send('GET', '/sync/catalog');
    expect(response.status).toBe(200);
    const signed = (await response.json()) as SignedCatalog;
    expect(
      verifyEd25519(catalogKey.publicKey, signedText('etare.catalog.v1', signed.catalog), signed.signature.signature),
    ).toBe(true);
    expect(JSON.parse(signed.catalog)).toMatchObject({ device_id: DEVICE, generation: 3, tenant_id: TENANT });
    expect(devices.catalog).toHaveBeenCalledWith(DEVICE, '1.0.0');
  });

  it('refuse an unsigned request and a signature made for another path', async () => {
    const { send } = makeApp();
    const unsigned = await send('GET', '/sync/catalog', undefined, { sign: false });
    expect(unsigned.status).toBe(401);
    expect(((await unsigned.json()) as { error: { code: string } }).error.code).toBe('DEVICE_PROOF_INVALID');
    expect((await send('GET', '/sync/catalog?generation=2')).status).toBe(200);
    const replayed = await send('GET', '/sync/catalog?generation=2', undefined, { signedPath: '/sync/catalog' });
    expect(replayed.status).toBe(401);
  });

  it('accept a large receipt whose body is covered by the signature', async () => {
    const { send, devices } = makeApp();
    // About 2 000 sites: far above the 64 KB limit of ordinary requests.
    const installed = Array.from({ length: 2_000 }, () => randomUUID());
    const body = JSON.stringify({ generation: 3, status: 'installed', error_code: null, installed });
    expect(body.length).toBeGreaterThan(64 * 1024);
    const response = await send('POST', '/sync/receipts', body);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ installed_sites: 2_000 });
    expect(devices.receipt).toHaveBeenCalledOnce();
  });
});
