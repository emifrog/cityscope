'use client';

import { cn } from '@etare/ui';
import Link from 'next/link';

export interface TabLink {
  readonly key: string;
  readonly label: string;
}

/** Tabs driven by a search parameter, so each tab has a shareable URL. */
export function TabLinks({
  tabs,
  active,
  param,
  basePath,
}: {
  tabs: readonly TabLink[];
  active: string;
  param: string;
  basePath: string;
}) {
  return (
    <nav aria-label="Sections" className="mb-6 border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={`${basePath}?${param}=${tab.key}`}
                aria-current={selected ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'inline-block border-b-2 px-4 py-2 text-sm',
                  selected
                    ? 'border-brand-accent font-semibold text-foreground'
                    : 'border-transparent text-muted hover:text-foreground',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
