import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { ConfirmInvitation } from './confirm-invitation';

export const metadata: Metadata = { title: 'Activation du compte' };

export default async function ConfirmPage(props: PageProps<'/auth/confirm'>) {
  const params = await props.searchParams;
  const tokenHash = typeof params['token_hash'] === 'string' ? params['token_hash'] : null;
  const type = params['type'] === 'invite' ? 'invite' : null;

  return (
    <AuthCard
      title="Activation de votre compte"
      footer="Votre accès a été ouvert par l’administrateur de votre SIS. Ce lien est personnel."
    >
      <ConfirmInvitation tokenHash={type ? tokenHash : null} />
    </AuthCard>
  );
}
