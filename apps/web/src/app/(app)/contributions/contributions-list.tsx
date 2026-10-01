'use client';

import type { ContributionListQuery } from '@etare/contracts';
import type { ContributionStatus } from '@etare/domain';
import { Alert, Badge, Button, Card, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@etare/ui';
import { Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CONTRIBUTION_OPERATION_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_TARGET_LABELS,
} from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { useContributionPages, usePermissions } from '@/lib/queries';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

const VIEWS: readonly { value: ContributionListQuery['view']; label: string }[] = [
  { value: 'open', label: 'À traiter' },
  { value: 'closed', label: 'Traitées' },
  { value: 'all', label: 'Toutes' },
];

export const CONTRIBUTION_TONES: Readonly<Record<ContributionStatus, 'info' | 'important' | 'success' | 'neutral'>> = {
  submitted: 'important',
  in_review: 'info',
  info_requested: 'info',
  accepted: 'success',
  partially_accepted: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
};

/**
 * Proposals of the exploitants (POR-03/04, ADR-019), to instruct. A proposal
 * never changes the working data nor a publication: an accepted one goes
 * through a working revision and the normal validation.
 */
export function ContributionsList() {
  const reviewer = usePermissions().has('contribution:review');
  const [view, setView] = useState<ContributionListQuery['view']>('open');
  const pages = useContributionPages(view);
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const openCount = pages.data?.pages[0]?.open_count;

  return (
    <>
      <PageHeader
        title="Contributions"
        description="Mises à jour proposées par les exploitants depuis leur portail : des propositions à instruire, jamais une modification directe du dossier."
      />
      {!reviewer ? (
        <Alert tone="info">Les contributions sont instruites par la Prévision et l’administration du SIS.</Alert>
      ) : (
        <>
          <div role="group" aria-label="Contributions affichées" className="mb-4 flex flex-wrap gap-2">
            {VIEWS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={view === option.value ? 'primary' : 'secondary'}
                aria-pressed={view === option.value}
                onClick={() => setView(option.value)}
              >
                {option.label}
                {option.value === 'open' && openCount !== undefined ? ` (${openCount})` : ''}
              </Button>
            ))}
          </div>
          {pages.isPending ? <LoadingCard lines={4} /> : null}
          {pages.error ? <ApiErrorAlert error={pages.error} /> : null}
          {pages.data && items.length === 0 ? (
            <Alert tone="info">
              {view === 'open' ? 'Aucune contribution à traiter.' : 'Aucune contribution dans cette vue.'}
            </Alert>
          ) : null}
          {items.length > 0 ? (
            <Card>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Reçue</TableHeaderCell>
                    <TableHeaderCell>Site</TableHeaderCell>
                    <TableHeaderCell>Proposition</TableHeaderCell>
                    <TableHeaderCell>Exploitant</TableHeaderCell>
                    <TableHeaderCell>État</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <tbody>
                  {items.map((contribution) => (
                    <TableRow key={contribution.id}>
                      <TableCell className="whitespace-nowrap">
                        {dateTime.format(new Date(contribution.created_at))}
                      </TableCell>
                      <TableCell>
                        {contribution.site_name}
                        <span className="block text-xs text-muted">
                          {contribution.etare_number ?? 'sans n° ETARE'}
                          {contribution.publication
                            ? ` · version n° ${contribution.publication.publication_number}`
                            : ''}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <span className="mb-1 flex flex-wrap items-center gap-1.5">
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
                        </span>
                        <Link
                          href={`/contributions/${contribution.id}`}
                          className="line-clamp-2 text-sm text-info hover:underline"
                        >
                          {contribution.title}
                        </Link>
                      </TableCell>
                      <TableCell>{contribution.author.name}</TableCell>
                      <TableCell>
                        <Badge tone={CONTRIBUTION_TONES[contribution.status]}>
                          {CONTRIBUTION_STATUS_LABELS[contribution.status]}
                        </Badge>
                        {contribution.assigned_to ? (
                          <span className="block text-xs text-muted">{contribution.assigned_to.name}</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
              {pages.hasNextPage ? (
                <div className="border-t border-border p-4 text-center">
                  <Button
                    variant="secondary"
                    onClick={() => void pages.fetchNextPage()}
                    disabled={pages.isFetchingNextPage}
                  >
                    {pages.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de contributions'}
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
