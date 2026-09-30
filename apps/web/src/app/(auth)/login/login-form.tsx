'use client';

import { loginSchema, type LoginInput } from '@etare/schemas';
import { Alert, Button, FieldError, Input, Label } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { needsSecondFactor } from '@/lib/mfa';
import { supabaseBrowser } from '@/lib/supabase-browser';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword(values);
      if (error) {
        setFailure(
          error.status === 400 ? 'Identifiant ou mot de passe incorrect.' : 'Connexion impossible pour le moment.',
        );
        return;
      }
      // People who enabled the double authentication present their code before anything else.
      router.replace((await needsSecondFactor()) ? `/verification?next=${encodeURIComponent(next)}` : next);
      router.refresh();
    } catch {
      setFailure('Le service d’authentification est injoignable.');
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      {failure ? <Alert tone="critical">{failure}</Alert> : null}
      <div>
        <Label htmlFor="email">Adresse e-mail professionnelle</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className="mt-1"
          {...register('email')}
        />
        {errors.email ? <FieldError id="email-error">{errors.email.message}</FieldError> : null}
      </div>
      <div>
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          className="mt-1"
          {...register('password')}
        />
        {errors.password ? <FieldError id="password-error">{errors.password.message}</FieldError> : null}
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}
