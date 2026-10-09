'use client';

import type { SiteSummary } from '@etare/contracts';
import { Badge, Table, TableCell, TableHead, TableHeaderCell, TableRow } from '@etare/ui';
import { MapPinOff, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { agoLabel } from '@/lib/relative-time';
import { SENSITIVITY_LABELS, SITE_STATUS_LABELS, SITE_TYPE_LABELS } from './labels';
import { SITE_TYPE_ICONS } from './site-type-icon';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

const STATUS_TONES: Readonly<Record<SiteSummary['status'], 'success' | 'neutral' | 'important'>> = {
  active: 'success',
  draft: 'neutral',
  inactive: 'important',
  archived: 'neutral',
};

/** The sites of a search: who they are, where, in what state, and how fresh their data are. */
export function SitesTable({ sites, now }: { sites: readonly SiteSummary[]; now: number }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Site</TableHeaderCell>
          <TableHeaderCell>Type</TableHeaderCell>
          <TableHeaderCell>Commune</TableHeaderCell>
          <TableHeaderCell>N° ETARE</TableHeaderCell>
          <TableHeaderCell>Statut</TableHeaderCell>
          <TableHeaderCell>Modifié</TableHeaderCell>
        </TableRow>
      </TableHead>
      <tbody>
        {sites.map((site) => {
          const Icon = SITE_TYPE_ICONS[site.site_type];
          return (
            <TableRow key={site.id} className="hover:bg-subtle/60">
              <TableCell>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/sites/${site.id}`} className="font-semibold text-foreground hover:underline">
                        {site.name}
                      </Link>
                      {site.sensitivity !== 'normal' ? (
                        <Badge tone="important" className="gap-1">
                          <ShieldAlert aria-hidden="true" className="size-3" />
                          {SENSITIVITY_LABELS[site.sensitivity]}
                        </Badge>
                      ) : null}
                      {site.location ? null : (
                        <Badge className="gap-1">
                          <MapPinOff aria-hidden="true" className="size-3" />
                          Sans position
                        </Badge>
                      )}
                    </p>
                    {site.address?.label ? <p className="truncate text-xs text-muted">{site.address.label}</p> : null}
                  </div>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{SITE_TYPE_LABELS[site.site_type]}</TableCell>
              <TableCell className="whitespace-nowrap">{site.address?.city ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap">{site.etare_number ?? '—'}</TableCell>
              <TableCell>
                <Badge tone={STATUS_TONES[site.status]}>{SITE_STATUS_LABELS[site.status]}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <span title={dateFormat.format(new Date(site.updated_at))}>{agoLabel(site.updated_at, now)}</span>
              </TableCell>
            </TableRow>
          );
        })}
      </tbody>
    </Table>
  );
}
