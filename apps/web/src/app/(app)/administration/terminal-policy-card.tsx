'use client';

import type { TerminalPolicySettings } from '@etare/contracts';
import { TERMINAL_POLICY_BOUNDS } from '@etare/domain';
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useTerminalPolicy } from '@/lib/queries';

type NumericSetting = keyof typeof TERMINAL_POLICY_BOUNDS;

const NUMERIC_SETTINGS: readonly { name: NumericSetting; label: string; unit: string; hint: string }[] = [
  {
    name: 'idle_lock_minutes',
    label: 'Verrouillage après inactivité',
    unit: 'minutes',
    hint: 'Sans aucun toucher pendant cette durée, la tablette redemande le code personnel.',
  },
  {
    name: 'background_lock_seconds',
    label: 'Verrouillage en quittant l’application',
    unit: 'secondes',
    hint: '0 : dès que l’agent quitte l’application ou éteint l’écran.',
  },
  {
    name: 'max_days_without_login',
    label: 'Reconnexion par mot de passe',
    unit: 'jours',
    hint: 'Au-delà, l’agent doit se reconnecter en ligne avec son mot de passe.',
  },
  {
    name: 'offline_authorization_days',
    label: 'Consultation hors ligne',
    unit: 'jours',
    hint: 'Durée de consultation sans nouvelle synchronisation ; ensuite la tablette se verrouille sans rien effacer.',
  },
];

/** Lock and session policy of the tablets (SEC-05, ADR-029): followed at the next catalogue of each tablet. */
export function TerminalPolicyCard() {
  const policy = useTerminalPolicy();
  const [draft, setDraft] = useState<Record<string, string | boolean> | null>(null);
  const save = useApiMutation(
    (options, input: TerminalPolicySettings) => api.updateTerminalPolicy(options, input),
    (tenantId) => [queryKeys.terminalPolicy(tenantId), queryKeys.devices(tenantId)],
  );

  if (policy.isPending) return <LoadingCard lines={4} />;
  if (policy.error) return <ApiErrorAlert error={policy.error} />;
  const saved = policy.data;
  const value = (name: NumericSetting) => String(draft?.[name] ?? saved[name]);
  const screenshots =
    typeof draft?.screenshots_allowed === 'boolean' ? draft.screenshots_allowed : saved.screenshots_allowed;
  const problems = NUMERIC_SETTINGS.filter(({ name }) => {
    const number = Number(value(name));
    const bounds = TERMINAL_POLICY_BOUNDS[name];
    return !Number.isInteger(number) || number < bounds.min || number > bounds.max;
  }).map(({ name }) => name);
  const next: TerminalPolicySettings = {
    idle_lock_minutes: Number(value('idle_lock_minutes')),
    background_lock_seconds: Number(value('background_lock_seconds')),
    screenshots_allowed: screenshots,
    max_days_without_login: Number(value('max_days_without_login')),
    offline_authorization_days: Number(value('offline_authorization_days')),
  };
  const changed = (Object.keys(next) as (keyof TerminalPolicySettings)[]).some((name) => next[name] !== saved[name]);
  const update = (name: string, input: string | boolean) => setDraft({ ...(draft ?? {}), [name]: input });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Politique des tablettes</CardTitle>
        <CardDescription>
          Chaque tablette applique la politique reçue à sa dernière synchronisation. Le code personnel est toujours
          demandé au démarrage de l’application.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {save.error ? <ApiErrorAlert error={save.error} /> : null}
        {save.isSuccess && !changed ? (
          <Alert tone="info">Politique enregistrée et tracée : les tablettes la suivent à leur prochain contact.</Alert>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {NUMERIC_SETTINGS.map((setting) => {
            const bounds = TERMINAL_POLICY_BOUNDS[setting.name];
            const id = `terminal-policy-${setting.name}`;
            return (
              <Field
                key={setting.name}
                label={`${setting.label} (${setting.unit})`}
                htmlFor={id}
                hint={`${setting.hint} Entre ${bounds.min} et ${bounds.max}.`}
                error={
                  problems.includes(setting.name) ? `Entre ${bounds.min} et ${bounds.max} ${setting.unit}.` : undefined
                }
              >
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={bounds.min}
                  max={bounds.max}
                  step={1}
                  value={value(setting.name)}
                  aria-invalid={problems.includes(setting.name)}
                  onChange={(event) => update(setting.name, event.target.value)}
                />
              </Field>
            );
          })}
        </div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-brand-accent"
            checked={screenshots}
            onChange={(event) => update('screenshots_allowed', event.target.checked)}
          />
          <span>
            <span className="font-semibold">Autoriser les captures d’écran</span>
            <span className="block text-sm text-muted">
              Déconseillé : une capture copie hors de l’application des données opérationnelles. Sans autorisation,
              l’aperçu dans la liste des applications récentes est aussi masqué.
            </span>
          </span>
        </label>
        <Button
          size="sm"
          disabled={!changed || problems.length > 0 || save.isPending}
          onClick={() => save.mutate(next, { onSuccess: () => setDraft(null) })}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
}
