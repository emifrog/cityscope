'use client';

import type { SiteSummary } from '@etare/contracts';
import { Badge, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@etare/ui';
import Link from 'next/link';
import { SITE_STATUS_LABELS, SITE_TYPE_LABELS } from './labels';

export function SitesTable({ sites }: { sites: readonly SiteSummary[] }) {
  if (sites.length === 0) {
    return <p className="px-5 py-4 text-sm text-muted">Aucun site visible dans ce SIS.</p>;
  }
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Site</TableHeaderCell>
          <TableHeaderCell>Type</TableHeaderCell>
          <TableHeaderCell>Commune</TableHeaderCell>
          <TableHeaderCell>N° ETARE</TableHeaderCell>
          <TableHeaderCell>Statut</TableHeaderCell>
        </TableRow>
      </TableHead>
      <tbody>
        {sites.map((site) => (
          <TableRow key={site.id}>
            <TableCell>
              <Link href={`/sites/${site.id}`} className="font-semibold text-info hover:underline">
                {site.name}
              </Link>
            </TableCell>
            <TableCell>{SITE_TYPE_LABELS[site.site_type]}</TableCell>
            <TableCell>{site.address?.city ?? '—'}</TableCell>
            <TableCell>{site.etare_number ?? '—'}</TableCell>
            <TableCell>
              <Badge tone={site.status === 'active' ? 'success' : 'neutral'}>{SITE_STATUS_LABELS[site.status]}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </tbody>
    </Table>
  );
}
