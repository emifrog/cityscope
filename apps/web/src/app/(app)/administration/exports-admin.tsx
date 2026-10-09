'use client';

import type { ExportPart, ExportRun } from '@etare/contracts';
import {
  Alert,
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
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { queryKeys, useApiMutation, useExports } from '@/lib/queries';
import { formatSize } from './basemaps-admin';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString('fr-FR')} ${count > 1 ? many : one}`;

const inProgress = (run: ExportRun) => run.status === 'queued' || run.status === 'building';

function RunState({ run }: { run: ExportRun }) {
  if (run.status === 'ready') {
    return (
      <Badge tone="success">Prêt{run.expires_at ? ` jusqu’au ${dateTime.format(new Date(run.expires_at))}` : ''}</Badge>
    );
  }
  if (run.status === 'failed') {
    return (
      <div className="space-y-0.5">
        <Badge tone="critical">Échec</Badge>
        <p className="text-xs text-muted">{run.error_detail ?? run.error_code ?? 'Préparation interrompue.'}</p>
      </div>
    );
  }
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
        {download.isPending ? 'Préparation…' : `${part.filename} (${formatSize(part.size_bytes)})`}
      </Button>
      {download.error ? <ApiErrorAlert error={download.error} /> : null}
    </div>
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
  const runs = exports.data ?? [];
  const pending = runs.some(inProgress);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Export de réversibilité</CardTitle>
          <CardDescription>
            L’export rassemble toutes les données du SIS en JSON et CSV, tous les fichiers vérifiés et les PDF publiés,
            avec un manifeste portant les empreintes de chaque fichier. Ses parties restent téléchargeables 7 jours ;
            chaque demande et chaque téléchargement sont tracés au journal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            disabled={pending || request.isPending || exports.isPending}
            title={pending ? 'Un export est déjà en préparation.' : undefined}
            onClick={() => request.mutate(undefined)}
          >
            {request.isPending ? 'Demande…' : 'Demander un export'}
          </Button>
          {request.error ? <ApiErrorAlert error={request.error} /> : null}
        </CardContent>
      </Card>
      {exports.isPending ? <LoadingCard lines={3} /> : null}
      {exports.error ? <ApiErrorAlert error={exports.error} /> : null}
      {exports.data && runs.length === 0 ? <Alert tone="info">Aucun export demandé pour l’instant.</Alert> : null}
      {runs.length > 0 ? (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Demandé le</TableHeaderCell>
                <TableHeaderCell>Demandeur</TableHeaderCell>
                <TableHeaderCell>État</TableHeaderCell>
                <TableHeaderCell>Contenu</TableHeaderCell>
                <TableHeaderCell>Parties</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="whitespace-nowrap">{dateTime.format(new Date(run.requested_at))}</TableCell>
                  <TableCell>{run.requested_by_name ?? '—'}</TableCell>
                  <TableCell>
                    <RunState run={run} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {run.row_count !== null || run.file_count !== null || run.total_bytes !== null ? (
                      <>
                        {run.row_count !== null ? plural(run.row_count, 'ligne', 'lignes') : null}
                        {run.file_count !== null ? (
                          <span className="block">{plural(run.file_count, 'fichier', 'fichiers')}</span>
                        ) : null}
                        {run.total_bytes !== null ? (
                          <span className="block text-xs text-muted">{formatSize(run.total_bytes)}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {run.status === 'ready' && run.parts.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {run.parts.map((part) => (
                          <PartButton key={part.index} run={run} part={part} />
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
