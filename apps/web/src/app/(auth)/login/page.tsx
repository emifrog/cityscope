import type { Metadata } from 'next';
import { brand } from '@/config/brand';
import { safeNextPath } from '@/lib/navigation';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Connexion' };

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams;
  const next = safeNextPath(typeof params['next'] === 'string' ? params['next'] : null);

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
        <h1 className="mb-4 text-xl font-semibold">Connexion</h1>
        <LoginForm next={next} />
        <p className="mt-6 text-xs text-muted">
          Accès réservé aux personnels habilités. Les comptes sont créés par l’administrateur de votre SIS.
        </p>
      </div>
    </main>
  );
}
