'use client';

import { PRIVILEGED_PERMISSIONS, permissionsForRoles } from '@etare/domain';
import { Alert, Badge, Button, cn } from '@etare/ui';
import { LogOut, Menu, Search, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { brand } from '@/config/brand';
import { NAV_ITEMS, isActivePath } from '@/lib/navigation';
import { PRIVILEGED_ACTION_LABELS } from './labels';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';

export function TenantSwitcher() {
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

/** Privileged roles without the second factor: say what is blocked and where to enable it. */
function SecondFactorReminder() {
  const { assurance } = useSession();
  const { me, activeTenant } = useTenant();
  const pathname = usePathname();
  const blocked = [...permissionsForRoles(activeTenant?.roles ?? [])]
    .filter((permission) => PRIVILEGED_PERMISSIONS.has(permission))
    .map((permission) => PRIVILEGED_ACTION_LABELS[permission])
    .filter(Boolean);
  if (assurance !== 'aal1' || blocked.length === 0 || pathname === '/compte') return null;
  // The gate below already says it, for every access.
  if ((activeTenant?.second_factor_required || me?.user.second_factor_reenrollment) && me && !me.user.second_factor) {
    return null;
  }
  return (
    <Alert tone="important" className="mb-4">
      Votre rôle exige la double authentification pour {blocked.join(', ')}.{' '}
      <Link href="/compte" className="font-semibold underline">
        L’activer maintenant
      </Link>
    </Alert>
  );
}

/**
 * The SIS requires the second factor for every access and the person has none yet: the API refuses
 * everything but the profile, so the back-office is replaced by the way to enable it.
 */
function SecondFactorGate({ children }: { children: ReactNode }) {
  const { me, activeTenant } = useTenant();
  const pathname = usePathname();
  const removed = me?.user.second_factor_reenrollment === true;
  const blocked =
    me !== undefined && !me.user.second_factor && (removed || Boolean(activeTenant?.second_factor_required));
  if (!blocked || pathname === '/compte') return children;
  return (
    <Alert tone="important" className="max-w-2xl">
      <p className="font-semibold">
        {removed
          ? 'Votre double authentification a été retirée.'
          : `${activeTenant?.tenant_name ?? 'Votre SIS'} exige la double authentification.`}
      </p>
      <p className="mt-1">
        Activez-la dans votre compte avant de continuer : un code généré par une application de votre téléphone vous
        sera demandé à chaque connexion.
      </p>
      <Link href="/compte" className="mt-2 inline-block font-semibold underline">
        Activer la double authentification
      </Link>
    </Alert>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const { me, activeTenant } = useTenant();
  // Exploitants (and people invited but not yet members) have no back-office: their space is the portal.
  const portalOnly = me !== undefined && !(activeTenant?.roles.some((role) => role !== 'EXPLOITANT') ?? false);
  useEffect(() => {
    if (portalOnly) router.replace('/portail');
  }, [portalOnly, router]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    router.push(q ? `/sites?q=${encodeURIComponent(q)}` : '/sites');
  }

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
        <Link href="/" className="shrink-0">
          <Image src={brand.logoInverse} alt={brand.productName} priority className="h-8 w-auto" />
        </Link>
        <form role="search" onSubmit={search} className="mx-auto hidden w-full max-w-xl lg:block">
          <label className="relative block">
            <span className="sr-only">Rechercher un site</span>
            <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/60" />
            <input
              name="q"
              type="search"
              minLength={2}
              placeholder="Rechercher un site, une adresse, un n° ETARE…"
              className="h-10 w-full rounded-md border border-white/15 bg-brand-navy-soft pr-3 pl-9 text-sm text-white placeholder:text-white/60"
            />
          </label>
        </form>
        <div className="ml-auto flex items-center gap-3">
          <TenantSwitcher />
          <Link
            href="/compte"
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-white/80 hover:bg-brand-navy-soft hover:text-white"
          >
            <UserRound aria-hidden="true" className="size-4" />
            <span className="sr-only xl:not-sr-only">{session?.user.email ?? 'Mon compte'}</span>
          </Link>
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
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <SecondFactorReminder />
          <SecondFactorGate>{children}</SecondFactorGate>
        </main>
      </div>
    </div>
  );
}
