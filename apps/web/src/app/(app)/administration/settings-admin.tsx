'use client';

import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, usePortalSettings } from '@/lib/queries';

/** Settings of the SIS: second factor of the exploitants (ADR-019). */
export function SettingsAdmin() {
  const settings = usePortalSettings();
  const [mfaRequired, setMfaRequired] = useState<boolean | null>(null);
  const save = useApiMutation(
    (options, input: { mfa_required: boolean }) => api.updatePortalSettings(options, input),
    (tenantId) => [queryKeys.portalSettings(tenantId)],
  );

  if (settings.isPending) return <LoadingCard lines={3} />;
  if (settings.error) return <ApiErrorAlert error={settings.error} />;
  const current = mfaRequired ?? settings.data.mfa_required;
  const changed = current !== settings.data.mfa_required;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portail exploitant</CardTitle>
        <CardDescription>
          Les exploitants invités consultent une partie de la version publiée de leurs sites et proposent des mises à
          jour, instruites par la Prévision.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {save.error ? <ApiErrorAlert error={save.error} /> : null}
        {save.isSuccess && !changed ? <Alert tone="info">Réglage enregistré.</Alert> : null}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-brand-accent"
            checked={current}
            onChange={(event) => setMfaRequired(event.target.checked)}
          />
          <span>
            <span className="font-semibold">Exiger la double authentification des exploitants</span>
            <span className="block text-sm text-muted">
              Recommandé. Sans elle, un exploitant accède au portail avec son seul mot de passe. Le changement
              s’applique à la prochaine requête de chaque exploitant.
            </span>
          </span>
        </label>
        <Button
          size="sm"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate({ mfa_required: current }, { onSuccess: () => setMfaRequired(null) })}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
}
