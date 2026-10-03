'use client';

import { loginSchema } from '@etare/schemas';
import { Alert, Button, Field, Input } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { supabaseBrowser } from '@/lib/supabase-browser';

const formSchema = loginSchema.pick({ email: true });
type FormValues = z.infer<typeof formSchema>;

/**
 * Sends the reset link by e-mail. The answer is the same whether the address has an account
 * or not: the page reveals nothing about the accounts of the platform.
 */
export function ForgottenPasswordForm() {
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFailure(null);
    try {
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email);
      if (error?.status === 429) {
        setFailure('Trop de demandes : réessayez dans quelques minutes.');
        return;
      }
      setSent(true);
    } catch {
      setFailure('Le service d’authentification est injoignable.');
    }
  });

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert tone="info">
          Si un compte existe pour cette adresse, un e-mail vient d’être envoyé avec un lien valable une heure.
        </Alert>
        <Link href="/login" className="block text-center text-sm text-info underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form noValidate method="post" onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-muted">
        Indiquez votre adresse professionnelle : vous recevrez un lien pour choisir un nouveau mot de passe.
      </p>
      {failure ? <Alert tone="critical">{failure}</Alert> : null}
      <Field label="Adresse e-mail professionnelle" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Envoi…' : 'Recevoir le lien'}
      </Button>
      <Link href="/login" className="block text-center text-sm text-info underline">
        Retour à la connexion
      </Link>
    </form>
  );
}
