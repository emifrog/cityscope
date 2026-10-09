'use client';

import { Button, Card } from '@etare/ui';
import { Building2, Map, Plus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { SiteFilterBar, useSiteFiltersFromUrl } from '@/components/site-filter-bar';
import { SitesTable } from '@/components/sites-table';
import { usePermissions, useSites } from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';

export function SitesList() {
  const { activeTenant } = useTenant();
  const permissions = usePermissions();
  const filters = useSiteFiltersFromUrl();
  const searchKey = useSearchParams().toString();
  const sites = useSites(filters);
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const items = sites.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = searchKey.length > 0;
  // A new site belongs to no sector yet: its creation needs the whole SIS (PER-01).
  const canCreate = permissions.has('site:write') && !activeTenant?.limited;
  const mapLink = `/carte${searchKey ? `?${searchKey}` : ''}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sites</h1>
          <p className="mt-1 text-sm text-muted">
            Référentiel des sites{activeTenant ? ` de ${activeTenant.tenant_name}` : ''} : données de travail, limitées
            à vos droits.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={mapLink}>
              <Map aria-hidden="true" className="size-4" />
              Voir sur la carte
            </Link>
          </Button>
          {canCreate ? (
            <Button asChild size="sm">
              <Link href="/sites/nouveau">
                <Plus aria-hidden="true" className="size-4" />
                Nouveau site
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <SiteFilterBar filters={filters} idPrefix="filter" label="Filtrer les sites" />

      {sites.isPending ? <LoadingCard lines={5} /> : null}
      {sites.error ? <ApiErrorAlert error={sites.error} /> : null}
      {sites.data && items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
          >
            <Building2 className="size-6" />
          </span>
          <p className="font-semibold text-foreground">
            {filtered ? 'Aucun site ne correspond à ces critères.' : 'Aucun site dans ce SIS pour le moment.'}
          </p>
          {filtered ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/sites">Effacer les filtres</Link>
            </Button>
          ) : canCreate ? (
            <Button asChild size="sm">
              <Link href="/sites/nouveau">
                <Plus aria-hidden="true" className="size-4" />
                Créer le premier site
              </Link>
            </Button>
          ) : null}
        </Card>
      ) : null}
      {sites.data && items.length > 0 ? (
        <Card>
          <SitesTable sites={items} now={now} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted" aria-live="polite">
              {items.length} site{items.length > 1 ? 's' : ''} affiché{items.length > 1 ? 's' : ''}
              {sites.hasNextPage ? ', d’autres suivent' : ''}
            </p>
            {sites.hasNextPage ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void sites.fetchNextPage()}
                disabled={sites.isFetchingNextPage}
              >
                {sites.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de sites'}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}
