'use client';

import type { Notification } from '@etare/contracts';
import { Alert, Badge, Button, Card, cn } from '@etare/ui';
import { Bell, CircleCheckBig } from 'lucide-react';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useNotifications } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

const KIND_LABELS: Readonly<Record<Notification['kind'], string>> = {
  portal_invitation: 'Invitation au portail',
  contribution_info_request: 'Précision demandée',
  contribution_decision: 'Décision sur une proposition',
  second_factor_recovered: 'Code de secours utilisé',
  second_factor_reset: 'Double authentification réinitialisée',
};

const STATUS: Readonly<Record<Notification['status'], { label: string; tone: 'info' | 'success' | 'critical' }>> = {
  pending: { label: 'En attente', tone: 'info' },
  sent: { label: 'Envoyée', tone: 'success' },
  failed: { label: 'En échec', tone: 'critical' },
};

const BOXES: Readonly<Record<Notification['status'], string>> = {
  pending: 'bg-info-soft text-info',
  sent: 'bg-subtle text-brand-navy',
  failed: 'bg-critical-soft text-critical',
};

/** Readable cause of a failure (codes recorded by the worker). */
function failure(error: string | null): string | null {
  if (!error) return null;
  if (error === 'SMTP_NOT_CONFIGURED') return 'Serveur d’envoi non configuré';
  if (error === 'INVITATION_NOT_PENDING') return 'Invitation déjà acceptée, révoquée ou expirée';
  return error;
}

function RetryButton({ notification }: { notification: Notification }) {
  const retry = useApiMutation(
    (options, id: string) => api.retryNotification(options, id),
    (tenantId) => [queryKeys.notifications(tenantId)],
  );
  if (notification.status === 'pending') return null;
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant={notification.status === 'failed' ? 'primary' : 'secondary'}
        disabled={retry.isPending}
        onClick={() => retry.mutate(notification.id)}
      >
        Renvoyer
      </Button>
      {retry.error ? <ApiErrorAlert error={retry.error} /> : null}
    </div>
  );
}

function NotificationRow({ notification, now }: { notification: Notification; now: number }) {
  const cause = failure(notification.last_error);
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
      <span
        aria-hidden="true"
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', BOXES[notification.status])}
      >
        <Bell className="size-5" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{KIND_LABELS[notification.kind]}</span>
          <Badge tone={STATUS[notification.status].tone}>{STATUS[notification.status].label}</Badge>
        </p>
        <p className="line-clamp-2 text-sm text-foreground">{notification.about}</p>
        <p className="text-xs text-muted">
          Pour {notification.recipient.name ?? notification.recipient.email}
          {notification.recipient.name ? ` (${notification.recipient.email})` : ''} · créée{' '}
          {agoLabel(notification.created_at, now)}, le {dateTime.format(new Date(notification.created_at))}
          {notification.sent_at
            ? ` · envoyée ${agoLabel(notification.sent_at, now)}`
            : ` · ${notification.attempts} tentative${notification.attempts > 1 ? 's' : ''}`}
        </p>
        {cause ? <p className="text-xs text-critical">{cause}</p> : null}
      </div>
      <RetryButton notification={notification} />
    </li>
  );
}

/**
 * E-mails of the exploitant portal (POR-05, ADR-020): written with their event,
 * sent by the worker. A failure never blocks the workflow; it is shown here and
 * the notification can be sent again.
 */
export function NotificationsAdmin() {
  const notifications = useNotifications();
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  if (notifications.isPending) return <LoadingCard lines={4} />;
  if (notifications.error) return <ApiErrorAlert error={notifications.error} />;
  const failed = notifications.data.filter((notification) => notification.status === 'failed').length;
  const pending = notifications.data.filter((notification) => notification.status === 'pending').length;
  const sent = notifications.data.length - failed - pending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success" className="px-3 py-1 text-sm">
            {sent} envoyée{sent > 1 ? 's' : ''}
          </Badge>
          {pending > 0 ? (
            <Badge tone="info" className="px-3 py-1 text-sm">
              {pending} en attente
            </Badge>
          ) : null}
          {failed > 0 ? (
            <Badge tone="critical" className="px-3 py-1 text-sm">
              {failed} en échec
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted">
          Les e-mails ne contiennent aucune donnée du dossier : leur lien ouvre le portail après connexion.
        </p>
      </div>
      {failed > 0 ? (
        <Alert tone="important">
          {failed > 1
            ? `${failed} notifications n’ont pas pu être envoyées`
            : 'Une notification n’a pas pu être envoyée'}{' '}
          : l’exploitant retrouve tout sur son portail ; vous pouvez la renvoyer.
        </Alert>
      ) : null}
      {notifications.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success"
          >
            <CircleCheckBig className="size-6" />
          </span>
          <p className="font-semibold text-foreground">Aucune notification pour l’instant.</p>
          <p className="text-sm text-muted">
            Invitations, demandes de précision et décisions envoyées aux exploitants apparaîtront ici.
          </p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border" aria-label="Notifications">
            {notifications.data.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} now={now} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
