'use client';

import type { Contribution, ContributionListQuery } from '@etare/contracts';
import type { ContributionStatus } from '@etare/domain';
import { Alert, Badge, Button, Card, cn } from '@etare/ui';
import { CircleCheckBig, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { CONTRIBUTION_TARGET_ICONS } from '@/components/contribution-target-icon';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CONTRIBUTION_OPERATION_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_TARGET_LABELS,
} from '@/components/labels';
import { SegmentedControl } from '@/components/segmented-control';
import { useContributionPages, usePermissions } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

type View = ContributionListQuery['view'];

export const CONTRIBUTION_TONES: Readonly<Record<ContributionStatus, 'info' | 'navy' | 'success' | 'neutral'>> = {
  submitted: 'info',
  in_review: 'navy',
  info_requested: 'navy',
  accepted: 'success',
  partially_accepted: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
};

/** Still waiting for the SIS (or for the exploitant's answer): the row invites to instruct. */
const OPEN_STATUSES: ReadonlySet<ContributionStatus> = new Set(['submitted', 'in_review', 'info_requested']);

function ContributionRow({ contribution, now }: { contribution: Contribution; now: number }) {
  const Icon = CONTRIBUTION_TARGET_ICONS[contribution.target_type];
  const open = OPEN_STATUSES.has(contribution.status);
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-md',
          contribution.conflict ? 'bg-important-soft text-important' : 'bg-subtle text-brand-navy',
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Link href={`/contributions/${contribution.id}`} className="font-semibold text-foreground hover:underline">
            {contribution.title}
          </Link>
          <Badge>
            {CONTRIBUTION_OPERATION_LABELS[contribution.operation]} ·{' '}
            {CONTRIBUTION_TARGET_LABELS[contribution.target_type]}
          </Badge>
          {contribution.conflict ? <Badge tone="important">Conflit</Badge> : null}
          {contribution.attachments.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Paperclip aria-hidden="true" className="size-3.5" />
              {contribution.attachments.length}
              <span className="sr-only"> pièce(s) jointe(s)</span>
            </span>
          ) : null}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-foreground">{contribution.description}</p>
        <p className="mt-1 text-xs text-muted">
          {contribution.site_name}
          {contribution.etare_number ? ` · N° ETARE ${contribution.etare_number}` : ''}
          {contribution.publication ? ` · version n° ${contribution.publication.publication_number}` : ''}
        </p>
        <p className="mt-1 text-xs text-muted">
          Proposée par {contribution.author.name} {agoLabel(contribution.created_at, now)} ·{' '}
          {dateTime.format(new Date(contribution.created_at))}
          {contribution.messages.length > 0
            ? ` · ${contribution.messages.length} échange${contribution.messages.length > 1 ? 's' : ''}`
            : ''}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <Badge tone={CONTRIBUTION_TONES[contribution.status]}>{CONTRIBUTION_STATUS_LABELS[contribution.status]}</Badge>
        {contribution.assigned_to ? <span className="text-xs text-muted">{contribution.assigned_to.name}</span> : null}
        <Button asChild size="sm" variant={open ? 'primary' : 'secondary'}>
          <Link href={`/contributions/${contribution.id}`}>{open ? 'Instruire' : 'Voir'}</Link>
        </Button>
      </div>
    </li>
  );
}

/**
 * Proposals of the exploitants (POR-03/04, ADR-019), to instruct. A proposal
 * never changes the working data nor a publication: an accepted one goes
 * through a working revision and the normal validation.
 */
export function ContributionsList() {
  const reviewer = usePermissions().has('contribution:review');
  const [view, setView] = useState<View>('open');
  const pages = useContributionPages(view);
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const openCount = pages.data?.pages[0]?.open_count;
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contributions des exploitants</h1>
          <p className="mt-1 text-sm text-muted">
            Mises à jour proposées depuis le portail : des propositions à instruire, jamais une modification directe du
            dossier.
          </p>
        </div>
        {openCount ? (
          <Badge tone="info" className="px-3 py-1 text-sm">
            {openCount} à traiter
          </Badge>
        ) : null}
      </div>
      {!reviewer ? (
        <Alert tone="info">Les contributions sont instruites par la Prévision et l’administration du SIS.</Alert>
      ) : (
        <>
          <div className="mb-4">
            <SegmentedControl
              label="Contributions affichées"
              value={view}
              onChange={setView}
              options={[
                { value: 'open', label: 'À traiter', count: openCount },
                { value: 'closed', label: 'Traitées' },
                { value: 'all', label: 'Toutes' },
              ]}
            />
          </div>
          {pages.isPending ? <LoadingCard lines={4} /> : null}
          {pages.error ? <ApiErrorAlert error={pages.error} /> : null}
          {pages.data && items.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-12 items-center justify-center rounded-full',
                  view === 'open' ? 'bg-success-soft text-success' : 'bg-subtle text-brand-navy',
                )}
              >
                <CircleCheckBig className="size-6" />
              </span>
              <p className="font-semibold text-foreground">
                {view === 'open' ? 'Aucune contribution à traiter.' : 'Aucune contribution dans cette vue.'}
              </p>
              <p className="text-sm text-muted">
                Les propositions des exploitants apparaissent ici dès qu’elles sont envoyées depuis le portail.
              </p>
            </Card>
          ) : null}
          {items.length > 0 ? (
            <Card>
              <ol className="divide-y divide-border" aria-label="Contributions">
                {items.map((contribution) => (
                  <ContributionRow key={contribution.id} contribution={contribution} now={now} />
                ))}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted" aria-live="polite">
                  {items.length} contribution{items.length > 1 ? 's' : ''} affichée{items.length > 1 ? 's' : ''}
                  {pages.hasNextPage ? ', d’autres suivent' : ''}
                </p>
                {pages.hasNextPage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void pages.fetchNextPage()}
                    disabled={pages.isFetchingNextPage}
                  >
                    {pages.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de contributions'}
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
