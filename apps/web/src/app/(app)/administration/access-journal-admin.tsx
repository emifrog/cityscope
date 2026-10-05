'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@etare/ui';
import Link from 'next/link';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { ACCESS_ACTION_LABELS, SENSITIVITY_LABELS } from '@/components/labels';
import { useAccessEvents } from '@/lib/queries';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

/**
 * Journal of the sensitive sites (PER-02, cahier des charges §6.3 and §7):
 * consultations, exports and openings on tablets, newest first. A tablet sends
 * its offline consultations at its next contact: they appear later, at their
 * own date.
 */
export function AccessJournalAdmin() {
  const events = useAccessEvents();
  const items = events.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Journal des sites sensibles</CardTitle>
        <CardDescription>
          Toute consultation, tout export et toute ouverture sur tablette d’un site « restreint » ou « élevé » est
          tracé, sans pouvoir être modifié. Les consultations faites hors ligne arrivent au contact suivant de la
          tablette.
        </CardDescription>
      </CardHeader>
      {events.isPending ? (
        <CardContent>
          <LoadingCard lines={4} />
        </CardContent>
      ) : null}
      {events.error ? (
        <CardContent>
          <ApiErrorAlert error={events.error} />
        </CardContent>
      ) : null}
      {events.data && items.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted">Aucun accès à un site sensible pour l’instant.</p>
        </CardContent>
      ) : null}
      {items.length > 0 ? (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Site</TableHeaderCell>
                <TableHeaderCell>Personne</TableHeaderCell>
                <TableHeaderCell>Accès</TableHeaderCell>
                <TableHeaderCell>Depuis</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap">
                    <p className="text-sm">{dateTime.format(new Date(event.occurred_at))}</p>
                    {Date.parse(event.recorded_at) - Date.parse(event.occurred_at) > 5 * 60_000 ? (
                      <p className="text-xs text-muted">reçu le {dateTime.format(new Date(event.recorded_at))}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Link href={`/sites/${event.site_id}`} className="text-sm font-semibold hover:underline">
                      {event.site_name}
                    </Link>{' '}
                    <Badge tone={event.sensitivity === 'high' ? 'critical' : 'important'}>
                      {SENSITIVITY_LABELS[event.sensitivity]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{event.user_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    {ACCESS_ACTION_LABELS[event.action]}
                    {event.publication_number ? (
                      <span className="text-muted"> · version {event.publication_number}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">{event.device_name ?? 'Back-office'}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
          {events.hasNextPage ? (
            <CardContent>
              <Button
                size="sm"
                variant="secondary"
                disabled={events.isFetchingNextPage}
                onClick={() => void events.fetchNextPage()}
              >
                {events.isFetchingNextPage ? 'Chargement…' : 'Afficher les accès plus anciens'}
              </Button>
            </CardContent>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
