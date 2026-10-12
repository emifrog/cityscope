'use client';

import type { ExportPart, ExportRun } from '@etare/contracts';
import { Badge, Button, Card, cn } from '@etare/ui';
import { Archive, Download } from 'lucide-react';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { queryKeys, useApiMutation, useExports } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { formatSize } from './basemaps-admin';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('fr-FR')} ${count > 1 ? many : one}`;

const inProgress = (run: ExportRun) => run.status === 'queued' || run.status === 'building';

const BOXES: Readonly<Record<ExportRun['status'], string>> = {
  queued: 'bg-info-soft text-info',
  building: 'bg-info-soft text-info',
  ready: 'bg-success-soft text-success',
  failed: 'bg-critical-soft text-critical',
  expired: 'bg-subtle text-muted',
};

function RunState({ run }: { run: ExportRun }) {
  if (run.status === 'ready') {
    return (
      <Badge tone="success">Prêt{run.expires_at ? ` jusqu’au ${dateTime.format(new Date(run.expires_at))}` : ''}</Badge>
    );
  }
  if (run.status === 'failed') return <Badge tone="critical">Échec</Badge>;
  if (run.status === 'expired') return <Badge tone="neutral">Expiré</Badge>;
  return <Badge tone="info">En préparation</Badge>;
}

/** One downloadable part: a 60 s signed URL requested at click time, traced in the journal. */
function PartButton({ run, part }: { run: ExportRun; part: ExportPart }) {
  const download = useApiMutation(
    (options, index: number) => api.downloadExportPart(options, run.id, index),
    () => [],
  );
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={download.isPending}
        title={`SHA-256 ${part.sha256.slice(0, 12)}…`}
        onClick={() => download.mutate(part.index, { onSuccess: (ticket) => openInNewTab(ticket.url) })}
      >
        <Download aria-hidden="true" className="size-4" />
        {download.isPending ? 'Préparation…' : `${part.filename} (${formatSize(part.size_bytes)})`}
      </Button>
      {download.error ? <ApiErrorAlert error={download.error} /> : null}
    </div>
  );
}

function RunRow({ run, now }: { run: ExportRun; now: number }) {
  const content = [
    run.row_count !== null ? plural(run.row_count, 'ligne', 'lignes') : null,
    run.file_count !== null ? plural(run.file_count, 'fichier', 'fichiers') : null,
    run.total_bytes !== null ? formatSize(run.total_bytes) : null,
  ].filter(Boolean);
  return (
    <li className="grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
      <span
        aria-hidden="true"
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', BOXES[run.status])}
      >
        <Archive className="size-5" />
      </span>
      <div className="min-w-0 space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">
            Demandé {agoLabel(run.requested_at, now)}, le {dateTime.format(new Date(run.requested_at))}
          </span>
          <RunState run={run} />
        </p>
        <p className="text-xs text-muted">
          <span>Par {run.requested_by_name ?? '—'}</span>
          {content.map((item) => (
            <span key={item}>
              {' · '}
              <span>{item}</span>
            </span>
          ))}
        </p>
        {run.status === 'failed' ? (
          <p className="text-xs text-critical">{run.error_detail ?? run.error_code ?? 'Préparation interrompue.'}</p>
        ) : null}
        {run.status === 'ready' && run.parts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {run.parts.map((part) => (
              <PartButton key={part.index} run={run} part={part} />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Reversibility export of the SIS (ADMIN-04, ADR-033): every datum and every verified file,
 * packaged by the worker into parts downloadable for 7 days. Requesting one needs the second
 * factor; each request and each download are written to the journal.
 */
export function ExportsAdmin() {
  const exports = useExports();
  const request = useApiMutation(
    (options) => api.requestExport(options),
    (tenantId) => [queryKeys.exports(tenantId)],
  );
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const runs = exports.data ?? [];
  const pending = runs.some(inProgress);

  return (
    <div className="space-y-4">
      <SectionCard
        icon={Archive}
        title="Demander un export"
        description="Toutes les données du SIS en JSON et CSV, tous les fichiers vérifiés et les PDF publiés, avec un manifeste portant les empreintes de chaque fichier. Les parties restent téléchargeables 7 jours ; chaque demande et chaque téléchargement sont tracés au journal."
        contentClassName="space-y-2 px-5 py-4"
      >
        <Button
          disabled={pending || request.isPending || exports.isPending}
          title={pending ? 'Un export est déjà en préparation.' : undefined}
          onClick={() => request.mutate(undefined)}
        >
          {request.isPending ? 'Demande…' : 'Demander un export'}
        </Button>
        {request.error ? <ApiErrorAlert error={request.error} /> : null}
      </SectionCard>
      {exports.isPending ? <LoadingCard lines={3} /> : null}
      {exports.error ? <ApiErrorAlert error={exports.error} /> : null}
      {exports.data && runs.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
          >
            <Archive className="size-6" />
          </span>
          <p className="font-semibold text-foreground">Aucun export demandé pour l’instant.</p>
          <p className="text-sm text-muted">Chaque export demandé apparaîtra ici avec ses parties à télécharger.</p>
        </Card>
      ) : null}
      {runs.length > 0 ? (
        <Card>
          <ol className="divide-y divide-border" aria-label="Exports">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} now={now} />
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  );
}
