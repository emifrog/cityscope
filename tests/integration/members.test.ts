/**
 * Sprint 1 — administration of the members of a SIS through the real stack:
 * second factor (TOTP) required, invitation e-mail, account activation,
 * role changes with optimistic concurrency, suspension, anti-escalation.
 */
import { randomUUID } from 'node:crypto';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, latestEmailTo, requireEnv, signIn, signInWithPassword, withSecondFactor } from './helpers';

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

const errorCode = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

let adminAal1: Call;
let admin: Call;
let editor: Call;
let adminFactor: { token: string; factorId: string };

beforeAll(async () => {
  const [adminToken, editorToken] = await Promise.all([
    signIn('admin.sis06@demo.etare.test'),
    signIn('redacteur06@demo.etare.test'),
  ]);
  adminAal1 = as(adminToken);
  editor = as(editorToken);
  adminFactor = await withSecondFactor(adminToken);
  admin = as(adminFactor.token);
});

afterAll(async () => {
  // Leave the demo account as seeded: without a second factor.
  if (adminFactor) await authApi(`/factors/${adminFactor.factorId}`, { method: 'DELETE', token: adminFactor.token });
});

describe('member administration', () => {
  it('requires the second factor from administrators and refuses everybody else', async () => {
    const withoutSecondFactor = await adminAal1('GET', '/members');
    expect(withoutSecondFactor.status).toBe(403);
    expect(await errorCode(withoutSecondFactor)).toBe('MFA_REQUIRED');

    const notAdmin = await editor('GET', '/members');
    expect(notAdmin.status).toBe(403);
    expect(await errorCode(notAdmin)).toBe('FORBIDDEN');
  });

  it('lists the members of the SIS with their roles', async () => {
    const response = await admin('GET', '/members');
    expect(response.status).toBe(200);
    const { items } = endpoints.listMembers.response.parse(await response.json());
    expect(items.find((member) => member.email === 'redacteur06@demo.etare.test')?.roles).toEqual(['PREVISION_EDITOR']);
    expect(items.find((member) => member.email === 'admin.sis06@demo.etare.test')?.is_self).toBe(true);
    expect(items.find((member) => member.email === 'exploitant.oliviers@demo.etare.test')?.site_roles).toEqual([
      { role: 'EXPLOITANT', site_id: '06000002-0000-4000-8000-000000000001', site_name: 'EHPAD Les Oliviers' },
    ]);
    expect(items.some((member) => member.email === 'redacteur83@demo.etare.test')).toBe(false);
  });

  it('invites a person who activates the account, then manages their roles and status', async () => {
    const email = `invite.${randomUUID().slice(0, 8)}@demo.etare.test`;
    const invited = await admin('POST', '/members', { email, display_name: 'Agent invité', roles: ['READER'] });
    expect(invited.status).toBe(201);
    const { member, invitation } = endpoints.inviteMember.response.parse(await invited.json());
    expect(invitation).toBe('sent');
    expect(member).toMatchObject({ email, roles: ['READER'], status: 'active', row_version: 1 });

    // The e-mail opens the web application, which verifies the token only when the person clicks.
    const mail = await latestEmailTo(email);
    expect(mail.subject).toBe('Invitation à FireScape');
    const link = /href="([^"]+\/auth\/confirm\?token_hash=[^"]+)"/.exec(mail.html)?.[1]?.replaceAll('&amp;', '&');
    expect(link).toBeDefined();
    const tokenHash = new URL(link ?? 'http://invalid').searchParams.get('token_hash');
    const session = await authApi<{ access_token: string }>('/verify', {
      method: 'POST',
      body: { type: 'invite', token_hash: tokenHash },
    });
    const password = `Agent-${randomUUID().slice(0, 8)}-2026!`;
    await authApi('/user', { method: 'PUT', token: session.access_token, body: { password } });
    const invitee = as(await signInWithPassword(email, password));
    expect((await invitee('GET', '/sites')).status).toBe(200);

    // Roles: optimistic concurrency, and the change applies to the next request.
    const changed = await admin('PATCH', `/members/${member.id}`, { roles: ['PREVISION_EDITOR'] }, 1);
    expect(changed.status).toBe(200);
    expect(endpoints.updateMember.response.parse(await changed.json())).toMatchObject({
      roles: ['PREVISION_EDITOR'],
      row_version: 2,
    });
    expect((await admin('PATCH', `/members/${member.id}`, { roles: ['READER'] }, 1)).status).toBe(412);
    expect((await admin('PATCH', `/members/${member.id}`, { roles: ['READER'] })).status).toBe(428);

    // Suspension takes effect immediately, reactivation too.
    expect((await admin('PATCH', `/members/${member.id}`, { status: 'suspended' }, 2)).status).toBe(200);
    expect((await invitee('GET', '/sites')).status).toBe(403);
    expect((await admin('PATCH', `/members/${member.id}`, { status: 'active' }, 3)).status).toBe(200);
    expect((await invitee('GET', '/sites')).status).toBe(200);

    // The same person cannot be added twice.
    const again = await admin('POST', '/members', { email, roles: ['READER'] });
    expect(again.status).toBe(409);
  });

  it('refuses self-escalation and roles that cannot be granted to a whole SIS', async () => {
    const { items } = endpoints.listMembers.response.parse(await (await admin('GET', '/members')).json());
    const self = items.find((member) => member.is_self);
    const selfChange = await admin('PATCH', `/members/${self?.id}`, { roles: ['SIS_ADMIN', 'PREVISION_VALIDATOR'] }, 1);
    expect(selfChange.status).toBe(403);

    for (const role of ['SUPER_ADMIN', 'EXPLOITANT']) {
      const response = await admin('POST', '/members', { email: `x.${randomUUID()}@demo.etare.test`, roles: [role] });
      expect(response.status).toBe(400);
    }
  });
});

// Guards the local-only assumptions of this file (demo accounts, local mail catcher).
requireEnv('SUPABASE_URL');
