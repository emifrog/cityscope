'use client';

import { Alert, Card, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@etare/ui';
import Link from 'next/link';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { usePermissions, useValidations } from '@/lib/queries';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** Revisions submitted in the SIS, oldest first (WF-02). */
export function ValidationsList() {
  const permissions = usePermissions();
  const queue = useValidations();
  return (
    <>
      <PageHeader
        title="Validations"
        description="Révisions soumises : le contenu est figé, un validateur qui n’y a pas contribué le contrôle puis le publie."
      />
      {!permissions.has('etare:approve') ? (
        <Alert tone="info" className="mb-4">
          Vous consultez la file ; seuls les validateurs du SIS décident.
        </Alert>
      ) : null}
      {queue.isPending ? <LoadingCard lines={4} /> : null}
      {queue.error ? <ApiErrorAlert error={queue.error} /> : null}
      {queue.data && queue.data.length === 0 ? (
        <Alert tone="info">Aucune révision en attente de validation.</Alert>
      ) : null}
      {queue.data && queue.data.length > 0 ? (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Site</TableHeaderCell>
                <TableHeaderCell>Révision</TableHeaderCell>
                <TableHeaderCell>Soumise</TableHeaderCell>
                <TableHeaderCell>Résumé</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {queue.data.map((item) => (
                <TableRow key={item.revision_id}>
                  <TableCell>
                    <Link href={`/validations/${item.revision_id}`} className="font-medium text-info hover:underline">
                      {item.site_name}
                    </Link>
                    <span className="block text-xs text-muted">{item.etare_number ?? 'sans n° ETARE'}</span>
                  </TableCell>
                  <TableCell>
                    n° {item.revision_no}
                    <span className="block text-xs text-muted">
                      {item.base_publication_number
                        ? `après la version n° ${item.base_publication_number}`
                        : 'première version'}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.submitted_by.name}
                    <span className="block text-xs text-muted">{dateTime.format(new Date(item.submitted_at))}</span>
                  </TableCell>
                  <TableCell className="max-w-md text-sm">{item.change_summary}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
