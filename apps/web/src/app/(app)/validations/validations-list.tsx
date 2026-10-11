'use client';

import type { ValidationQueueItem } from '@etare/contracts';
import { Alert, Badge, Button, Card } from '@etare/ui';
import { CircleCheckBig, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { usePermissions, useValidations } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** Beyond this wait, the queue says it: a submitted revision blocks the editors of the site. */
export const LONG_WAIT_MS = 7 * 86_400_000;

function QueueRow({ item, now, canApprove }: { item: ValidationQueueItem; now: number; canApprove: boolean }) {
  const waitedLong = now - Date.parse(item.submitted_at) > LONG_WAIT_MS;
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-center">
      <div className="min-w-0">
        <Link href={`/validations/${item.revision_id}`} className="font-semibold text-foreground hover:underline">
          {item.site_name}
        </Link>
        <p className="text-xs text-muted">
          {item.etare_number ? `N° ETARE ${item.etare_number}` : 'Sans n° ETARE'} · révision n° {item.revision_no} ·{' '}
          {item.base_publication_number ? `après la version n° ${item.base_publication_number}` : 'première version'}
        </p>
      </div>
      <div className="min-w-0 text-sm">
        {item.change_summary ? (
          <p className="line-clamp-2 text-foreground">{item.change_summary}</p>
        ) : (
          <p className="text-muted">Sans résumé des changements.</p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>
            Soumise par {item.submitted_by.name} {agoLabel(item.submitted_at, now)} ·{' '}
            {dateTime.format(new Date(item.submitted_at))}
          </span>
          {waitedLong ? (
            <Badge tone="important" className="gap-1">
              <Hourglass aria-hidden="true" className="size-3" />
              En attente depuis plus de 7 jours
            </Badge>
          ) : null}
        </p>
      </div>
      <Button asChild size="sm" variant={canApprove ? 'primary' : 'secondary'}>
        <Link href={`/validations/${item.revision_id}`}>{canApprove ? 'Contrôler' : 'Voir'}</Link>
      </Button>
    </li>
  );
}

/** Revisions submitted in the SIS, oldest first (WF-02). */
export function ValidationsList() {
  const permissions = usePermissions();
  const canApprove = permissions.has('etare:approve');
  const queue = useValidations();
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const count = queue.data?.length ?? 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Validations</h1>
          <p className="mt-1 text-sm text-muted">
            Révisions soumises, de la plus ancienne à la plus récente : le contenu est figé, un validateur qui n’y a pas
            contribué le contrôle puis le publie.
          </p>
        </div>
        {count > 0 ? (
          <Badge tone="important" className="px-3 py-1 text-sm">
            {count} révision{count > 1 ? 's' : ''} en attente
          </Badge>
        ) : null}
      </div>
      {!canApprove ? (
        <Alert tone="info" className="mb-4">
          Vous consultez la file ; seuls les validateurs du SIS décident.
        </Alert>
      ) : null}
      {queue.isPending ? <LoadingCard lines={4} /> : null}
      {queue.error ? <ApiErrorAlert error={queue.error} /> : null}
      {queue.data && count === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success"
          >
            <CircleCheckBig className="size-6" />
          </span>
          <p className="font-semibold text-foreground">Aucune révision en attente de validation.</p>
          <p className="text-sm text-muted">Les révisions soumises par les rédacteurs apparaîtront ici.</p>
          <Button asChild variant="secondary" size="sm">
            <Link href="/etare">Voir les dossiers ETARE</Link>
          </Button>
        </Card>
      ) : null}
      {queue.data && count > 0 ? (
        <Card>
          <ol className="divide-y divide-border" aria-label="Révisions à valider">
            {queue.data.map((item) => (
              <QueueRow key={item.revision_id} item={item} now={now} canApprove={canApprove} />
            ))}
          </ol>
        </Card>
      ) : null}
    </>
  );
}
