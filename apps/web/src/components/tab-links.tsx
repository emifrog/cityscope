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
    // One line, scrolled sideways when narrow (the edges bleed into the page gutter on a phone).
    <nav
      aria-label="Sections"
      className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      <ul className="-mb-px flex w-max min-w-full gap-1">
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <li key={tab.key}>
              <Link
                href={`${basePath}?${param}=${tab.key}`}
                aria-current={selected ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'inline-block border-b-2 px-4 py-2 text-sm whitespace-nowrap',
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
