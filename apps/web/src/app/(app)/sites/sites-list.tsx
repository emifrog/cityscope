'use client';

import { SITE_STATUSES, SITE_TYPES } from '@etare/domain';
import { Button, Card, Input, Label, Select } from '@etare/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { SITE_STATUS_LABELS, SITE_TYPE_LABELS } from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { RiskFilterFields, riskFiltersFromParams } from '@/components/risk-filter-fields';
import { SitesTable } from '@/components/sites-table';
import { usePermissions, useSites, type SiteFilters } from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';

const isSiteType = (value: string | null): value is (typeof SITE_TYPES)[number] =>
  (SITE_TYPES as readonly (string | null)[]).includes(value);
const isSiteStatus = (value: string | null): value is (typeof SITE_STATUSES)[number] =>
  (SITE_STATUSES as readonly (string | null)[]).includes(value);

/** Filters live in the URL: shareable, and restored by the back button. */
function useFiltersFromUrl(): SiteFilters {
  const params = useSearchParams();
  const q = params.get('q')?.trim();
  const siteType = params.get('type');
  const status = params.get('statut');
  const city = params.get('commune')?.trim();
  return {
    ...(q && q.length >= 2 ? { q } : {}),
    ...(isSiteType(siteType) ? { site_type: siteType } : {}),
    ...(isSiteStatus(status) ? { status } : {}),
    ...(city ? { city } : {}),
    ...riskFiltersFromParams(params),
  };
}

export function SitesList() {
  const { activeTenant } = useTenant();
  const permissions = usePermissions();
  const filters = useFiltersFromUrl();
  const searchKey = useSearchParams().toString();
  const sites = useSites(filters);
  const router = useRouter();
  const pathname = usePathname();
  const items = sites.data?.pages.flatMap((page) => page.items) ?? [];

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ['q', 'type', 'statut', 'commune', 'risque', 'gravite']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  }

  return (
    <>
      <PageHeader
        title="Sites"
        description={activeTenant ? `Référentiel des sites — ${activeTenant.tenant_name}` : undefined}
        actions={
          // A new site belongs to no sector yet: its creation needs the whole SIS (PER-01).
          permissions.has('site:write') && !activeTenant?.limited ? (
            <Button asChild>
              <Link href="/sites/nouveau">
                <Plus aria-hidden="true" className="size-4" />
                Nouveau site
              </Link>
            </Button>
          ) : null
        }
      />

      <form
        key={searchKey}
        role="search"
        onSubmit={applyFilters}
        className="mb-4 grid gap-3 md:grid-cols-3 md:items-end xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto]"
      >
        <div>
          <Label htmlFor="filter-q">Recherche</Label>
          <Input
            id="filter-q"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Nom, adresse, n° ETARE"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="filter-type">Type</Label>
          <Select id="filter-type" name="type" defaultValue={filters.site_type ?? ''} className="mt-1">
            <option value="">Tous</option>
            {SITE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SITE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-status">Statut</Label>
          <Select id="filter-status" name="statut" defaultValue={filters.status ?? ''} className="mt-1">
            <option value="">Non archivés</option>
            {SITE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SITE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-city">Commune</Label>
          <Input id="filter-city" name="commune" defaultValue={filters.city ?? ''} className="mt-1" />
        </div>
        <RiskFilterFields prefix="filter" riskTypeId={filters.risk_type_id} minSeverity={filters.min_severity} />
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
      </form>

      {sites.isPending ? <LoadingCard lines={5} /> : null}
      {sites.error ? <ApiErrorAlert error={sites.error} /> : null}
      {sites.data ? (
        <Card>
          <SitesTable sites={items} />
          {sites.hasNextPage ? (
            <div className="border-t border-border p-4 text-center">
              <Button
                variant="secondary"
                onClick={() => void sites.fetchNextPage()}
                disabled={sites.isFetchingNextPage}
              >
                {sites.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de sites'}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
