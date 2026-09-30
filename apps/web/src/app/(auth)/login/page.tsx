import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { safeNextPath } from '@/lib/navigation';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Connexion' };

export default async function LoginPage(props: PageProps<'/login'>) {
  const params = await props.searchParams;
  const next = safeNextPath(typeof params['next'] === 'string' ? params['next'] : null);

  return (
    <AuthCard
      title="Connexion"
      footer="Accès réservé aux personnels habilités. Les comptes sont créés par l’administrateur de votre SIS."
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
