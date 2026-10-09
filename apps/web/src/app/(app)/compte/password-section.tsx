'use client';

import { newPasswordSchema } from '@etare/schemas';
import { Alert, Button, Field, Input } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { queryKeys } from '@/lib/queries';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useSession } from '@/providers/session-provider';

const passwordForm = z
  .object({ password: newPasswordSchema, confirmation: z.string() })
  .refine((values) => values.password === values.confirmation, {
    message: 'Les deux saisies sont différentes.',
    path: ['confirmation'],
  });
type PasswordValues = z.infer<typeof passwordForm>;

const FAILURES: Readonly<Record<string, string>> = {
  weak_password: 'Ce mot de passe est trop faible ou trop courant : choisissez-en un autre.',
  same_password: 'C’est déjà votre mot de passe : choisissez-en un nouveau.',
  insufficient_aal: 'Reconnectez-vous avec votre code de double authentification avant de changer de mot de passe.',
};

/**
 * New password chosen by the signed-in person (the provider checks its rules). The other
 * sessions are closed afterwards: whoever knew the former password is signed out.
 */
export function PasswordSection() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordForm),
    defaultValues: { password: '', confirmation: '' },
  });

  const submit = handleSubmit(async ({ password }) => {
    setFailure(null);
    const auth = supabaseBrowser().auth;
    const { error } = await auth.updateUser({ password });
    if (error) {
      setFailure(FAILURES[error.code ?? ''] ?? 'Le mot de passe n’a pas pu être enregistré. Réessayez.');
      return;
    }
    await auth.signOut({ scope: 'others' }).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: queryKeys.mySessions(session?.user.id ?? 'none') });
    reset();
    setEditing(false);
    setDone(true);
  });

  if (!editing) {
    return (
      <div className="space-y-3">
        {done ? (
          <Alert tone="info">Mot de passe modifié. Vos autres sessions ont été fermées.</Alert>
        ) : (
          <p className="text-sm text-muted">
            Changer de mot de passe ferme vos autres sessions : navigateurs et tablettes devront se reconnecter.
          </p>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setDone(false);
            setEditing(true);
          }}
        >
          Modifier mon mot de passe
        </Button>
      </div>
    );
  }

  return (
    <form noValidate method="post" onSubmit={submit} className="max-w-md space-y-4">
      {failure ? <Alert tone="critical">{failure}</Alert> : null}
      <Field
        label="Nouveau mot de passe"
        htmlFor="new-password"
        error={errors.password?.message}
        hint="12 caractères minimum, avec minuscules, majuscules, chiffres et symboles."
      >
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
      </Field>
      <Field label="Confirmation" htmlFor="new-password-confirmation" error={errors.confirmation?.message}>
        <Input
          id="new-password-confirmation"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirmation ? true : undefined}
          {...register('confirmation')}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => {
            reset();
            setFailure(null);
            setEditing(false);
          }}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
