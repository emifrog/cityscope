'use client';

import type { BasemapPackSummary, BasemapSectorState } from '@etare/contracts';
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
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { BASEMAP_REASON_LABELS, BASEMAP_RIGHTS_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useBasemaps } from '@/lib/queries';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Size in megabytes, as the tablet shows it. */
export function formatSize(bytes: number): string {
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1_048_576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

function PendingState({ pack }: { pack: BasemapPackSummary }) {
  if (pack.status === 'failed') {
    return (
      <div className="space-y-0.5">
        <Badge tone="critical">Échec de la version {pack.version}</Badge>
        <p className="text-xs text-muted">{pack.error_detail ?? pack.error_code ?? 'Préparation interrompue.'}</p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <Badge tone="info">{pack.status === 'building' ? 'Préparation en cours' : 'Préparation demandée'}</Badge>
      <p className="text-xs text-muted">
        Version {pack.version} · {BASEMAP_REASON_LABELS[pack.reason]} · {dateTime.format(new Date(pack.requested_at))}
      </p>
    </div>
  );
}

function SectorRow({ state, usable, now }: { state: BasemapSectorState; usable: boolean; now: number }) {
  const build = useApiMutation(
    (options) => api.requestBasemapBuild(options, state.sector.id),
    (tenantId) => [queryKeys.basemaps(tenantId)],
  );
  const current = state.current;
  const pending = state.latest && ['queued', 'building'].includes(state.latest.status);
  const renewalDue = current?.renew_after ? Date.parse(current.renew_after) < now : false;
  return (
    <>
      <TableRow>
        <TableCell>
          <p className="font-semibold">
            {state.sector.name}{' '}
            {state.sector.code ? <span className="text-xs text-muted">({state.sector.code})</span> : null}
          </p>
          <p className="text-xs text-muted">
            {plural(state.site_count, 'site localisé', 'sites localisés')} ·{' '}
            {plural(state.detail_count, 'zone de détail', 'zones de détail')}
          </p>
        </TableCell>
        <TableCell>
          {current ? (
            <div className="space-y-0.5">
              <p className="text-sm">
                Version {current.version} du {current.built_at ? date.format(new Date(current.built_at)) : '—'}
              </p>
              <p className="text-xs text-muted">
                {current.total_bytes !== null ? formatSize(current.total_bytes) : '—'}
                {current.tile_count !== null ? ` · ${current.tile_count.toLocaleString('fr-FR')} tuiles` : ''}
              </p>
              {renewalDue ? <Badge tone="important">Renouvellement dû</Badge> : null}
              {state.stale && !renewalDue ? <Badge tone="neutral">Sites modifiés depuis</Badge> : null}
            </div>
          ) : (
            <p className="text-sm text-muted">{state.eligible ? 'Pas encore de fond' : 'Aucune tablette'}</p>
          )}
          {state.latest ? <PendingState pack={state.latest} /> : null}
        </TableCell>
        <TableCell>
          {current ? (
            <p className="text-sm">
              {state.devices.installed} / {plural(state.devices.expected, 'tablette', 'tablettes')} à jour
            </p>
          ) : (
            <p className="text-sm text-muted">{plural(state.devices.expected, 'tablette', 'tablettes')}</p>
          )}
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          <Button
            size="sm"
            variant="ghost"
            disabled={!usable || pending || build.isPending || state.site_count === 0}
            title={
              !usable
                ? 'Les droits hors ligne de la source ne sont pas validés.'
                : state.site_count === 0
                  ? 'Aucun site localisé dans ce secteur.'
                  : undefined
            }
            onClick={() => build.mutate(undefined)}
          >
            {build.isPending ? 'Demande…' : 'Préparer maintenant'}
          </Button>
        </TableCell>
      </TableRow>
      {build.error ? (
        <TableRow>
          <TableCell colSpan={4}>
            <ApiErrorAlert error={build.error} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * Offline base maps of the tablets (CAR-01 to CAR-03, ADR-024): one file per
 * sector, prepared by the platform, downloaded by the tablets on Wi-Fi,
 * renewed every six months. The source and its rights are those of the
 * platform; the SIS sees their state and can prepare a sector now.
 */
export function BasemapsAdmin() {
  const basemaps = useBasemaps();
  // The clock of the page when it opened: enough to tell a renewal that is due.
  const [now] = useState(() => Date.now());
  const data = basemaps.data;
  const source = data?.source ?? null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fonds de carte des tablettes</CardTitle>
        <CardDescription>
          Un fond par secteur, préparé par la plateforme : vue générale jusqu’au zoom 14 sur les sites du secteur et
          leurs abords, détail jusqu’au zoom 18 autour des sites diffusés. Les tablettes le téléchargent en Wi-Fi ; il
          est renouvelé tous les six mois et dès que les sites du secteur changent.
        </CardDescription>
      </CardHeader>
      {basemaps.isPending ? (
        <CardContent>
          <LoadingCard lines={4} />
        </CardContent>
      ) : null}
      {basemaps.error ? (
        <CardContent>
          <ApiErrorAlert error={basemaps.error} />
        </CardContent>
      ) : null}
      {data ? (
        <CardContent className="space-y-3">
          {!source ? (
            <Alert tone="info">Aucune source de fond de carte n’est configurée sur cette plateforme.</Alert>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{source.product}</span>
              <Badge tone={source.rights === 'approved' ? 'success' : 'important'}>
                {BASEMAP_RIGHTS_LABELS[source.rights]}
              </Badge>
              <span className="text-muted">
                {source.attribution} · {source.licence_name}
              </span>
            </div>
          )}
          {source?.synthetic ? (
            <Alert tone="info">
              Fond d’essai synthétique : il valide la préparation, le transfert et l’affichage sur tablette, mais ne
              contient aucune donnée cartographique réelle.
            </Alert>
          ) : null}
          {source && source.rights !== 'approved' ? (
            <Alert tone="important">
              Les droits hors ligne de ce produit ne sont pas encore validés par le référent SIG (fiche de droits) :
              aucun fond n’est préparé ni diffusé d’ici là.
            </Alert>
          ) : null}
          <p className="text-xs text-muted">
            Budget d’une tablette, tous secteurs confondus : {formatSize(data.device_budget_bytes)}.
          </p>
        </CardContent>
      ) : null}
      {data && data.sectors.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted">
            Aucun secteur : composez des secteurs (onglet « Secteurs ») et affectez-y les tablettes.
          </p>
        </CardContent>
      ) : null}
      {data && data.sectors.length > 0 ? (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Secteur</TableHeaderCell>
              <TableHeaderCell>Fond en vigueur</TableHeaderCell>
              <TableHeaderCell>Tablettes</TableHeaderCell>
              <TableHeaderCell className="text-right">Action</TableHeaderCell>
            </TableRow>
          </TableHead>
          <tbody>
            {data.sectors.map((state) => (
              <SectorRow key={state.sector.id} state={state} usable={source?.usable ?? false} now={now} />
            ))}
          </tbody>
        </Table>
      ) : null}
    </Card>
  );
}
