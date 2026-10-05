'use client';

import { ApiErrorAlert } from '@/components/feedback';
import { useSectors } from '@/lib/queries';

export interface SectorSelection {
  /** The whole SIS, explicitly (no sector). */
  readonly whole: boolean;
  readonly sectorIds: readonly string[];
}

/**
 * Whole SIS or sectors (PER-01): the perimeter of a terminal, and of a member
 * together with the sites chosen one by one.
 */
export function SectorChoice({
  name,
  wholeLabel,
  limitedLabel,
  value,
  onChange,
  children,
}: {
  name: string;
  wholeLabel: string;
  limitedLabel: string;
  value: SectorSelection;
  onChange: (next: SectorSelection) => void;
  /** Shown under the limited choice (sites of a member). */
  children?: React.ReactNode;
}) {
  const sectors = useSectors();
  const toggle = (id: string) =>
    onChange({
      whole: false,
      sectorIds: value.sectorIds.includes(id)
        ? value.sectorIds.filter((item) => item !== id)
        : [...value.sectorIds, id],
    });
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">Affectation</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={name}
          className="size-4 accent-brand-accent"
          checked={value.whole}
          onChange={() => onChange({ whole: true, sectorIds: [] })}
        />
        {wholeLabel}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="radio"
          name={name}
          className="size-4 accent-brand-accent"
          checked={!value.whole}
          onChange={() => onChange({ whole: false, sectorIds: value.sectorIds })}
        />
        {limitedLabel}
      </label>
      {!value.whole ? (
        <div className="space-y-3 pl-6">
          {sectors.error ? <ApiErrorAlert error={sectors.error} /> : null}
          {sectors.data && sectors.data.items.length === 0 ? (
            <p className="text-sm text-muted">Aucun secteur : créez-en dans l’onglet Secteurs.</p>
          ) : null}
          <ul className="grid gap-1 sm:grid-cols-2">
            {(sectors.data?.items ?? []).map((sector) => (
              <li key={sector.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-brand-accent"
                    checked={value.sectorIds.includes(sector.id)}
                    onChange={() => toggle(sector.id)}
                  />
                  <span>
                    {sector.name} <span className="text-muted">· {sector.site_count} site(s)</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {children}
        </div>
      ) : null}
    </fieldset>
  );
}
