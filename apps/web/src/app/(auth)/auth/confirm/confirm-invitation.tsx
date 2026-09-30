'use client';

import { newPasswordSchema } from '@etare/schemas';
import { Alert, Button, Field, Input } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { supabaseBrowser } from '@/lib/supabase-browser';

const passwordForm = z
  .object({ password: newPasswordSchema, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, {
    message: 'Les deux saisies sont différentes.',
    path: ['confirmation'],
  });
type PasswordValues = z.infer<typeof passwordForm>;

const INVALID_LINK =
  'Ce lien d’invitation n’est plus valable (déjà utilisé ou expiré). Demandez une nouvelle invitation à l’administrateur de votre SIS.';

/**
 * The token is verified only when the person clicks: automatic link checkers
 * of mail systems (GET requests) cannot consume the invitation.
 */
export function ConfirmInvitation({ tokenHash }: { tokenHash: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<'activate' | 'password'>('activate');
  const [activating, setActivating] = useState(false);
  const [failure, setFailure] = useState<string | null>(tokenHash ? null : INVALID_LINK);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordForm),
    defaultValues: { password: '', confirmation: '' },
  });

  async function activate() {
    if (!tokenHash) return;
    setActivating(true);
    setFailure(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ type: 'invite', token_hash: tokenHash });
    setActivating(false);
    if (error) {
      setFailure(INVALID_LINK);
      return;
    }
    setStep('password');
  }

  const choosePassword = handleSubmit(async ({ password }) => {
    setFailure(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password });
    if (error) {
      setFailure(
        error.code === 'weak_password'
          ? 'Ce mot de passe est trop faible ou trop courant : choisissez-en un autre.'
          : 'Le mot de passe n’a pas pu être enregistré. Réessayez.',
      );
      return;
    }
    router.replace('/compte?bienvenue=1');
    router.refresh();
  });

  if (step === 'activate') {
    return (
      <div className="space-y-4">
        {failure ? <Alert tone="critical">{failure}</Alert> : null}
        <p className="text-sm text-muted">
          Activez votre compte, puis choisissez votre mot de passe pour accéder à la plateforme.
        </p>
        <Button size="lg" className="w-full" disabled={!tokenHash || activating} onClick={() => void activate()}>
          {activating ? 'Activation…' : 'Activer mon compte'}
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={choosePassword} className="space-y-4">
      {failure ? <Alert tone="critical">{failure}</Alert> : null}
      <Field
        label="Nouveau mot de passe"
        htmlFor="password"
        error={errors.password?.message}
        hint="12 caractères minimum, avec minuscules, majuscules, chiffres et symboles."
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
      </Field>
      <Field label="Confirmation" htmlFor="confirmation" error={errors.confirmation?.message}>
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirmation ? true : undefined}
          {...register('confirmation')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Enregistrement…' : 'Enregistrer et continuer'}
      </Button>
    </form>
  );
}
