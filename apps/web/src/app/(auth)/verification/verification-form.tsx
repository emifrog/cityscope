'use client';

import { recoveryCodeUseSchema, type RecoveryCodeUse } from '@etare/contracts';
import { totpCodeSchema } from '@etare/schemas';
import { Alert, Button, Field, Input } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiRequestError, api } from '@/lib/api-client';
import { MfaError, listTotpFactors, verifyTotp } from '@/lib/mfa';
import { supabaseBrowser } from '@/lib/supabase-browser';

const formSchema = z.object({ code: totpCodeSchema });
type FormValues = z.infer<typeof formSchema>;

/**
 * Lost telephone: a recovery code replaces the second factor once. The API removes the factor,
 * closes the other sessions and alerts the person; a new factor is then required (Mon compte).
 */
function RecoveryForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecoveryCodeUse>({ resolver: zodResolver(recoveryCodeUseSchema), defaultValues: { code: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.replace('/login');
      return;
    }
    try {
      await api.recoverSecondFactor({ token: data.session.access_token }, values);
      // The factor is gone: the session no longer awaits a code, and the profile has changed.
      await supabase.auth.refreshSession();
      queryClient.clear();
      router.replace('/compte');
      router.refresh();
    } catch (error) {
      setFailure(error instanceof ApiRequestError ? error.message : 'La vérification a échoué. Réessayez.');
    }
  });

  return (
    <form noValidate method="post" onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted">
        Saisissez l’un de vos codes de secours. Votre double authentification sera retirée : vous en activerez une
        nouvelle aussitôt après, et vos autres sessions seront fermées.
      </p>
      {failure ? <Alert tone="critical">{failure}</Alert> : null}
      <Field label="Code de secours" htmlFor="recovery-code" error={errors.code?.message}>
        <Input
          id="recovery-code"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={11}
          autoFocus
          placeholder="XXXXX-XXXXX"
          aria-invalid={errors.code ? true : undefined}
          className="text-center font-mono text-lg tracking-widest"
          {...register('code')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Vérification…' : 'Utiliser ce code'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
        Revenir au code de l’application
      </Button>
    </form>
  );
}

/** Second step of the sign-in for people who enabled the double authentication. */
export function VerificationForm({ next }: { next: string }) {
  const router = useRouter();
  const [recovery, setRecovery] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { code: '' } });

  useEffect(() => {
    let active = true;
    listTotpFactors()
      .then(async (factors) => {
        if (!active) return;
        const factor = factors[0];
        if (factor) {
          setFactorId(factor.id);
          return;
        }
        // No factor any more (removed elsewhere): refresh the session, nothing to verify.
        await supabaseBrowser().auth.refreshSession();
        router.replace(next);
      })
      .catch(() => {
        if (active) setFailure('Le service d’authentification est injoignable.');
      });
    return () => {
      active = false;
    };
  }, [next, router]);

  const onSubmit = handleSubmit(async ({ code }) => {
    if (!factorId) return;
    setFailure(null);
    try {
      await verifyTotp(factorId, code);
      router.replace(next);
      router.refresh();
    } catch (error) {
      setFailure(error instanceof MfaError ? error.message : 'La vérification a échoué. Réessayez.');
    }
  });

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (recovery) return <RecoveryForm onCancel={() => setRecovery(false)} />;

  return (
    <form
      noValidate
      // POST: a submission before hydration never puts credentials in the URL (history, logs).
      method="post"
      onSubmit={onSubmit}
      className="space-y-4"
    >
      <p className="text-sm text-muted">
        Saisissez le code à 6 chiffres affiché par votre application d’authentification.
      </p>
      {failure ? <Alert tone="critical">{failure}</Alert> : null}
      <Field label="Code de vérification" htmlFor="code" error={errors.code?.message}>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          aria-invalid={errors.code ? true : undefined}
          className="text-center text-lg tracking-[0.5em]"
          {...register('code')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || !factorId}>
        {isSubmitting ? 'Vérification…' : 'Valider'}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => setRecovery(true)}>
        Téléphone perdu : utiliser un code de secours
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </form>
  );
}
