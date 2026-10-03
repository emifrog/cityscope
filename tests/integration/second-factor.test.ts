/**
 * Sprint 9 — SEC-02 through the real stack: the API refuses every request of an
 * enrolled account made without its code (profile excepted), an enrolled agent
 * keeps synchronising with the key of an enrolled terminal, the SIS can require
 * the second factor for every access, and sessions are closed at once (own
 * sessions, suspension of a member).
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, signIn, withSecondFactor } from './helpers';
import { Terminal } from './terminal';

const app = createApiApp(createApiDependencies(process.env));
const LECTEUR_MEMBERSHIP = '0600000a-0000-4000-8000-000000000006';

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
const errorOf = async (response: Response) =>
  ((await response.json()) as { error: { code: string; message: string } }).error;

const factors: { token: string; factorId: string }[] = [];
const strong = async (token: string) => {
  const factor = await withSecondFactor(token);
  factors.push(factor);
  return factor.token;
};

let admin: Call;

beforeAll(async () => {
  admin = as(await strong(await signIn('admin.sis06@demo.etare.test')));
});

afterAll(async () => {
  // Back to the default policy and an active lecteur06, whatever happened above.
  await admin('PUT', '/settings/security', { second_factor_policy: 'privileged' });
  const members = endpoints.listMembers.response.parse(await (await admin('GET', '/members')).json());
  const lecteur = members.items.find((member) => member.id === LECTEUR_MEMBERSHIP);
  if (lecteur && lecteur.status !== 'active') {
    await admin('PATCH', `/members/${LECTEUR_MEMBERSHIP}`, { status: 'active' }, lecteur.row_version);
  }
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
});

describe('second factor of enrolled accounts', () => {
  it('refuses every request made without the code, except reading one’s own profile', async () => {
    const password = await signIn('validateur06@demo.etare.test');
    const coded = as(await strong(password));
    const withoutCode = as(await signIn('validateur06@demo.etare.test'));

    const refused = await withoutCode('GET', '/sites');
    expect(refused.status).toBe(403);
    expect(await errorOf(refused)).toMatchObject({ code: 'MFA_REQUIRED' });

    const me = endpoints.getMe.response.parse(await (await withoutCode('GET', '/me')).json());
    expect(me.user.second_factor).toBe(true);
    expect((await coded('GET', '/sites')).status).toBe(200);
  });

  it('lets an enrolled agent enroll and synchronise a terminal with its key, nothing else', async () => {
    const opsPassword = await signIn('ops06@demo.etare.test');
    await strong(opsPassword);
    const opsToken = await signIn('ops06@demo.etare.test');
    expect(await errorOf(await as(opsToken)('GET', '/sites'))).toMatchObject({ code: 'MFA_REQUIRED' });

    const declared = endpoints.createDevice.response.parse(
      await (await admin('POST', '/devices', { name: `TABLETTE 2FA ${Date.now()}` })).json(),
    );
    const device = new Terminal(app, opsToken, TENANT_06);
    const enrolled = await as(opsToken)('POST', '/sync/enrollment', device.enrollment(declared.enrollment_code));
    expect(enrolled.status).toBe(201);
    device.deviceId = endpoints.enrollDevice.response.parse(await enrolled.json()).device_id;

    expect((await device.request('GET', '/sync/catalog')).status).toBe(200);
    // A forged signature is refused before anything is read.
    const forged = new Terminal(app, opsToken, TENANT_06);
    forged.deviceId = device.deviceId;
    expect(await errorOf(await forged.request('GET', '/sync/catalog'))).toMatchObject({ code: 'DEVICE_PROOF_INVALID' });
  });
});

describe('second-factor policy of the SIS', () => {
  it('requires the second factor of every member when the SIS asks for it', async () => {
    expect(
      endpoints.getSecuritySettings.response.parse(await (await admin('GET', '/settings/security')).json()),
    ).toEqual({ second_factor_policy: 'privileged' });
    const editor = as(await signIn('redacteur06@demo.etare.test'));
    expect(await errorOf(await editor('PUT', '/settings/security', { second_factor_policy: 'all' }))).toMatchObject({
      code: 'FORBIDDEN',
    });

    expect((await admin('PUT', '/settings/security', { second_factor_policy: 'all' })).status).toBe(200);
    const refused = await errorOf(await editor('GET', '/sites'));
    expect(refused.code).toBe('MFA_REQUIRED');
    expect(refused.message).toContain('exige');
    const me = endpoints.getMe.response.parse(await (await editor('GET', '/me')).json());
    expect(me.memberships.find((membership) => membership.tenant_id === TENANT_06)?.second_factor_required).toBe(true);

    expect((await admin('PUT', '/settings/security', { second_factor_policy: 'privileged' })).status).toBe(200);
    expect((await editor('GET', '/sites')).status).toBe(200);
  });

  it('shows administrators who has a second factor and who signed in', async () => {
    const members = endpoints.listMembers.response.parse(await (await admin('GET', '/members')).json()).items;
    const byEmail = (email: string) => members.find((member) => member.email === email);
    expect(byEmail('validateur06@demo.etare.test')?.second_factor).toBe(true);
    expect(byEmail('redacteur06@demo.etare.test')).toMatchObject({ second_factor: false });
    expect(byEmail('redacteur06@demo.etare.test')?.last_sign_in_at).not.toBeNull();
  });
});

describe('sessions', () => {
  it('closes one or all the other sessions of the account at once', async () => {
    const first = as(await signIn('lecteur06@demo.etare.test'));
    const second = as(await signIn('lecteur06@demo.etare.test'));
    const third = as(await signIn('lecteur06@demo.etare.test'));

    const seenByThird = endpoints.listMySessions.response.parse(await (await third('GET', '/me/sessions')).json());
    const thirdSession = seenByThird.items.find((session) => session.is_current);
    expect(thirdSession).toBeDefined();
    const one = await first('POST', `/me/sessions/${thirdSession?.id}/revocation`);
    expect(endpoints.revokeMySession.response.parse(await one.json())).toEqual({ revoked: 1 });
    expect(await errorOf(await third('GET', '/me'))).toMatchObject({ code: 'UNAUTHENTICATED' });

    const others = endpoints.revokeMyOtherSessions.response.parse(
      await (await first('POST', '/me/sessions/revocation')).json(),
    );
    expect(others.revoked).toBeGreaterThanOrEqual(1);
    expect((await second('GET', '/me')).status).toBe(401);
    expect((await first('GET', '/me')).status).toBe(200);
  });

  it('closes every session of a suspended member', async () => {
    const lecteur = as(await signIn('lecteur06@demo.etare.test'));
    expect((await lecteur('GET', '/me')).status).toBe(200);
    const members = endpoints.listMembers.response.parse(await (await admin('GET', '/members')).json()).items;
    const membership = members.find((member) => member.id === LECTEUR_MEMBERSHIP);
    const suspended = await admin(
      'PATCH',
      `/members/${LECTEUR_MEMBERSHIP}`,
      { status: 'suspended' },
      membership?.row_version,
    );
    expect(suspended.status).toBe(200);
    // Even the profile, which needs no SIS, is refused: the session itself is closed.
    expect(await errorOf(await lecteur('GET', '/me'))).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
