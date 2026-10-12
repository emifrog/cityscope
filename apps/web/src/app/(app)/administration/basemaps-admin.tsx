'use client';

import type { BasemapPackSummary, BasemapSectorState } from '@etare/contracts';
import { Alert, Badge, Button, Card, cn } from '@etare/ui';
import { Layers } from 'lucide-react';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { BASEMAP_REASON_LABELS, BASEMAP_RIGHTS_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useBasemaps } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

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
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="critical">Échec de la version {pack.version}</Badge>
        <span className="text-muted">{pack.error_detail ?? pack.error_code ?? 'Préparation interrompue.'}</span>
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs">
      <Badge tone="info">{pack.status === 'building' ? 'Préparation en cours' : 'Préparation demandée'}</Badge>
      <span className="text-muted">
        Version {pack.version} · {BASEMAP_REASON_LABELS[pack.reason]} · {dateTime.format(new Date(pack.requested_at))}
      </span>
    </p>
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
    <li className="px-5 py-4">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-md',
            !current
              ? 'bg-subtle text-muted'
              : renewalDue || state.latest?.status === 'failed'
                ? 'bg-important-soft text-important'
                : 'bg-success-soft text-success',
          )}
        >
          <Layers className="size-5" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{state.sector.name}</span>
            {state.sector.code ? <Badge>{state.sector.code}</Badge> : null}
            {current ? (
              <Badge tone="success">Version {current.version}</Badge>
            ) : (
              <Badge tone="neutral">{state.eligible ? 'Pas encore de fond' : 'Aucune tablette'}</Badge>
            )}
            {renewalDue ? <Badge tone="important">Renouvellement dû</Badge> : null}
            {state.stale && !renewalDue ? <Badge tone="neutral">Sites modifiés depuis</Badge> : null}
          </p>
          <p className="text-xs text-muted">
            {plural(state.site_count, 'site localisé', 'sites localisés')} ·{' '}
            {plural(state.detail_count, 'zone de détail', 'zones de détail')}
            {current
              ? ` · fond préparé ${current.built_at ? `${agoLabel(current.built_at, now)} (${date.format(new Date(current.built_at))})` : '—'} · ${
                  current.total_bytes !== null ? formatSize(current.total_bytes) : '—'
                }${current.tile_count !== null ? ` · ${current.tile_count.toLocaleString('fr-FR')} tuiles` : ''}`
              : ''}
          </p>
          <p className="text-sm">
            {current
              ? `${state.devices.installed} / ${plural(state.devices.expected, 'tablette', 'tablettes')} à jour`
              : plural(state.devices.expected, 'tablette affectée', 'tablettes affectées')}
          </p>
          {state.latest ? <PendingState pack={state.latest} /> : null}
          {build.error ? <ApiErrorAlert error={build.error} /> : null}
        </div>
        <Button
          size="sm"
          variant="secondary"
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
      </div>
    </li>
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
  const ready = data?.sectors.filter((state) => state.current).length ?? 0;
  return (
    <div className="space-y-4">
      {basemaps.isPending ? <LoadingCard lines={4} /> : null}
      {basemaps.error ? <ApiErrorAlert error={basemaps.error} /> : null}
      {data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info" className="px-3 py-1 text-sm">
                {ready} fond{ready > 1 ? 's' : ''} en vigueur sur {plural(data.sectors.length, 'secteur', 'secteurs')}
              </Badge>
              {source ? (
                <>
                  <span className="text-sm font-semibold text-foreground">{source.product}</span>
                  <Badge tone={source.rights === 'approved' ? 'success' : 'important'}>
                    {BASEMAP_RIGHTS_LABELS[source.rights]}
                  </Badge>
                </>
              ) : null}
            </div>
            <p className="text-xs text-muted">
              Budget d’une tablette, tous secteurs confondus : {formatSize(data.device_budget_bytes)}.
            </p>
          </div>
          {source ? (
            <p className="text-xs text-muted">
              {source.attribution} · {source.licence_name}. Un fond par secteur : vue générale jusqu’au zoom 14 sur les
              sites du secteur et leurs abords, détail jusqu’au zoom 18 autour des sites diffusés. Les tablettes le
              téléchargent en Wi-Fi ; il est renouvelé tous les six mois et dès que les sites du secteur changent.
            </p>
          ) : (
            <Alert tone="info">Aucune source de fond de carte n’est configurée sur cette plateforme.</Alert>
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
          {data.sectors.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
              >
                <Layers className="size-6" />
              </span>
              <p className="font-semibold text-foreground">Aucun secteur, donc aucun fond à préparer.</p>
              <p className="text-sm text-muted">
                Composez des secteurs (section « Secteurs ») et affectez-y les tablettes.
              </p>
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-border" aria-label="Fonds de carte par secteur">
                {data.sectors.map((state) => (
                  <SectorRow key={state.sector.id} state={state} usable={source?.usable ?? false} now={now} />
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
