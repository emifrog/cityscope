'use client';

import { Badge, Button, cn } from '@etare/ui';
import { LogOut, Menu, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { brand } from '@/config/brand';
import { NAV_ITEMS, isActivePath } from '@/lib/navigation';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';

function TenantSwitcher() {
  const { memberships, activeTenant, setActiveTenant } = useTenant();
  if (!activeTenant) return null;
  if (memberships.length === 1) {
    return <span className="text-sm font-semibold whitespace-nowrap text-white">{activeTenant.tenant_name}</span>;
  }
  return (
    <label className="flex items-center gap-2 text-sm text-white">
      <span className="sr-only">SIS actif</span>
      <select
        value={activeTenant.tenant_id}
        onChange={(event) => setActiveTenant(event.target.value)}
        className="h-9 rounded-md border border-white/20 bg-brand-navy-soft px-2 font-semibold text-white"
      >
        {memberships.map((m) => (
          <option key={m.tenant_id} value={m.tenant_id}>
            {m.tenant_name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center gap-4 bg-brand-navy px-4 text-white">
        <Button
          variant="inverse"
          size="sm"
          className="md:hidden"
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Menu aria-hidden="true" className="size-5" />
          <span className="sr-only">Menu</span>
        </Button>
        <Link href="/" className="flex items-center gap-2 font-bold whitespace-nowrap">
          <span aria-hidden="true" className="text-brand-accent">
            {brand.logoGlyph}
          </span>
          <span>{brand.productName}</span>
        </Link>
        <div className="mx-auto hidden w-full max-w-xl lg:block">
          <label className="relative block">
            <span className="sr-only">Recherche</span>
            <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/60" />
            <input
              disabled
              placeholder="Rechercher un site, une adresse, un ETARE… (bientôt)"
              className="h-10 w-full rounded-md border border-white/15 bg-brand-navy-soft pr-3 pl-9 text-sm text-white placeholder:text-white/60"
            />
          </label>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <TenantSwitcher />
          <span className="hidden text-sm text-white/80 xl:inline">{session?.user.email}</span>
          <Button variant="inverse" size="sm" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" className="size-4" />
            <span className="sr-only lg:not-sr-only">Déconnexion</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <nav
          id="main-navigation"
          aria-label="Navigation principale"
          className={cn('w-60 shrink-0 border-r border-border bg-surface p-3', menuOpen ? 'block' : 'hidden md:block')}
        >
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center justify-between rounded-md px-3 py-2 text-sm',
                      active ? 'bg-info-soft font-semibold text-info' : 'text-foreground hover:bg-subtle',
                    )}
                  >
                    {item.label}
                    {item.comingIn ? <Badge>Bientôt</Badge> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 px-3 text-xs text-muted">Back-office SIS</p>
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
