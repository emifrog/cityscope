'use client';

import type { MapSiteFeature } from '@etare/contracts';
import { cn } from '@etare/ui';
import Link from 'next/link';
import { SITE_TYPE_LABELS } from '@/components/labels';
import { SITE_TYPE_ICONS } from '@/components/site-type-icon';

/** Sites sorted by name, the way people look for one in a list. */
export function sortedByName(features: readonly MapSiteFeature[]): MapSiteFeature[] {
  return [...features].sort((a, b) => a.properties.name.localeCompare(b.properties.name, 'fr'));
}

/**
 * The sites of the map as a list beside it: one row per site, the selected one highlighted,
 * a click centres the map on it.
 */
export function MapResultsList({
  features,
  selectedId,
  truncated,
  listLink,
  onSelect,
}: {
  features: readonly MapSiteFeature[];
  selectedId: string | null;
  truncated: boolean;
  listLink: string;
  onSelect: (feature: MapSiteFeature) => void;
}) {
  const sorted = sortedByName(features);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">
          {sorted.length} site{sorted.length > 1 ? 's' : ''}
          {truncated ? <span className="font-normal text-muted"> dans la zone visible</span> : null}
        </p>
        <Link href={listLink} className="text-xs font-medium text-info hover:underline">
          Voir en liste
        </Link>
      </div>
      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">Aucun site positionné ne correspond à ces critères.</p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" aria-label="Sites de la carte">
          {sorted.map((feature) => {
            const Icon = SITE_TYPE_ICONS[feature.properties.site_type];
            const selected = feature.id === selectedId;
            return (
              <li key={feature.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(feature)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-subtle',
                    selected && 'bg-info-soft/60',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-md',
                      feature.properties.published
                        ? 'bg-brand-accent/15 text-brand-accent-strong'
                        : 'bg-subtle text-muted',
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {feature.properties.name}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {[SITE_TYPE_LABELS[feature.properties.site_type], feature.properties.city]
                        .filter(Boolean)
                        .join(' · ')}
                      {feature.properties.etare_number ? ` · n° ${feature.properties.etare_number}` : ''}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-xs whitespace-nowrap',
                      feature.properties.published ? 'font-medium text-brand-accent-strong' : 'text-muted',
                    )}
                  >
                    {feature.properties.published ? `Publié n° ${feature.properties.publication_number}` : 'Non publié'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
