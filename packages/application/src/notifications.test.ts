import { describe, expect, it, vi } from 'vitest';
import { PermanentJobError } from './jobs';
import {
  renderNotification,
  sendNotification,
  type Mailer,
  type NotificationStore,
  type NotificationToSend,
} from './notifications';

const TENANT = '06000000-0000-4000-8000-000000000000';
const SITE = '06000002-0000-4000-8000-000000000001';

const pendingInvitation = {
  status: 'pending',
  expiresAt: new Date('2026-10-08T10:00:00Z'),
  accessUntil: new Date('2027-09-30T21:59:59.999Z'),
  sites: ['EHPAD Les Oliviers', 'Entrepôt'],
};

const invitation: NotificationToSend = {
  id: 'n1',
  kind: 'portal_invitation',
  status: 'pending',
  recipientEmail: 'direction@ehpad.test',
  recipientName: 'Direction <EHPAD>',
  tenantName: 'SDIS DEMO 06',
  invitation: pendingInvitation,
  contribution: null,
};

const decision: NotificationToSend = {
  ...invitation,
  id: 'n2',
  kind: 'contribution_decision',
  invitation: null,
  contribution: { title: 'Nouveau numéro', status: 'partially_accepted', siteId: SITE, siteName: 'EHPAD Les Oliviers' },
};

function setup(notification: NotificationToSend | null, mailer: Mailer | null) {
  const store = {
    get: vi.fn<NotificationStore['get']>(async () => notification),
    record: vi.fn<NotificationStore['record']>(async () => true),
  };
  return { store, deps: { store, mailer, appBaseUrl: 'https://firescape.test/' } };
}

describe('notification e-mails', () => {
  it('tell an invitation with its sites and dates, and a link to the portal only', () => {
    const mail = renderNotification(invitation, 'https://firescape.test/');
    expect(mail.to).toBe('direction@ehpad.test');
    expect(mail.subject).toBe('Invitation au portail exploitant — SDIS DEMO 06');
    expect(mail.text).toContain('EHPAD Les Oliviers, Entrepôt');
    expect(mail.text).toContain('8 octobre 2026');
    expect(mail.text).toContain('30 septembre 2027');
    expect(mail.text).toContain('https://firescape.test/portail');
    expect(mail.html).toContain('Direction &#60;EHPAD&#62;');
    expect(mail.html).not.toContain('<EHPAD>');
  });

  it('alert a person whose second factor was removed, without any secret', () => {
    const recovered = renderNotification(
      { ...invitation, id: 'n3', kind: 'second_factor_recovered', invitation: null },
      'https://firescape.test',
    );
    expect(recovered.subject).toBe('Double authentification retirée — FireScape');
    expect(recovered.text).toContain('Un code de secours vient d’être utilisé');
    expect(recovered.text).toContain('prévenez sans attendre l’administration de SDIS DEMO 06');
    expect(recovered.text).toContain('https://firescape.test/compte');
    expect(recovered.html).toContain('Ouvrir mon compte');

    const reset = renderNotification(
      { ...invitation, id: 'n4', kind: 'second_factor_reset', invitation: null },
      'https://firescape.test',
    );
    expect(reset.text).toContain('L’administration de SDIS DEMO 06 a réinitialisé votre double authentification');
  });

  it('tell a decision without its motive, which stays behind sign-in', () => {
    const mail = renderNotification(decision, 'https://firescape.test');
    expect(mail.subject).toBe('Réponse à votre proposition — EHPAD Les Oliviers');
    expect(mail.text).toContain('a accepté en partie votre proposition « Nouveau numéro »');
    expect(mail.text).toContain(`https://firescape.test/portail/sites/${SITE}`);
  });
});

describe('sending a notification', () => {
  it('sends a pending notification once and records it', async () => {
    const mailer = { send: vi.fn<Mailer['send']>(async () => undefined) };
    const { deps, store } = setup(decision, mailer);
    await expect(sendNotification(deps, 'n2', TENANT)).resolves.toBe('sent');
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(store.record).toHaveBeenCalledWith('n2', TENANT, null);

    const sent = setup({ ...decision, status: 'sent' }, mailer);
    await expect(sendNotification(sent.deps, 'n2', TENANT)).resolves.toBe('skipped');
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });

  it('records a failure of the mail server and lets the queue retry', async () => {
    const mailer = { send: vi.fn<Mailer['send']>(async () => Promise.reject(new Error('421 indisponible'))) };
    const { deps, store } = setup(decision, mailer);
    await expect(sendNotification(deps, 'n2', TENANT)).rejects.toThrow('421 indisponible');
    expect(store.record).toHaveBeenCalledWith('n2', TENANT, 'SMTP: 421 indisponible');
  });

  it('fails visibly without mail server, or for an invitation no longer pending', async () => {
    const { deps, store } = setup(decision, null);
    await expect(sendNotification(deps, 'n2', TENANT)).rejects.toBeInstanceOf(PermanentJobError);
    expect(store.record).toHaveBeenCalledWith('n2', TENANT, 'SMTP_NOT_CONFIGURED');

    const mailer = { send: vi.fn<Mailer['send']>(async () => undefined) };
    const closed = setup({ ...invitation, invitation: { ...pendingInvitation, status: 'revoked' } }, mailer);
    await expect(sendNotification(closed.deps, 'n1', TENANT)).rejects.toBeInstanceOf(PermanentJobError);
    expect(mailer.send).not.toHaveBeenCalled();
  });
});
