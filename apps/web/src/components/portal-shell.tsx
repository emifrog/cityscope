'use client';

import { Button } from '@etare/ui';
import { LogOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { brand } from '@/config/brand';
import { useSession } from '@/providers/session-provider';
import { TenantSwitcher } from './app-shell';

/**
 * Frame of the exploitant portal: deliberately apart from the back-office of
 * the SIS (no navigation into working data, ADR-019).
 */
export function PortalShell({ children }: { children: ReactNode }) {
  const { session, signOut } = useSession();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center gap-4 bg-brand-navy px-4 text-white">
        <Link href="/portail" className="flex shrink-0 items-center gap-3">
          <Image src={brand.logoInverse} alt={brand.productName} priority className="h-8 w-auto" />
          <span className="hidden border-l border-white/30 pl-3 text-sm font-semibold sm:inline">
            Portail exploitant
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <TenantSwitcher />
          <span className="sr-only text-sm text-white/80 xl:not-sr-only">{session?.user.email}</span>
          <Button variant="inverse" size="sm" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" className="size-4" />
            <span className="sr-only lg:not-sr-only">Déconnexion</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
