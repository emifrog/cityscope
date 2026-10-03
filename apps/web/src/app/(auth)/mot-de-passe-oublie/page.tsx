import type { Metadata } from 'next';
import { AuthCard } from '@/components/auth-card';
import { ForgottenPasswordForm } from './forgotten-password-form';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgottenPasswordPage() {
  return (
    <AuthCard
      title="Mot de passe oublié"
      footer="Si votre compte est protégé par la double authentification, votre code vous sera demandé avant de choisir le nouveau mot de passe."
    >
      <ForgottenPasswordForm />
    </AuthCard>
  );
}
