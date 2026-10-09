'use client';

import type { SiteDetail } from '@etare/contracts';
import { Badge, Button } from '@etare/ui';
import { ChevronRight, FileCheck2, Map, MapPin, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { SENSITIVITY_LABELS, SITE_STATUS_LABELS, SITE_TYPE_LABELS } from '@/components/labels';
import { SITE_TYPE_ICONS } from '@/components/site-type-icon';

/** What the publication of the site is, at a glance. */
function PublicationBadge({ site }: { site: SiteDetail }) {
  if (site.archive) return <Badge>Site archivé</Badge>;
  if (site.active_publication) {
    return <Badge tone="success">Version publiée n° {site.active_publication.publication_number}</Badge>;
  }
  return <Badge tone="important">Aucune version publiée</Badge>;
}

/**
 * Identity of the site above its tabs: where we are, what it is, what state it is in, and the
 * two places people go next (the dossier, the map).
 */
export function SiteHeader({ site }: { site: SiteDetail }) {
  const Icon = SITE_TYPE_ICONS[site.site_type];
  return (
    <header className="mb-5">
      <nav aria-label="Fil d’Ariane" className="mb-3 flex items-center gap-1 text-sm text-muted">
        <Link href="/sites" className="hover:text-foreground hover:underline">
          Sites
        </Link>
        <ChevronRight aria-hidden="true" className="size-4" />
        <span className="truncate text-foreground">{site.short_name ?? site.name}</span>
      </nav>
      <div className="flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-card bg-brand-navy text-white"
        >
          <Icon className="size-7" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-2xl font-bold break-words text-foreground">{site.name}</h1>
          {site.address?.label ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              <span>{site.address.label}</span>
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PublicationBadge site={site} />
            <Badge tone="info">{SITE_TYPE_LABELS[site.site_type]}</Badge>
            {site.etare_number ? <Badge>N° ETARE {site.etare_number}</Badge> : null}
            {site.status !== 'active' ? <Badge>{SITE_STATUS_LABELS[site.status]}</Badge> : null}
            {site.sensitivity !== 'normal' ? (
              <Badge tone="important" className="gap-1">
                <ShieldAlert aria-hidden="true" className="size-3" />
                Sensibilité {SENSITIVITY_LABELS[site.sensitivity].toLowerCase()}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/carte?q=${encodeURIComponent(site.name)}`}>
              <Map aria-hidden="true" className="size-4" />
              Sur la carte
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/sites/${site.id}?onglet=etare`} scroll={false}>
              <FileCheck2 aria-hidden="true" className="size-4" />
              Dossier ETARE
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
