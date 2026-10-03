/**
 * Sprint 9 — SEC-02 recovery through the real stack: recovery codes replace a
 * lost second factor once (factor removed, other sessions closed, a new factor
 * required), the SIS administration resets the second factor of a member (never
 * of a member of another SIS), and a forgotten password is reset by e-mail.
 */
import { randomUUID } from 'node:crypto';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, latestEmailTo, signIn, signInWithPassword, withSecondFactor } from './helpers';

const app = createApiApp(createApiDependencies(process.env));

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

/** Link of the last e-mail of a kind (invitation or password reset) sent to the address, once arrived. */
async function tokenHashOf(address: string, type: 'invite' | 'recovery'): Promise<string> {
  const pattern = new RegExp(`href="([^"]+/auth/confirm\\?token_hash=[^"]+(?:&amp;|&)type=${type})"`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const link = pattern.exec((await latestEmailTo(address)).html)?.[1];
    const tokenHash = link ? new URL(link.replaceAll('&amp;', '&')).searchParams.get('token_hash') : null;
    if (tokenHash) return tokenHash;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No ${type} link for ${address}.`);
}

let admin: Call;
let email = '';
let password = '';
let membershipId = '';
/** Token of the member with the second factor enrolled after the recovery (first test). */
let memberToken = '';

beforeAll(async () => {
  admin = as(await strong(await signIn('admin.sis06@demo.etare.test')));
  // A fresh account: invited, activated, with a password of its own.
  email = `recovery.${randomUUID().slice(0, 8)}@demo.etare.test`;
  const invited = endpoints.inviteMember.response.parse(
    await (await admin('POST', '/members', { email, display_name: 'Agent secours', roles: ['READER'] })).json(),
  );
  membershipId = invited.member.id;
  const session = await authApi<{ access_token: string }>('/verify', {
    method: 'POST',
    body: { type: 'invite', token_hash: await tokenHashOf(email, 'invite') },
  });
  password = `Secours-${randomUUID().slice(0, 8)}-2026!`;
  await authApi('/user', { method: 'PUT', token: session.access_token, body: { password } });
});

afterAll(async () => {
  for (const factor of factors) {
    await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token }).catch(() => undefined);
  }
});

describe('recovery codes', () => {
  it('replace a lost second factor once, then require a new one', async () => {
    const coded = as(await strong(await signInWithPassword(email, password)));
    expect(
      endpoints.getMyRecoveryCodes.response.parse(await (await coded('GET', '/me/recovery-codes')).json()),
    ).toEqual({ remaining: 0, generated_at: null });
    const generated = await coded('POST', '/me/recovery-codes');
    expect(generated.status).toBe(201);
    const { codes } = endpoints.regenerateMyRecoveryCodes.response.parse(await generated.json());
    expect(new Set(codes).size).toBe(10);
    expect(
      endpoints.getMyRecoveryCodes.response.parse(await (await coded('GET', '/me/recovery-codes')).json()).remaining,
    ).toBe(10);

    // Telephone lost: a new sign-in has the password only.
    const withoutCode = as(await signInWithPassword(email, password));
    expect(await errorOf(await withoutCode('GET', '/sites'))).toMatchObject({ code: 'MFA_REQUIRED' });
    expect((await withoutCode('POST', '/me/recovery-codes')).status).toBe(403);
    const wrong = await withoutCode('POST', '/me/second-factor/recovery', { code: 'AAAAA-AAAAA' });
    expect(await errorOf(wrong)).toMatchObject({ code: 'VALIDATION_FAILED' });
    const recovered = await withoutCode('POST', '/me/second-factor/recovery', { code: codes[3]?.toLowerCase() });
    expect(recovered.status).toBe(200);
    expect(endpoints.recoverSecondFactor.response.parse(await recovered.json())).toEqual({
      reenrollment_required: true,
    });
    expect(await errorOf(await withoutCode('POST', '/me/second-factor/recovery', { code: codes[3] }))).toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    // The other sessions are closed; a new factor is required before any access.
    expect((await coded('GET', '/me')).status).toBe(401);
    const removed = await errorOf(await withoutCode('GET', '/sites'));
    expect(removed.code).toBe('MFA_REQUIRED');
    expect(removed.message).toContain('retirée');
    const me = endpoints.getMe.response.parse(await (await withoutCode('GET', '/me')).json());
    expect(me.user).toMatchObject({ second_factor: false, second_factor_reenrollment: true });

    // The person was alerted (outbox of the SIS); a new factor gives access back.
    const notifications = endpoints.listNotifications.response.parse(
      await (await admin('GET', '/notifications')).json(),
    );
    expect(
      notifications.items.some((item) => item.kind === 'second_factor_recovered' && item.recipient.email === email),
    ).toBe(true);
    memberToken = await strong(await signInWithPassword(email, password));
    const renewed = as(memberToken);
    expect((await renewed('GET', '/sites')).status).toBe(200);
    expect(endpoints.getMe.response.parse(await (await renewed('GET', '/me')).json()).user).toMatchObject({
      second_factor: true,
      second_factor_reenrollment: false,
    });
  });
});

describe('reset by the SIS administration', () => {
  it('removes the second factor and the sessions of a member, who must enroll a new one', async () => {
    const member = as(memberToken);
    const before = endpoints.listMembers.response
      .parse(await (await admin('GET', '/members')).json())
      .items.find((item) => item.id === membershipId);
    expect(before?.second_factor).toBe(true);
    const reset = await admin('POST', `/members/${membershipId}/second-factor-reset`, undefined, before?.row_version);
    expect(reset.status).toBe(200);
    expect(endpoints.resetMemberSecondFactor.response.parse(await reset.json())).toMatchObject({
      second_factor: false,
    });

    expect((await member('GET', '/me')).status).toBe(401);
    const again = as(await signInWithPassword(email, password));
    expect((await errorOf(await again('GET', '/sites'))).message).toContain('retirée');
  });

  it('never resets the second factor of a member of another SIS', async () => {
    await strong(await signIn('multi.sis@demo.etare.test'));
    const multi = endpoints.listMembers.response
      .parse(await (await admin('GET', '/members')).json())
      .items.find((item) => item.email === 'multi.sis@demo.etare.test');
    const refused = await admin('POST', `/members/${multi?.id}/second-factor-reset`, undefined, multi?.row_version);
    expect(refused.status).toBe(409);
    expect((await errorOf(refused)).message).toContain('autre SIS');
  });
});

describe('forgotten password', () => {
  it('is reset through a single-use e-mail link (no second factor left after the reset above)', async () => {
    await authApi('/recover', { method: 'POST', body: { email } });
    const tokenHash = await tokenHashOf(email, 'recovery');
    expect((await latestEmailTo(email)).subject).toBe('Réinitialisation de votre mot de passe FireScape');
    const session = await authApi<{ access_token: string }>('/verify', {
      method: 'POST',
      body: { type: 'recovery', token_hash: tokenHash },
    });
    const renewed = `Nouveau-${randomUUID().slice(0, 8)}-2026!`;
    await authApi('/user', { method: 'PUT', token: session.access_token, body: { password: renewed } });
    await expect(signInWithPassword(email, password)).rejects.toThrow();
    await expect(signInWithPassword(email, renewed)).resolves.toBeTruthy();
  });
});
