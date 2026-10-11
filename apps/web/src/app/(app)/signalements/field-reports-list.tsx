'use client';

import type { FieldReport, FieldReportListQuery } from '@etare/contracts';
import { Alert, Badge, Button, Card, cn } from '@etare/ui';
import { Camera, CircleCheckBig } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  REPORT_CATEGORY_LABELS,
  REPORT_ITEM_LABELS,
  REPORT_SEVERITY_LABELS,
  REPORT_STATUS_LABELS,
} from '@/components/labels';
import { REPORT_CATEGORY_ICONS } from '@/components/report-category-icon';
import { SegmentedControl } from '@/components/segmented-control';
import { useFieldReportPages, usePermissions } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

type View = FieldReportListQuery['view'];

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

/** Colour of the pictogram box: the severity of the report, at a glance. */
const SEVERITY_BOXES: Readonly<Record<FieldReport['severity'], string>> = {
  info: 'bg-subtle text-brand-navy',
  important: 'bg-important-soft text-important',
  urgent: 'bg-critical-soft text-critical',
};

function ReportRow({ report, now }: { report: FieldReport; now: number }) {
  const Icon = REPORT_CATEGORY_ICONS[report.category];
  const open = report.status === 'new' || report.status === 'triaged';
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
      <span
        aria-hidden="true"
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', SEVERITY_BOXES[report.severity])}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Link href={`/signalements/${report.id}`} className="font-semibold text-foreground hover:underline">
            {report.site_name}
          </Link>
          <Badge tone={SEVERITY_TONES[report.severity]}>{REPORT_SEVERITY_LABELS[report.severity]}</Badge>
          <Badge>{REPORT_CATEGORY_LABELS[report.category]}</Badge>
          {report.photos.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Camera aria-hidden="true" className="size-3.5" />
              {report.photos.length}
              <span className="sr-only"> photo(s)</span>
            </span>
          ) : null}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-foreground">{report.description}</p>
        <p className="mt-1 text-xs text-muted">
          {report.item ? `${REPORT_ITEM_LABELS[report.item.type]} : ${report.item.label} · ` : ''}
          {report.etare_number ? `N° ETARE ${report.etare_number} · ` : ''}version n°{' '}
          {report.publication.publication_number}
        </p>
        <p className="mt-1 text-xs text-muted">
          Signalé par {report.reporter.name} {agoLabel(report.received_at, now)} ·{' '}
          {dateTime.format(new Date(report.received_at))}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2 md:items-end">
        <Badge tone={STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>
        {report.assigned_to ? <span className="text-xs text-muted">{report.assigned_to.name}</span> : null}
        <Button asChild size="sm" variant={open ? 'primary' : 'secondary'}>
          <Link href={`/signalements/${report.id}`}>{open ? 'Instruire' : 'Voir'}</Link>
        </Button>
      </div>
    </li>
  );
}

/**
 * Field reports of the SIS (OPS-04, ADR-017): discrepancies sent from the
 * tablets, to instruct. A report is a proposal: it never changes a published
 * version; the correction goes through a working revision.
 */
export function FieldReportsList() {
  const permissions = usePermissions();
  const [view, setView] = useState<View>('open');
  const reviewer = permissions.has('field_report:review');
  const pages = useFieldReportPages(view);
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const openCount = pages.data?.pages[0]?.open_count;
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Signalements terrain</h1>
          <p className="mt-1 text-sm text-muted">
            Écarts remontés par les intervenants depuis les tablettes : des propositions à instruire, jamais une
            modification de la version publiée.
          </p>
        </div>
        {openCount ? (
          <Badge tone="important" className="px-3 py-1 text-sm">
            {openCount} à traiter
          </Badge>
        ) : null}
      </div>
      {!reviewer ? (
        <Alert tone="info">Les signalements sont instruits par la Prévision et l’administration du SIS.</Alert>
      ) : (
        <>
          <div className="mb-4">
            <SegmentedControl
              label="Signalements affichés"
              value={view}
              onChange={setView}
              options={[
                { value: 'open', label: 'À traiter', count: openCount },
                { value: 'closed', label: 'Traités' },
                { value: 'all', label: 'Tous' },
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
                {view === 'open' ? 'Aucun signalement à traiter.' : 'Aucun signalement dans cette vue.'}
              </p>
              <p className="text-sm text-muted">
                Les constats envoyés depuis les tablettes apparaissent ici dès leur réception.
              </p>
            </Card>
          ) : null}
          {items.length > 0 ? (
            <Card>
              <ol className="divide-y divide-border" aria-label="Signalements">
                {items.map((report) => (
                  <ReportRow key={report.id} report={report} now={now} />
                ))}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
                <p className="text-xs text-muted" aria-live="polite">
                  {items.length} signalement{items.length > 1 ? 's' : ''} affiché{items.length > 1 ? 's' : ''}
                  {pages.hasNextPage ? ', d’autres suivent' : ''}
                </p>
                {pages.hasNextPage ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void pages.fetchNextPage()}
                    disabled={pages.isFetchingNextPage}
                  >
                    {pages.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de signalements'}
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
