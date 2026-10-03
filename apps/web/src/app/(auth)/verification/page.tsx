import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { safeNextPath } from '@/lib/navigation';
import { VerificationForm } from './verification-form';

export const metadata: Metadata = { title: 'Double authentification' };

export default async function VerificationPage(props: PageProps<'/verification'>) {
  const params = await props.searchParams;
  const next = safeNextPath(typeof params['next'] === 'string' ? params['next'] : null);

  return (
    <AuthCard
      title="Double authentification"
      footer="Sans téléphone ni code de secours, l’administrateur de votre SIS peut réinitialiser votre double authentification."
    >
      <VerificationForm next={next} />
    </AuthCard>
  );
}
