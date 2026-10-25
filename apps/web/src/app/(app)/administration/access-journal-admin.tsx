'use client';

import { Badge, Button, Card, cn } from '@etare/ui';
import { Monitor, ScrollText, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { ACCESS_ACTION_LABELS, SENSITIVITY_LABELS } from '@/components/labels';
import { useAccessEvents } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

/**
 * Journal of the sensitive sites (PER-02, cahier des charges §6.3 and §7):
 * consultations, exports and openings on tablets, newest first. A tablet sends
 * its offline consultations at its next contact: they appear later, at their
 * own date.
 */
export function AccessJournalAdmin() {
  const events = useAccessEvents();
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const items = events.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {events.data ? (
          <Badge tone="info" className="px-3 py-1 text-sm">
            {items.length} accès affiché{items.length > 1 ? 's' : ''}
            {events.hasNextPage ? ', d’autres suivent' : ''}
          </Badge>
        ) : (
          <span />
        )}
        <p className="max-w-2xl text-xs text-muted">
          Toute consultation, tout export et toute ouverture sur tablette d’un site « restreint » ou « élevé » est
          tracé, sans pouvoir être modifié. Les consultations faites hors ligne arrivent au contact suivant de la
          tablette.
        </p>
      </div>
      {events.isPending ? <LoadingCard lines={4} /> : null}
      {events.error ? <ApiErrorAlert error={events.error} /> : null}
      {events.data && items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
          >
            <ScrollText className="size-6" />
          </span>
          <p className="font-semibold text-foreground">Aucun accès à un site sensible pour l’instant.</p>
          <p className="text-sm text-muted">Chaque consultation d’un site restreint ou élevé viendra s’inscrire ici.</p>
        </Card>
      ) : null}
      {items.length > 0 ? (
        <Card>
          <ol className="divide-y divide-border" aria-label="Accès aux sites sensibles">
            {items.map((event) => {
              const Icon = event.device_name ? Smartphone : Monitor;
              const late = Date.parse(event.recorded_at) - Date.parse(event.occurred_at) > 5 * 60_000;
              return (
                <li
                  key={event.id}
                  className="grid gap-3 px-5 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-md',
                      event.sensitivity === 'high'
                        ? 'bg-critical-soft text-critical'
                        : 'bg-important-soft text-important',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-foreground">{event.user_name ?? 'Personne inconnue'}</span>
                      <span className="text-muted">{ACCESS_ACTION_LABELS[event.action].toLowerCase()}</span>
                      <Link href={`/sites/${event.site_id}`} className="font-medium text-foreground hover:underline">
                        {event.site_name}
                      </Link>
                      <Badge tone={event.sensitivity === 'high' ? 'critical' : 'important'}>
                        {SENSITIVITY_LABELS[event.sensitivity]}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted">
                      {event.publication_number ? `Version n° ${event.publication_number} · ` : ''}
                      {event.device_name ? `tablette ${event.device_name}` : 'back-office'}
                      {late ? ` · reçu le ${dateTime.format(new Date(event.recorded_at))}` : ''}
                    </p>
                  </div>
                  <p className="text-xs whitespace-nowrap text-muted md:text-right">
                    {agoLabel(event.occurred_at, now)}
                    <span className="block">{dateTime.format(new Date(event.occurred_at))}</span>
                  </p>
                </li>
              );
            })}
          </ol>
          {events.hasNextPage ? (
            <div className="border-t border-border px-5 py-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={events.isFetchingNextPage}
                onClick={() => void events.fetchNextPage()}
              >
                {events.isFetchingNextPage ? 'Chargement…' : 'Afficher les accès plus anciens'}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
