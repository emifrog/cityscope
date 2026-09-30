'use client';

import type { EtareDossier } from '@etare/contracts';
import { Alert, Badge, Card, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@etare/ui';
import Link from 'next/link';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { REVISION_STATUS_LABELS } from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { useEtareDossiers } from '@/lib/queries';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

const REVISION_TONES: Readonly<Record<string, 'neutral' | 'info' | 'success' | 'important'>> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  changes_requested: 'important',
  superseded: 'neutral',
};

function RevisionCell({ dossier }: { dossier: EtareDossier }) {
  const revision = dossier.latest_revision;
  if (!revision) return <span className="text-sm text-muted">Aucune révision</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      n° {revision.revision_no}
      <Badge tone={REVISION_TONES[revision.status] ?? 'neutral'}>{REVISION_STATUS_LABELS[revision.status]}</Badge>
      <span className="text-xs text-muted">{date.format(new Date(revision.updated_at))}</span>
    </span>
  );
}

/** ETARE dossiers of the SIS: what is published, what is in progress (submitted and drafts first). */
export function EtareDossiers() {
  const dossiers = useEtareDossiers();
  return (
    <>
      <PageHeader
        title="ETARE"
        description="Dossiers des sites : version publiée consultée par les intervenants et révision en préparation."
      />
      {dossiers.isPending ? <LoadingCard lines={5} /> : null}
      {dossiers.error ? <ApiErrorAlert error={dossiers.error} /> : null}
      {dossiers.data && dossiers.data.length === 0 ? <Alert tone="info">Aucun site dans ce SIS.</Alert> : null}
      {dossiers.data && dossiers.data.length > 0 ? (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Site</TableHeaderCell>
                <TableHeaderCell>Version publiée</TableHeaderCell>
                <TableHeaderCell>Dernière révision</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {dossiers.data.map((dossier) => (
                <TableRow key={dossier.site_id}>
                  <TableCell>
                    <Link
                      href={`/sites/${dossier.site_id}?onglet=etare`}
                      className="font-medium text-info hover:underline"
                    >
                      {dossier.site_name}
                    </Link>
                    <span className="block text-xs text-muted">{dossier.etare_number ?? 'sans n° ETARE'}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {dossier.active_publication ? (
                      <>
                        n° {dossier.active_publication.publication_number}
                        <span className="block text-xs text-muted">
                          {date.format(new Date(dossier.active_publication.published_at))}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">Aucune</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RevisionCell dossier={dossier} />
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
