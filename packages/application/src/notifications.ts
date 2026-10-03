import type { NotificationKind, NotificationList, NotificationListQuery, Notification } from '@etare/contracts';
import type { RequestContext } from '@etare/domain';
import { PermanentJobError } from './jobs';
import type { SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

/**
 * Useful notifications of the exploitant portal (POR-05, ADR-020): an
 * invitation to an existing account, a question of the SIS, a decision. They
 * are written with their event (outbox) and sent by the worker; a failure
 * never blocks the workflow, is recorded and can be replayed. The e-mail
 * stays minimal: its link opens the portal, behind sign-in.
 */
export const NOTIFICATION_SEND_JOB = 'notification.send';
const PRODUCT = 'FireScape';

export interface NotificationToSend {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly status: 'pending' | 'sent' | 'failed';
  readonly recipientEmail: string;
  readonly recipientName: string | null;
  readonly tenantName: string;
  readonly invitation: {
    readonly status: string;
    readonly expiresAt: Date;
    readonly accessUntil: Date | null;
    readonly sites: readonly string[];
  } | null;
  readonly contribution: {
    readonly title: string;
    readonly status: string;
    readonly siteId: string;
    readonly siteName: string;
  } | null;
}

/** Worker side: dedicated SECURITY DEFINER functions, filtered by the SIS of the job. */
export interface NotificationStore {
  get(id: string, tenantId: string): Promise<NotificationToSend | null>;
  /** One attempt: sent (error null) or failed with its error; false when it was not pending anymore. */
  record(id: string, tenantId: string, error: string | null): Promise<boolean>;
}

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

const day = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
const dayTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

const DECISIONS: Readonly<Record<string, string>> = {
  accepted: 'a accepté',
  partially_accepted: 'a accepté en partie',
  rejected: 'n’a pas retenu',
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** Subject, plain text and HTML of a notification, in French. */
export function renderNotification(notification: NotificationToSend, appBaseUrl: string): MailMessage {
  const base = appBaseUrl.replace(/\/+$/, '');
  const greeting = notification.recipientName ? `Bonjour ${notification.recipientName},` : 'Bonjour,';
  let subject: string;
  let lines: string[];
  let link: string;
  let linkLabel = 'Ouvrir le portail exploitant';
  if (notification.kind === 'second_factor_recovered' || notification.kind === 'second_factor_reset') {
    // Security alert: what happened, what to do, whom to warn if it was not the person.
    subject = `Double authentification retirée — ${PRODUCT}`;
    link = `${base}/compte`;
    linkLabel = 'Ouvrir mon compte';
    lines = [
      notification.kind === 'second_factor_recovered'
        ? `Un code de secours vient d’être utilisé pour votre compte ${PRODUCT} : votre double authentification a été retirée et vos autres sessions fermées.`
        : `L’administration de ${notification.tenantName} a réinitialisé votre double authentification sur ${PRODUCT} et fermé vos sessions.`,
      'À votre prochaine connexion, activez une nouvelle double authentification et générez de nouveaux codes de secours.',
      `Si vous n’êtes pas à l’origine de cette demande, prévenez sans attendre l’administration de ${notification.tenantName}.`,
    ];
  } else if (notification.kind === 'portal_invitation' && notification.invitation) {
    const { invitation } = notification;
    subject = `Invitation au portail exploitant — ${notification.tenantName}`;
    link = `${base}/portail`;
    lines = [
      `${notification.tenantName} vous invite à consulter sur ${PRODUCT} ce qu’il sait de ${
        invitation.sites.length > 1 ? 'vos sites' : 'votre site'
      } et à lui proposer des mises à jour : ${invitation.sites.join(', ')}.`,
      `Connectez-vous avec votre compte habituel pour accepter l’invitation avant le ${dayTime.format(invitation.expiresAt)}.`,
      invitation.accessUntil
        ? `Votre accès durera jusqu’au ${day.format(invitation.accessUntil)}.`
        : 'Votre accès durera jusqu’à ce que le SIS y mette fin.',
    ];
  } else if (notification.contribution) {
    const { contribution } = notification;
    link = `${base}/portail/sites/${contribution.siteId}`;
    if (notification.kind === 'contribution_info_request') {
      subject = `Précision demandée sur votre proposition — ${contribution.siteName}`;
      lines = [
        `${notification.tenantName} vous demande une précision sur votre proposition « ${contribution.title} » pour le site ${contribution.siteName}.`,
        'Pour lire la question et y répondre, connectez-vous à votre portail.',
      ];
    } else {
      subject = `Réponse à votre proposition — ${contribution.siteName}`;
      lines = [
        `${notification.tenantName} ${DECISIONS[contribution.status] ?? 'a répondu à'} votre proposition « ${contribution.title} » pour le site ${contribution.siteName}.`,
        'Le motif de la décision et la suite donnée sont consultables sur votre portail.',
      ];
    }
  } else {
    throw new PermanentJobError('NOTIFICATION_INCOMPLETE');
  }
  const footer =
    'Message automatique : n’y répondez pas. Le lien ouvre l’application après connexion ; il ne donne accès à rien par lui-même.';
  const text = [greeting, '', ...lines, '', link, '', '—', footer].join('\n');
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<p><a href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a></p>`,
    `<p style="color:#555;font-size:12px">${escapeHtml(footer)}</p>`,
  ].join('\n');
  return { to: notification.recipientEmail, subject, text, html };
}

export interface NotificationDependencies {
  readonly store: NotificationStore;
  /** Null when no mail server is configured: the notification fails, visibly, and can be replayed later. */
  readonly mailer: Mailer | null;
  readonly appBaseUrl: string | null;
}

/**
 * Sends one notification (job notification.send). Idempotent: a notification
 * already sent is skipped. A transient failure is recorded and retried by the
 * queue; a permanent one fails the notification.
 */
export async function sendNotification(
  deps: NotificationDependencies,
  notificationId: string,
  tenantId: string,
): Promise<'sent' | 'skipped'> {
  const notification = await deps.store.get(notificationId, tenantId);
  if (!notification) throw new PermanentJobError('NOTIFICATION_UNKNOWN');
  if (notification.status !== 'pending') return 'skipped';
  const fail = async (code: string): Promise<never> => {
    await deps.store.record(notificationId, tenantId, code);
    throw new PermanentJobError(code);
  };
  if (notification.invitation && notification.invitation.status !== 'pending') {
    return fail('INVITATION_NOT_PENDING');
  }
  if (!deps.mailer || !deps.appBaseUrl) return fail('SMTP_NOT_CONFIGURED');
  const message = renderNotification(notification, deps.appBaseUrl);
  try {
    await deps.mailer.send(message);
  } catch (error) {
    await deps.store.record(notificationId, tenantId, `SMTP: ${error instanceof Error ? error.message : 'échec'}`);
    throw error;
  }
  await deps.store.record(notificationId, tenantId, null);
  return 'sent';
}

// ------------------------------------------------------------------ administration of the SIS
export function listNotifications(
  sessions: SessionFactory,
  context: RequestContext,
  query: NotificationListQuery,
): Promise<NotificationList> {
  return inTenant(sessions, context, 'member:manage', async (session) => ({
    items: await session.notifications.list(query),
  }));
}

/** Sends a notification again (failed, or sent but lost). */
export function retryNotification(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
): Promise<Notification> {
  return inTenant(sessions, context, 'member:manage', async (session) => {
    await session.notifications.retry(id);
    return found(await session.notifications.get(id), 'Notification introuvable.');
  });
}
