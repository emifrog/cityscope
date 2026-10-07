/**
 * Sprint 13 — SEC-05 through the real stack (ADR-029): a tablet enrolls with a
 * key of the Android Keystore (ECDSA P-256); an older one moves to such a key by
 * a signed rotation, its former key refused at once; the policy set by the SIS
 * reaches the tablets in the signed catalogue.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints, syncCatalogSchema } from '@etare/contracts';
import { DEFAULT_TERMINAL_POLICY } from '@etare/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, signIn, withSecondFactor } from './helpers';
import { Terminal, TerminalKey } from './terminal';

const app = createApiApp(createApiDependencies(process.env));

type Call = (method: string, path: string, body?: unknown) => Promise<Response>;
const as =
  (token: string): Call =>
  async (method, path, body) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': TENANT_06,
        'x-client-platform': 'web',
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

let admin06: Call;
let adminWithoutFactor: Call;
let ops06: Call;
let opsToken = '';
let adminFactor: { token: string; factorId: string } | undefined;

/** A new tablet of the whole SIS, enrolled by the OPS agent with a key of the given algorithm. */
async function enrolledTablet(algorithm: 'ed25519' | 'ecdsa-p256'): Promise<Terminal> {
  const code = endpoints.createDevice.response.parse(
    await (await admin06('POST', '/devices', { name: `TABLETTE CLE ${algorithm} ${Date.now()}` })).json(),
  ).enrollment_code;
  const tablet = new Terminal(app, opsToken, TENANT_06, algorithm);
  const enrolled = await ops06('POST', '/sync/enrollment', tablet.enrollment(code));
  expect(enrolled.status).toBe(201);
  tablet.deviceId = endpoints.enrollDevice.response.parse(await enrolled.json()).device_id;
  return tablet;
}

const catalogOf = async (tablet: Terminal) => {
  const response = await tablet.request('GET', '/sync/catalog');
  expect(response.status).toBe(200);
  return syncCatalogSchema.parse(JSON.parse(endpoints.getSyncCatalog.response.parse(await response.json()).catalog));
};
const deviceOf = async (id: string) =>
  endpoints.listDevices.response
    .parse(await (await admin06('GET', '/devices')).json())
    .items.find((item) => item.id === id);

beforeAll(async () => {
  const [admin, ops] = await Promise.all([signIn('admin.sis06@demo.etare.test'), signIn('ops06@demo.etare.test')]);
  opsToken = ops;
  ops06 = as(ops);
  adminWithoutFactor = as(admin);
  adminFactor = await withSecondFactor(admin);
  admin06 = as(adminFactor.token);
});

afterAll(async () => {
  // The other files expect the defaults (7-day authorization).
  await admin06('PUT', '/settings/terminals', DEFAULT_TERMINAL_POLICY);
  if (adminFactor) await authApi(`/factors/${adminFactor.factorId}`, { method: 'DELETE', token: adminFactor.token });
});

describe('terminal keys (SEC-05)', () => {
  it('enrolls a tablet with a key of the Android Keystore, which then proves its requests', async () => {
    const tablet = await enrolledTablet('ecdsa-p256');
    await catalogOf(tablet);
    expect(await deviceOf(tablet.deviceId)).toMatchObject({ key_algorithm: 'ecdsa-p256', key_rotated_at: null });
  });

  it('moves a tablet of the first generation to a Keystore key; its former key is refused at once', async () => {
    const tablet = await enrolledTablet('ed25519');
    const former = tablet.copy();
    // The new key must sign the rotation itself.
    const forged = await tablet.rotate('ecdsa-p256', new TerminalKey('ecdsa-p256'));
    expect(forged.status).toBe(401);
    expect(await codeOf(forged)).toBe('DEVICE_PROOF_INVALID');
    const rotated = await tablet.rotate('ecdsa-p256');
    expect(rotated.status).toBe(200);
    expect(endpoints.rotateDeviceKey.response.parse(await rotated.json()).key_algorithm).toBe('ecdsa-p256');
    await catalogOf(tablet);
    const refused = await former.request('GET', '/sync/catalog');
    expect(refused.status).toBe(401);
    expect(await codeOf(refused)).toBe('DEVICE_PROOF_INVALID');
    const listed = await deviceOf(tablet.deviceId);
    expect(listed?.key_algorithm).toBe('ecdsa-p256');
    expect(listed?.key_rotated_at).not.toBeNull();
  });

  it('never lets another terminal rotate in the name of a tablet', async () => {
    const tablet = await enrolledTablet('ed25519');
    const stranger = new Terminal(app, opsToken, TENANT_06);
    stranger.deviceId = tablet.deviceId;
    const response = await stranger.rotate('ecdsa-p256');
    expect(response.status).toBe(401);
    expect(await codeOf(response)).toBe('DEVICE_PROOF_INVALID');
  });
});

describe('policy of the tablets (SEC-05)', () => {
  it('is set by the administration with the second factor, and reaches the tablets in the signed catalogue', async () => {
    const tablet = await enrolledTablet('ecdsa-p256');
    const current = endpoints.getTerminalPolicy.response.parse(
      await (await admin06('GET', '/settings/terminals')).json(),
    );
    expect(current.idle_lock_minutes).toBeGreaterThan(0);
    const policy = {
      idle_lock_minutes: 3,
      background_lock_seconds: 15,
      screenshots_allowed: true,
      max_days_without_login: 10,
      offline_authorization_days: 2,
    };
    expect((await adminWithoutFactor('PUT', '/settings/terminals', policy)).status).toBe(403);
    expect((await ops06('PUT', '/settings/terminals', policy)).status).toBe(403);
    const saved = await admin06('PUT', '/settings/terminals', policy);
    expect(saved.status).toBe(200);
    expect(endpoints.updateTerminalPolicy.response.parse(await saved.json())).toEqual(policy);

    const before = Date.now();
    const catalog = await catalogOf(tablet);
    expect(catalog.terminal_policy).toEqual(policy);
    const expires = new Date(catalog.authorization.expires_at).getTime();
    expect(expires - before).toBeGreaterThan(2 * 86_400_000 - 60_000);
    expect(expires - before).toBeLessThan(2 * 86_400_000 + 60_000);
  });

  it('refuses a policy that would leave the tablets open', async () => {
    const response = await admin06('PUT', '/settings/terminals', { ...DEFAULT_TERMINAL_POLICY, idle_lock_minutes: 0 });
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe('VALIDATION_FAILED');
  });
});
