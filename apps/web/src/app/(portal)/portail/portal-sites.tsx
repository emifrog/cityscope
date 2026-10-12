'use client';

import type { PortalSiteSummary } from '@etare/contracts';
import { Badge } from '@etare/ui';
import { Building2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { SectionCard } from '@/components/section-card';
import { usePortalSites } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

function SiteRow({ site, now }: { site: PortalSiteSummary; now: number }) {
  return (
    <li>
      <Link
        href={`/portail/sites/${site.id}`}
        className="grid gap-3 px-5 py-4 transition-colors hover:bg-subtle/60 focus-visible:outline-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
      >
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
        >
          <Building2 className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{site.name}</span>
            {site.etare_number ? <Badge>N° ETARE {site.etare_number}</Badge> : null}
            {site.published_at ? (
              <Badge tone="success">Version n° {site.publication_number}</Badge>
            ) : (
              <Badge tone="neutral">Aucune version publiée</Badge>
            )}
          </span>
          <span className="mt-1 block text-xs text-muted">
            {site.published_at
              ? `Publiée ${agoLabel(site.published_at, now)}, le ${date.format(new Date(site.published_at))}`
              : 'Le SIS n’a encore rien publié pour ce site'}
            {site.access_until ? ` · accès jusqu’au ${date.format(new Date(site.access_until))}` : ''}
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-accent-strong">
          Consulter
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      </Link>
    </li>
  );
}

/** Sites open to the exploitant, each with the version the SIS published (POR-02). */
export function PortalSites({ now }: { now: number }) {
  const sites = usePortalSites();
  if (sites.isPending) return <LoadingCard lines={3} />;
  if (sites.error) return <ApiErrorAlert error={sites.error} />;
  const count = sites.data.length;

  return (
    <SectionCard
      icon={Building2}
      title="Vos sites"
      description="Ce que le service d’incendie et de secours a publié pour ses équipes : identité, contacts, plans et documents partagés avec vous."
      aside={
        <Badge tone="info" className="px-3 py-1 text-sm">
          {count} site{count > 1 ? 's' : ''}
        </Badge>
      }
      contentClassName="px-0 py-0"
    >
      {count === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Aucun site ne vous est ouvert.</p>
      ) : (
        <ul className="divide-y divide-border" aria-label="Sites ouverts">
          {sites.data.map((site) => (
            <SiteRow key={site.id} site={site} now={now} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
