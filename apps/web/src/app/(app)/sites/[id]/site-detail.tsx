'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle } from '@etare/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { SENSITIVITY_LABELS, SITE_STATUS_LABELS, SITE_TYPE_LABELS } from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { useSite } from '@/lib/queries';

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function SiteDetailView({ id }: { id: string }) {
  const site = useSite(id);

  if (site.isPending) return <LoadingCard lines={6} />;
  if (site.error) {
    return (
      <>
        <ApiErrorAlert error={site.error} />
        <Link href="/sites" className="mt-4 inline-block text-sm text-info hover:underline">
          ← Retour aux sites
        </Link>
      </>
    );
  }

  const data = site.data;
  return (
    <>
      <PageHeader
        title={data.name}
        description={data.address?.label ?? undefined}
        actions={
          data.active_publication ? (
            <Badge tone="success">Version publiée n° {data.active_publication.publication_number}</Badge>
          ) : (
            <Badge tone="important">Aucune version publiée</Badge>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Référentiel site</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="N° ETARE">{data.etare_number ?? '—'}</Field>
              <Field label="Type">{SITE_TYPE_LABELS[data.site_type]}</Field>
              <Field label="Statut">{SITE_STATUS_LABELS[data.status]}</Field>
              <Field label="Bâtiments">{data.building_count}</Field>
              <Field label="Dernière vérification">
                {data.last_verified_at ? dateFormat.format(new Date(data.last_verified_at)) : '—'}
              </Field>
              <Field label="Sensibilité">{SENSITIVITY_LABELS[data.sensitivity]}</Field>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Publication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.active_publication ? (
              <p>
                Version n° {data.active_publication.publication_number} publiée le{' '}
                {dateFormat.format(new Date(data.active_publication.published_at))}. C’est la seule version consultée
                par les intervenants ; elle ne sera jamais modifiée.
              </p>
            ) : (
              <p className="text-muted">Ce site n’a pas encore de version publiée.</p>
            )}
            <p className="text-xs text-muted">
              Les informations ci-contre sont les données de travail ; l’édition et le circuit de validation arrivent
              aux sprints suivants.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
