'use client';

import type { FieldReport, FieldReportListQuery } from '@etare/contracts';
import { Alert, Badge, Button, Card, Table, TableCell, TableHead, TableHeaderCell, TableRow, cn } from '@etare/ui';
import { Camera } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  REPORT_CATEGORY_LABELS,
  REPORT_ITEM_LABELS,
  REPORT_SEVERITY_LABELS,
  REPORT_STATUS_LABELS,
} from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { useFieldReportPages, usePermissions } from '@/lib/queries';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

const VIEWS: readonly { value: FieldReportListQuery['view']; label: string }[] = [
  { value: 'open', label: 'À traiter' },
  { value: 'closed', label: 'Traités' },
  { value: 'all', label: 'Tous' },
];

export const SEVERITY_TONES: Readonly<Record<FieldReport['severity'], 'neutral' | 'important' | 'critical'>> = {
  info: 'neutral',
  important: 'important',
  urgent: 'critical',
};

export const STATUS_TONES: Readonly<Record<FieldReport['status'], 'info' | 'important' | 'success' | 'neutral'>> = {
  new: 'important',
  triaged: 'info',
  resolved: 'success',
  rejected: 'neutral',
};

/**
 * Field reports of the SIS (OPS-04, ADR-017): discrepancies sent from the
 * tablets, to instruct. A report is a proposal: it never changes a published
 * version; the correction goes through a working revision.
 */
export function FieldReportsList() {
  const permissions = usePermissions();
  const [view, setView] = useState<FieldReportListQuery['view']>('open');
  const reviewer = permissions.has('field_report:review');
  const pages = useFieldReportPages(view);
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const openCount = pages.data?.pages[0]?.open_count;

  return (
    <>
      <PageHeader
        title="Signalements terrain"
        description="Écarts remontés par les intervenants depuis les tablettes : des propositions à instruire, jamais une modification de la version publiée."
      />
      {!reviewer ? (
        <Alert tone="info">Les signalements sont instruits par la Prévision et l’administration du SIS.</Alert>
      ) : (
        <>
          <div role="group" aria-label="Signalements affichés" className="mb-4 flex flex-wrap gap-2">
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
              {view === 'open' ? 'Aucun signalement à traiter.' : 'Aucun signalement dans cette vue.'}
            </Alert>
          ) : null}
          {items.length > 0 ? (
            <Card>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Reçu</TableHeaderCell>
                    <TableHeaderCell>Site</TableHeaderCell>
                    <TableHeaderCell>Constat</TableHeaderCell>
                    <TableHeaderCell>Agent</TableHeaderCell>
                    <TableHeaderCell>État</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <tbody>
                  {items.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="whitespace-nowrap">
                        {dateTime.format(new Date(report.received_at))}
                      </TableCell>
                      <TableCell>
                        {report.site_name}
                        <span className="block text-xs text-muted">
                          {report.etare_number ?? 'sans n° ETARE'} · version n° {report.publication.publication_number}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <span className="mb-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone={SEVERITY_TONES[report.severity]}>
                            {REPORT_SEVERITY_LABELS[report.severity]}
                          </Badge>
                          <Badge>{REPORT_CATEGORY_LABELS[report.category]}</Badge>
                          {report.photos.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted">
                              <Camera aria-hidden="true" className="size-3.5" />
                              {report.photos.length}
                              <span className="sr-only"> photo(s)</span>
                            </span>
                          ) : null}
                        </span>
                        <Link
                          href={`/signalements/${report.id}`}
                          className={cn('line-clamp-2 text-sm text-info hover:underline')}
                        >
                          {report.description}
                        </Link>
                        {report.item ? (
                          <span className="block text-xs text-muted">
                            {REPORT_ITEM_LABELS[report.item.type]} : {report.item.label}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{report.reporter.name}</TableCell>
                      <TableCell>
                        <Badge tone={STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>
                        {report.assigned_to ? (
                          <span className="block text-xs text-muted">{report.assigned_to.name}</span>
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
                    {pages.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de signalements'}
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
