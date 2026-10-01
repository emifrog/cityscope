/**
 * Sprint 7 — notifications of the exploitant portal through the real stack
 * (POR-05, ADR-020): an invitation to an existing account and a question of
 * the SIS are written with their event, sent by the worker to the local mail
 * catcher, minimal and in French; without mail server the notification fails
 * visibly, without blocking the workflow, and the administration sends it again.
 */
import { PostgresJobQueue, PostgresNotificationStore, SmtpMailer, createLogger, createPool } from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { HandlerRegistry, createWorker, notificationHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EHPAD_ID, TENANT_06, authApi, requireEnv, signIn, withSecondFactor, drain } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-notifications',
});
const MAILPIT = 'http://127.0.0.1:54324';
const EXPLOITANT = 'exploitant.oliviers@demo.etare.test';
const WAREHOUSE = '06000002-0000-4000-8000-000000000002';

const workerWith = (mailer: SmtpMailer | null) =>
  createWorker({
    queue: new PostgresJobQueue(workerPool, 'integration-notifications'),
    registry: new HandlerRegistry([
      notificationHandler({
        store: new PostgresNotificationStore(workerPool),
        mailer,
        appBaseUrl: 'http://localhost:3000',
      }),
    ]),
    logger: createLogger({}, { write: () => undefined }),
    concurrency: 4,
    leaseSeconds: 30,
    pollIntervalMs: 100,
  });
const sending = workerWith(new SmtpMailer('smtp://127.0.0.1:54325', 'FireScape <ne-pas-repondre@firescape.invalid>'));
const withoutMail = workerWith(null);

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

const factors: { token: string; factorId: string }[] = [];
const strong = async (token: string) => {
  const factor = await withSecondFactor(token);
  factors.push(factor);
  return factor.token;
};

/** E-mail received by the local mail catcher for this address and subject (waits a little for delivery). */
async function emailWith(subject: string): Promise<{ Text: string; HTML: string; To: { Address: string }[] }> {
  const query = encodeURIComponent(`to:"${EXPLOITANT}" subject:"${subject}"`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const found = (await (await fetch(`${MAILPIT}/api/v1/search?query=${query}`)).json()) as {
      messages?: { ID: string }[];
    };
    const id = found.messages?.[0]?.ID;
    if (id) return (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as never;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No e-mail "${subject}" for ${EXPLOITANT}.`);
}

let editor: Call;
let admin: Call;
let exploitant: Call;
let invitationId = '';

const notifications = async () =>
  endpoints.listNotifications.response.parse(await (await admin('GET', '/notifications')).json()).items;

beforeAll(async () => {
  const [editorToken, adminToken, exploitantToken] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('admin.sis06@demo.etare.test'),
    signIn(EXPLOITANT),
  ]);
  editor = as(await strong(editorToken), TENANT_06);
  admin = as(await strong(adminToken), TENANT_06);
  exploitant = as(await strong(exploitantToken), TENANT_06);
  // Mail of previous runs out of the way.
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${EXPLOITANT}"`)}`, { method: 'DELETE' });
});

afterAll(async () => {
  if (invitationId) {
    const current = endpoints.listPortalInvitations.response
      .parse(await (await editor('GET', '/portal-invitations')).json())
      .items.find((item) => item.id === invitationId);
    await editor(
      'POST',
      `/portal-invitations/${invitationId}/revocation`,
      { reason: 'Fin du test' },
      current?.row_version,
    );
  }
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  await workerPool.end();
});

describe('notifications of the exploitant portal', () => {
  it('tells an existing account it is invited, by a minimal e-mail', async () => {
    const created = endpoints.createPortalInvitation.response.parse(
      await (await editor('POST', '/portal-invitations', { email: EXPLOITANT, site_ids: [WAREHOUSE] })).json(),
    );
    invitationId = created.invitation.id;
    expect(created.notice).toBe('existing_account');
    const queued = (await notifications()).find(
      (item) => item.kind === 'portal_invitation' && item.status === 'pending',
    );
    expect(queued?.recipient.email).toBe(EXPLOITANT);

    await drain(sending);
    const mail = await emailWith('Invitation au portail exploitant');
    expect(mail.Text).toContain('SDIS DEMO 06 vous invite');
    expect(mail.Text).toContain('http://localhost:3000/portail');
    expect((await notifications()).find((item) => item.id === queued?.id)).toMatchObject({
      status: 'sent',
      attempts: 1,
    });
    // Only the administration of the SIS sees them.
    expect((await editor('GET', '/notifications')).status).toBe(403);
  });

  it('never blocks the workflow when the mail fails, and sends again on demand', async () => {
    const proposal = endpoints.createPortalContribution.response.parse(
      await (
        await exploitant('POST', `/portal/sites/${EHPAD_ID}/contributions`, {
          target_type: 'other',
          operation: 'create',
          title: 'Travaux en façade',
          description: 'Échafaudage côté rue du 6 au 24 octobre.',
          files: [],
        })
      ).json(),
    ).contribution;
    const detail = endpoints.getContribution.response.parse(
      await (await editor('GET', `/contributions/${proposal.id}`)).json(),
    );
    const asked = await editor(
      'PATCH',
      `/contributions/${proposal.id}`,
      { status: 'info_requested', message: 'L’accès pompiers reste-t-il libre ?' },
      detail.row_version,
    );
    expect(asked.status).toBe(200);

    // No mail server: the question is recorded all the same, the notification fails visibly.
    await drain(withoutMail);
    const failed = (await notifications()).find(
      (item) => item.kind === 'contribution_info_request' && item.about.startsWith('Travaux en façade'),
    );
    expect(failed).toMatchObject({ status: 'failed', last_error: 'SMTP_NOT_CONFIGURED' });
    const mine = endpoints.getPortalContribution.response.parse(
      await (await exploitant('GET', `/portal/contributions/${proposal.id}`)).json(),
    );
    expect(mine.status).toBe('info_requested');

    const retried = endpoints.retryNotification.response.parse(
      await (await admin('POST', `/notifications/${failed?.id}/retry`)).json(),
    );
    expect(retried.status).toBe('pending');
    expect((await admin('POST', `/notifications/${failed?.id}/retry`)).status).toBe(409);
    await drain(sending);
    const mail = await emailWith('Précision demandée sur votre proposition');
    expect(mail.Text).toContain('« Travaux en façade »');
    // Never the content of the exchange.
    expect(mail.Text).not.toContain('accès pompiers');
    expect((await notifications()).find((item) => item.id === failed?.id)?.status).toBe('sent');

    await exploitant('POST', `/portal/contributions/${proposal.id}/withdrawal`);
  });
});
