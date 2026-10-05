'use client';

import { Button, Input } from '@etare/ui';
import { useDeferredValue, useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import { useSites } from '@/lib/queries';

/** Sites of the SIS chosen one by one: search, then tick (exploitant access, sectors, perimeters). */
export function SitePicker({
  legend,
  selected,
  onChange,
}: {
  legend: string;
  selected: ReadonlyMap<string, string>;
  onChange: (next: ReadonlyMap<string, string>) => void;
}) {
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());
  const sites = useSites(q.length >= 2 ? { q } : {}, 10);
  const found = sites.data?.pages.flatMap((page) => page.items) ?? [];
  const toggle = (id: string, name: string) => {
    const next = new Map(selected);
    if (next.has(id)) next.delete(id);
    else next.set(id, name);
    onChange(next);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">{legend}</legend>
      {selected.size > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Sites choisis">
          {[...selected].map(([id, name]) => (
            <li key={id}>
              <Button type="button" size="sm" variant="secondary" onClick={() => toggle(id, name)}>
                {name} <span aria-hidden="true">×</span>
                <span className="sr-only">(retirer)</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        aria-label="Rechercher un site"
        placeholder="Rechercher un site (nom, adresse, n° ETARE)"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {sites.error ? <ApiErrorAlert error={sites.error} /> : null}
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        {found.map((site) => (
          <li key={site.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand-accent"
                checked={selected.has(site.id)}
                onChange={() => toggle(site.id, site.name)}
              />
              <span>
                {site.name}
                {site.address?.city ? <span className="text-muted"> · {site.address.city}</span> : null}
              </span>
            </label>
          </li>
        ))}
        {sites.isSuccess && found.length === 0 ? <li className="text-sm text-muted">Aucun site trouvé.</li> : null}
      </ul>
    </fieldset>
  );
}
