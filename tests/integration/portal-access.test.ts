/**
 * Sprint 7 — exploitant access through the real stack (POR-01, ADR-019): an
 * editor invites a new person on a site, the person activates the account
 * from the e-mail, accepts the invitation once, reaches the portal only with
 * the second factor the SIS requires by default, and loses it at revocation.
 */
import { randomUUID } from 'node:crypto';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EHPAD_ID,
  TENANT_06,
  TENANT_83,
  authApi,
  latestEmailTo,
  signIn,
  signInWithPassword,
  withSecondFactor,
} from './helpers';

const app = createApiApp(createApiDependencies(process.env));

type Call = (method: string, path: string, body?: unknown, ifMatch?: number) => Promise<Response>;
const as =
  (token: string, tenant: string | null): Call =>
  async (method, path, body, ifMatch) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(tenant ? { 'x-tenant-id': tenant } : {}),
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

let editorAal1: Call;
let editor: Call;
let admin: Call;
let editor83: Call;
const email = `exploitant.${randomUUID().slice(0, 8)}@demo.etare.test`;
let invitationId = '';
let password = '';
let exploitantStrong = '';

beforeAll(async () => {
  const [editorToken, adminToken, editor83Token] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editorAal1 = as(editorToken, TENANT_06);
  editor = as(await strong(editorToken), TENANT_06);
  admin = as(await strong(adminToken), TENANT_06);
  editor83 = as(await strong(editor83Token), TENANT_83);
});

afterAll(async () => {
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
});

describe('exploitant access', () => {
  it('lets a Prévision editor with a second factor invite a new person on a site', async () => {
    expect(await codeOf(await editorAal1('POST', '/portal-invitations', { email, site_ids: [EHPAD_ID] }))).toBe(
      'MFA_REQUIRED',
    );
    const response = await editor('POST', '/portal-invitations', {
      email,
      display_name: 'Direction de l’établissement',
      organization: 'EHPAD Les Oliviers',
      site_ids: [EHPAD_ID],
      valid_days: 7,
      access_until: '2027-09-30',
    });
    expect(response.status).toBe(201);
    const created = endpoints.createPortalInvitation.response.parse(await response.json());
    expect(created.notice).toBe('sent');
    expect(created.invitation).toMatchObject({
      email,
      state: 'pending',
      sites: [{ id: EHPAD_ID, name: 'EHPAD Les Oliviers' }],
      access_until: '2027-09-30T21:59:59.999Z',
    });
    invitationId = created.invitation.id;

    const list = endpoints.listPortalInvitations.response.parse(
      await (await editor('GET', '/portal-invitations')).json(),
    );
    expect(list.items.some((item) => item.id === invitationId)).toBe(true);
    // Another SIS never sees it.
    const other = endpoints.listPortalInvitations.response.parse(
      await (await editor83('GET', '/portal-invitations')).json(),
    );
    expect(other.items.some((item) => item.id === invitationId)).toBe(false);
  });

  it('lets the invitee activate the account, then accept the invitation once', async () => {
    const mail = await latestEmailTo(email);
    const link = /href="([^"]+\/auth\/confirm\?token_hash=[^"]+)"/.exec(mail.html)?.[1]?.replaceAll('&amp;', '&');
    const tokenHash = new URL(link ?? 'http://invalid').searchParams.get('token_hash');
    const session = await authApi<{ access_token: string }>('/verify', {
      method: 'POST',
      body: { type: 'invite', token_hash: tokenHash },
    });
    password = `Exploitant-${randomUUID().slice(0, 8)}-2026!`;
    await authApi('/user', { method: 'PUT', token: session.access_token, body: { password } });
    const invitee = as(await signInWithPassword(email, password), null);

    const mine = endpoints.listMyPortalInvitations.response.parse(
      await (await invitee('GET', '/me/portal-invitations')).json(),
    );
    expect(mine.items).toEqual([
      expect.objectContaining({
        id: invitationId,
        tenant_name: 'SDIS DEMO 06',
        sites: [{ id: EHPAD_ID, name: 'EHPAD Les Oliviers' }],
      }),
    ]);
    const accepted = await invitee('POST', `/me/portal-invitations/${invitationId}/acceptance`);
    expect(accepted.status).toBe(200);
    expect(endpoints.acceptPortalInvitation.response.parse(await accepted.json())).toEqual({ tenant_id: TENANT_06 });
    expect((await invitee('POST', `/me/portal-invitations/${invitationId}/acceptance`)).status).toBe(404);
  });

  it('opens the portal only with the second factor the SIS requires by default', async () => {
    const token = await signInWithPassword(email, password);
    const exploitant = as(token, TENANT_06);
    const state = async (call: Call) =>
      endpoints.getPortalAccess.response.parse(await (await call('GET', '/portal/access')).json()).state;
    expect(await state(exploitant)).toBe('mfa_required');

    // The SIS administration may turn the requirement off, then back on.
    expect(endpoints.getPortalSettings.response.parse(await (await admin('GET', '/settings/portal')).json())).toEqual({
      mfa_required: true,
    });
    expect((await editor('PUT', '/settings/portal', { mfa_required: false })).status).toBe(403);
    expect((await admin('PUT', '/settings/portal', { mfa_required: false })).status).toBe(200);
    expect(await state(exploitant)).toBe('granted');
    expect((await admin('PUT', '/settings/portal', { mfa_required: true })).status).toBe(200);
    expect(await state(exploitant)).toBe('mfa_required');

    exploitantStrong = await strong(token);
    expect(await state(as(exploitantStrong, TENANT_06))).toBe('granted');
    // Once enrolled, the exploitant always uses the code (ADR-022), whatever the portal setting.
    const withoutCode = await exploitant('GET', '/portal/access');
    expect(withoutCode.status).toBe(403);
    expect(((await withoutCode.json()) as { error: { code: string } }).error.code).toBe('MFA_REQUIRED');
    // No working data of the site, ever, even with the code.
    expect((await as(exploitantStrong, TENANT_06)('GET', `/sites/${EHPAD_ID}`)).status).toBe(403);
  });

  it('ends the access at once when the invitation is revoked', async () => {
    const current = endpoints.listPortalInvitations.response
      .parse(await (await editor('GET', '/portal-invitations')).json())
      .items.find((item) => item.id === invitationId);
    expect(current?.state).toBe('accepted');
    const revoked = await editor(
      'POST',
      `/portal-invitations/${invitationId}/revocation`,
      { reason: 'Changement de direction' },
      current?.row_version,
    );
    expect(revoked.status).toBe(200);
    expect(endpoints.revokePortalInvitation.response.parse(await revoked.json())).toMatchObject({
      state: 'revoked',
      revocation_reason: 'Changement de direction',
    });
    const exploitant = as(exploitantStrong, TENANT_06);
    expect(endpoints.getPortalAccess.response.parse(await (await exploitant('GET', '/portal/access')).json())).toEqual({
      state: 'none',
    });
  });
});
