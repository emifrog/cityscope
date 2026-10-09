'use client';

import { SITE_STATUSES, SITE_TYPES } from '@etare/domain';
import { Button, Input, Label, Select, cn } from '@etare/ui';
import { Search, SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SITE_STATUS_LABELS, SITE_TYPE_LABELS } from './labels';
import { RiskFilterFields, riskFiltersFromParams } from './risk-filter-fields';
import type { SiteFilters } from '@/lib/queries';

const isSiteType = (value: string | null): value is (typeof SITE_TYPES)[number] =>
  (SITE_TYPES as readonly (string | null)[]).includes(value);
const isSiteStatus = (value: string | null): value is (typeof SITE_STATUSES)[number] =>
  (SITE_STATUSES as readonly (string | null)[]).includes(value);

/** URL parameters of the site filters, the same for the list and the map (a search moves between them). */
const PARAMS = ['q', 'type', 'statut', 'commune', 'risque', 'gravite'] as const;

/** Filters live in the URL: shareable, and restored by the back button. */
export function useSiteFiltersFromUrl(): SiteFilters {
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

/** How many criteria beyond the text are in use. */
export const refinementCount = (filters: SiteFilters): number =>
  Object.keys(filters).filter((key) => key !== 'q').length;

/**
 * Search box with the other criteria folded behind a « Filtres » button, counted when in use.
 * Submitting rewrites the URL; folded fields stay in the form, so a choice is never lost.
 */
export function SiteFilterBar({
  filters,
  idPrefix,
  label,
  onApply,
}: {
  filters: SiteFilters;
  idPrefix: string;
  label: string;
  /** Called before the URL changes: the page resets what depends on the previous search. */
  onApply?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchKey = useSearchParams().toString();
  const refinements = refinementCount(filters);
  const [open, setOpen] = useState(refinements > 0);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of PARAMS) {
      const value = String(data.get(key) ?? '').trim();
      if (value) next.set(key, value);
    }
    onApply?.();
    router.replace(next.size ? `${pathname}?${next}` : pathname);
  }

  const panelId = `${idPrefix}-filters`;
  return (
    <form key={searchKey} role="search" onSubmit={apply} className="mb-4 space-y-3" aria-label={label}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Recherche</span>
          <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            id={`${idPrefix}-q`}
            name="q"
            type="search"
            defaultValue={filters.q ?? ''}
            placeholder="Nom, adresse, n° ETARE…"
            className="pl-9"
          />
        </label>
        <Button
          type="button"
          variant={refinements > 0 ? 'primary' : 'secondary'}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Filtres{refinements > 0 ? ` (${refinements})` : ''}
        </Button>
        <Button type="submit" variant={refinements > 0 ? 'secondary' : 'primary'}>
          Rechercher
        </Button>
      </div>
      <div
        id={panelId}
        className={cn(
          'grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5',
          !open && 'hidden',
        )}
      >
        <div>
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <Select id={`${idPrefix}-type`} name="type" defaultValue={filters.site_type ?? ''} className="mt-1">
            <option value="">Tous</option>
            {SITE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SITE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-status`}>Statut</Label>
          <Select id={`${idPrefix}-status`} name="statut" defaultValue={filters.status ?? ''} className="mt-1">
            <option value="">Non archivés</option>
            {SITE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {SITE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-city`}>Commune</Label>
          <Input id={`${idPrefix}-city`} name="commune" defaultValue={filters.city ?? ''} className="mt-1" />
        </div>
        <RiskFilterFields prefix={idPrefix} riskTypeId={filters.risk_type_id} minSeverity={filters.min_severity} />
      </div>
    </form>
  );
}
