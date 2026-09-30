'use client';

import { totpCodeSchema } from '@etare/schemas';
import { Alert, Button, Field, Input } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { MfaError, listTotpFactors, verifyTotp } from '@/lib/mfa';
import { supabaseBrowser } from '@/lib/supabase-browser';

const formSchema = z.object({ code: totpCodeSchema });
type FormValues = z.infer<typeof formSchema>;

/** Second step of the sign-in for people who enabled the double authentication. */
export function VerificationForm({ next }: { next: string }) {
  const router = useRouter();
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

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
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
      <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </form>
  );
}
