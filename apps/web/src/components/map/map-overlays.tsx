'use client';

import type { MapCatalog } from '@etare/contracts';
import { Alert, cn } from '@etare/ui';
import { baseMaps } from './map-style';

export function BaseMapSwitch({
  catalog,
  active,
  onChange,
}: {
  catalog: MapCatalog;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div role="group" aria-label="Fond de carte" className="flex overflow-hidden rounded-md bg-surface shadow">
      {baseMaps(catalog).map((source) => (
        <button
          key={source.id}
          type="button"
          aria-pressed={source.id === active}
          onClick={() => onChange(source.id)}
          className={cn(
            'px-3 py-1.5 text-xs font-semibold',
            source.id === active ? 'bg-brand-navy text-white' : 'text-foreground hover:bg-subtle',
          )}
        >
          {source.product}
        </button>
      ))}
    </div>
  );
}

export function BaseMapUnavailable() {
  return (
    <Alert tone="important" className="pointer-events-auto max-w-xs">
      Fond de carte indisponible : les données du SIS restent affichées. Essayez l’autre fond ou réessayez plus tard.
    </Alert>
  );
}
