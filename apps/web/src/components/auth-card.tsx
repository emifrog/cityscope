import type { ReactNode } from 'react';
import { brand } from '@/config/brand';

/** Frame of the pages shown before or during sign-in (login, second factor, invitation). */
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-md rounded-card bg-surface p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden="true" className="text-2xl text-brand-accent">
            {brand.logoGlyph}
          </span>
          <div>
            <p className="text-lg font-bold text-foreground">{brand.productName}</p>
            <p className="text-sm text-muted">{brand.tagline}</p>
          </div>
        </div>
        <h1 className="mb-4 text-xl font-semibold">{title}</h1>
        {children}
        {footer ? <p className="mt-6 text-xs text-muted">{footer}</p> : null}
      </div>
    </main>
  );
}
