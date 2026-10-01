'use client';

import type { Notification } from '@etare/contracts';
import { Alert, Badge, Button, Card, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@etare/ui';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useNotifications } from '@/lib/queries';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

const KIND_LABELS: Readonly<Record<Notification['kind'], string>> = {
  portal_invitation: 'Invitation au portail',
  contribution_info_request: 'Précision demandée',
  contribution_decision: 'Décision sur une proposition',
};

const STATUS: Readonly<Record<Notification['status'], { label: string; tone: 'info' | 'success' | 'critical' }>> = {
  pending: { label: 'En attente', tone: 'info' },
  sent: { label: 'Envoyée', tone: 'success' },
  failed: { label: 'En échec', tone: 'critical' },
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
      <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(notification.id)}>
        Renvoyer
      </Button>
      {retry.error ? <ApiErrorAlert error={retry.error} /> : null}
    </div>
  );
}

/**
 * E-mails of the exploitant portal (POR-05, ADR-020): written with their event,
 * sent by the worker. A failure never blocks the workflow; it is shown here and
 * the notification can be sent again.
 */
export function NotificationsAdmin() {
  const notifications = useNotifications();
  if (notifications.isPending) return <LoadingCard lines={4} />;
  if (notifications.error) return <ApiErrorAlert error={notifications.error} />;
  const failed = notifications.data.filter((notification) => notification.status === 'failed').length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Invitations, demandes de précision et décisions envoyées aux exploitants. Les e-mails ne contiennent aucune
        donnée du dossier : leur lien ouvre le portail après connexion.
      </p>
      {failed > 0 ? (
        <Alert tone="important">
          {failed > 1
            ? `${failed} notifications n’ont pas pu être envoyées`
            : 'Une notification n’a pas pu être envoyée'}{' '}
          : l’exploitant retrouve tout sur son portail ; vous pouvez la renvoyer.
        </Alert>
      ) : null}
      {notifications.data.length === 0 ? (
        <Alert tone="info">Aucune notification pour l’instant.</Alert>
      ) : (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Créée</TableHeaderCell>
                <TableHeaderCell>Objet</TableHeaderCell>
                <TableHeaderCell>Destinataire</TableHeaderCell>
                <TableHeaderCell>État</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {notifications.data.map((notification) => (
                <TableRow key={notification.id}>
                  <TableCell className="whitespace-nowrap">
                    {dateTime.format(new Date(notification.created_at))}
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <span className="block font-medium">{KIND_LABELS[notification.kind]}</span>
                    <span className="line-clamp-2 text-xs text-muted">{notification.about}</span>
                  </TableCell>
                  <TableCell>
                    {notification.recipient.name ?? '—'}
                    <span className="block text-xs text-muted">{notification.recipient.email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge tone={STATUS[notification.status].tone}>{STATUS[notification.status].label}</Badge>
                    <span className="block text-xs text-muted">
                      {notification.sent_at
                        ? `le ${dateTime.format(new Date(notification.sent_at))}`
                        : `${notification.attempts} tentative(s)`}
                    </span>
                    {failure(notification.last_error) ? (
                      <span className="block text-xs text-critical">{failure(notification.last_error)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <RetryButton notification={notification} />
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
