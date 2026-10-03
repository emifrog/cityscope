'use client';

import { newPasswordSchema, totpCodeSchema } from '@etare/schemas';
import { Alert, Button, Field, Input } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { MfaError, listTotpFactors, verifyTotp } from '@/lib/mfa';
import { supabaseBrowser } from '@/lib/supabase-browser';

const passwordForm = z
  .object({ password: newPasswordSchema, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, {
    message: 'Les deux saisies sont différentes.',
    path: ['confirmation'],
  });
type PasswordValues = z.infer<typeof passwordForm>;

const INVALID_LINK = {
  invite:
    'Ce lien d’invitation n’est plus valable (déjà utilisé ou expiré). Demandez une nouvelle invitation à l’administrateur de votre SIS.',
  recovery:
    'Ce lien n’est plus valable (déjà utilisé ou expiré). Demandez un nouveau lien depuis la page de connexion.',
} as const;

const codeForm = z.object({ code: totpCodeSchema });

/** A protected account presents its code before choosing a new password (the provider requires it). */
function CodeStep({ factorId, onVerified }: { factorId: string; onVerified: () => void }) {
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof codeForm>>({ resolver: zodResolver(codeForm), defaultValues: { code: '' } });
  return (
    <form
      noValidate
      method="post"
      className="space-y-4"
      onSubmit={handleSubmit(async ({ code }) => {
        setFailure(null);
        try {
          await verifyTotp(factorId, code);
          onVerified();
        } catch (error) {
          setFailure(error instanceof MfaError ? error.message : 'La vérification a échoué. Réessayez.');
        }
      })}
    >
      <p className="text-sm text-muted">
        Votre compte est protégé par la double authentification : saisissez le code de votre application avant de
        choisir un nouveau mot de passe. Téléphone perdu : demandez à l’administrateur de votre SIS de réinitialiser
        votre double authentification.
      </p>
      {failure ? <Alert tone="critical">{failure}</Alert> : null}
      <Field label="Code de vérification" htmlFor="code" error={errors.code?.message}>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          className="text-center text-lg tracking-[0.5em]"
          {...register('code')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Vérification…' : 'Valider'}
      </Button>
    </form>
  );
}

/**
 * The token is verified only when the person clicks: automatic link checkers of mail
 * systems (GET requests) cannot consume the invitation nor the password reset.
 */
export function ConfirmInvitation({ tokenHash, kind }: { tokenHash: string | null; kind: 'invite' | 'recovery' }) {
  const router = useRouter();
  const [step, setStep] = useState<'activate' | 'code' | 'password'>('activate');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [failure, setFailure] = useState<string | null>(tokenHash ? null : INVALID_LINK[kind]);
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
    const { error } = await supabaseBrowser().auth.verifyOtp({ type: kind, token_hash: tokenHash });
    setActivating(false);
    if (error) {
      setFailure(INVALID_LINK[kind]);
      return;
    }
    const factor = kind === 'recovery' ? (await listTotpFactors().catch(() => []))[0] : undefined;
    if (factor) {
      setFactorId(factor.id);
      setStep('code');
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
    if (kind === 'recovery') {
      // Whoever knew the former password is signed out everywhere else.
      await supabaseBrowser()
        .auth.signOut({ scope: 'others' })
        .catch(() => undefined);
      router.replace('/compte');
    } else {
      router.replace('/compte?bienvenue=1');
    }
    router.refresh();
  });

  if (step === 'code' && factorId) return <CodeStep factorId={factorId} onVerified={() => setStep('password')} />;

  if (step === 'activate') {
    return (
      <div className="space-y-4">
        {failure ? <Alert tone="critical">{failure}</Alert> : null}
        <p className="text-sm text-muted">
          {kind === 'recovery'
            ? 'Confirmez la demande, puis choisissez votre nouveau mot de passe. Vos autres sessions seront fermées.'
            : 'Activez votre compte, puis choisissez votre mot de passe pour accéder à la plateforme.'}
        </p>
        <Button size="lg" className="w-full" disabled={!tokenHash || activating} onClick={() => void activate()}>
          {activating
            ? 'Vérification…'
            : kind === 'recovery'
              ? 'Choisir un nouveau mot de passe'
              : 'Activer mon compte'}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      // POST: a submission before hydration never puts credentials in the URL (history, logs).
      method="post"
      onSubmit={choosePassword}
      className="space-y-4"
    >
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
