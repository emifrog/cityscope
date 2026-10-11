'use client';

import { cn } from '@etare/ui';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Shown beside the label when known, as a small counter. */
  readonly count?: number | undefined;
}

/** A row of exclusive choices (views of a list), the chosen one raised, each with its count. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 rounded-md bg-subtle p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
              selected ? 'bg-surface font-semibold text-foreground shadow-sm' : 'text-muted hover:text-foreground',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs tabular-nums',
                  selected ? 'bg-subtle text-foreground' : 'bg-surface text-muted',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
