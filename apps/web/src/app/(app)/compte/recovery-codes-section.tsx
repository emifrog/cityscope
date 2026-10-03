'use client';

import { Alert, Button, Skeleton } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useMyRecoveryCodes } from '@/lib/queries';
import { useSession } from '@/providers/session-provider';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

/** Text file of the codes, saved by the person (nothing leaves the browser). */
function codesFile(codes: readonly string[], email: string): string {
  return [
    `Codes de secours FireScape — ${email}`,
    `Générés le ${dateFormat.format(new Date())}. Chaque code ne sert qu’une fois.`,
    '',
    ...codes,
    '',
    'Conservez-les hors de votre téléphone. Un code utilisé retire votre double authentification :',
    'vous en activerez une nouvelle et générerez de nouveaux codes.',
  ].join('\n');
}

/**
 * Recovery codes of an enrolled account: how many remain, and ten new ones shown once (the
 * previous ones stop working). They replace a lost telephone without calling the SIS.
 */
export function RecoveryCodesSection() {
  const { session } = useSession();
  const userId = session?.user.id ?? 'none';
  const state = useMyRecoveryCodes();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const regenerate = useApiMutation(
    (options, _: void) => api.regenerateMyRecoveryCodes(options),
    () => [queryKeys.myRecoveryCodes(userId)],
  );

  if (state.isPending) return <Skeleton className="h-10 w-full" />;
  if (state.error) return <ApiErrorAlert error={state.error} />;

  function download(list: readonly string[]) {
    const url = URL.createObjectURL(
      new Blob([codesFile(list, session?.user.email ?? '')], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'codes-de-secours-firescape.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-semibold">Codes de secours</p>
      {regenerate.error ? <ApiErrorAlert error={regenerate.error} /> : null}
      {codes ? (
        <div className="space-y-3">
          <Alert tone="important">
            Notez ou téléchargez ces codes maintenant : ils ne seront plus affichés. Les anciens ne valent plus.
          </Alert>
          <ol className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5">
            {codes.map((code) => (
              <li key={code} className="rounded-md border border-border bg-subtle px-2 py-1 text-center select-all">
                {code}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => download(codes)}>
              Télécharger
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void navigator.clipboard?.writeText(codes.join('\n')).then(
                  () => setCopied(true),
                  () => undefined,
                )
              }
            >
              {copied ? 'Copiés' : 'Copier'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCodes(null)}>
              Je les ai conservés
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            {state.data.remaining === 0
              ? 'Aucun code de secours : générez-en pour pouvoir vous connecter si vous perdez votre téléphone.'
              : `${state.data.remaining} code(s) restant(s)${
                  state.data.generated_at ? `, générés le ${dateFormat.format(new Date(state.data.generated_at))}` : ''
                }. Chacun remplace une fois votre téléphone.`}
          </p>
          <Button
            size="sm"
            variant={state.data.remaining === 0 ? 'primary' : 'secondary'}
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate(undefined, { onSuccess: (result) => setCodes(result.codes) })}
          >
            {regenerate.isPending
              ? 'Génération…'
              : state.data.remaining === 0
                ? 'Générer mes codes de secours'
                : 'Générer de nouveaux codes'}
          </Button>
        </div>
      )}
    </div>
  );
}
