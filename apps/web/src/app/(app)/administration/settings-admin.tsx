'use client';

import type { SecondFactorPolicy } from '@etare/contracts';
import { OPTIONAL_SECTIONS, SECTION_TITLES, type OptionalSection } from '@etare/domain';
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { api } from '@/lib/api-client';
import {
  queryKeys,
  useApiMutation,
  useEtareLayoutSettings,
  usePermissions,
  usePortalSettings,
  useSecuritySettings,
} from '@/lib/queries';

const POLICIES: readonly { value: SecondFactorPolicy; label: string; help: string }[] = [
  {
    value: 'privileged',
    label: 'Pour les actions sensibles',
    help: 'Valider, publier, administrer les membres et les terminaux. Réglage par défaut.',
  },
  {
    value: 'all',
    label: 'Pour tout accès au back-office',
    help: 'Chaque membre active la double authentification avant tout accès ; les tablettes enrôlées s’identifient par leur propre clé.',
  },
  {
    value: 'none',
    label: 'Jamais (déconseillé)',
    help: 'Les actions sensibles sont possibles avec le seul mot de passe. À réserver à un environnement de démonstration.',
  },
];

/** Second-factor policy of the SIS (ADR-022). Whatever the policy, an enrolled account always uses its code. */
function SecurityPolicyCard() {
  const settings = useSecuritySettings();
  const [policy, setPolicy] = useState<SecondFactorPolicy | null>(null);
  const save = useApiMutation(
    (options, input: { second_factor_policy: SecondFactorPolicy }) => api.updateSecuritySettings(options, input),
    (tenantId) => [queryKeys.securitySettings(tenantId), ['me']],
  );

  if (settings.isPending) return <LoadingCard lines={3} />;
  if (settings.error) return <ApiErrorAlert error={settings.error} />;
  const current = policy ?? settings.data.second_factor_policy;
  const changed = current !== settings.data.second_factor_policy;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Double authentification des membres</CardTitle>
        <CardDescription>
          Un compte qui a activé la double authentification saisit toujours son code, quel que soit ce réglage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {save.error ? <ApiErrorAlert error={save.error} /> : null}
        {save.isSuccess && !changed ? <Alert tone="info">Politique enregistrée et tracée.</Alert> : null}
        <fieldset className="space-y-3">
          <legend className="sr-only">Double authentification exigée</legend>
          {POLICIES.map((option) => (
            <label key={option.value} className="flex items-start gap-3">
              <input
                type="radio"
                name="second-factor-policy"
                className="mt-1 size-4 accent-brand-accent"
                checked={current === option.value}
                onChange={() => setPolicy(option.value)}
              />
              <span>
                <span className="font-semibold">{option.label}</span>
                <span className="block text-sm text-muted">{option.help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {current === 'all' && changed ? (
          <Alert tone="important">
            Les membres sans double authentification ne pourront plus rien faire avant de l’avoir activée dans « Mon
            compte ».
          </Alert>
        ) : null}
        <Button
          size="sm"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate({ second_factor_policy: current }, { onSuccess: () => setPolicy(null) })}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Settings of the SIS: second-factor policy (ADR-022), second factor of the
 * exploitants (ADR-019) and sections of the ETARE (ADR-026).
 */
export function SettingsAdmin() {
  const permissions = usePermissions();
  return (
    <div className="space-y-4">
      <SecurityPolicyCard />
      <PortalSettingsCard />
      {permissions.has('catalog:manage') ? <EtareLayoutCard /> : null}
    </div>
  );
}

const SECTION_HELP: Readonly<Record<OptionalSection, string>> = {
  energy: 'Coupures d’électricité, de gaz, photovoltaïque. Masquée aussi sur la tablette.',
  rescue: 'Sécurité incendie, désenfumage, refuges, circulations, liaisons. Masquée aussi sur la tablette.',
  plans: 'Liste des plans et pages de plans du PDF. La tablette garde toujours ses plans.',
  annexes: 'Liste des documents dans le PDF. La tablette garde toujours ses documents.',
  photos: 'Annexe photos en fin de PDF et galerie de la tablette. Les photos restent sur les fiches des points.',
};

/** Sections of the ETARE (DEC-05): the national order stays, the optional sections can be hidden. */
function EtareLayoutCard() {
  const settings = useEtareLayoutSettings();
  const [hidden, setHidden] = useState<readonly OptionalSection[] | null>(null);
  const save = useApiMutation(
    (options, input: { hidden_sections: OptionalSection[] }) => api.updateEtareLayoutSettings(options, input),
    (tenantId) => [queryKeys.etareLayoutSettings(tenantId)],
  );

  if (settings.isPending) return <LoadingCard lines={3} />;
  if (settings.error) return <ApiErrorAlert error={settings.error} />;
  const current = hidden ?? settings.data.hidden_sections;
  const changed = [...current].sort().join() !== [...settings.data.hidden_sections].sort().join();
  const toggle = (section: OptionalSection, shown: boolean) =>
    setHidden(shown ? current.filter((item) => item !== section) : [...current, section]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sections de l’ETARE</CardTitle>
        <CardDescription>
          Synthèse, Accès, Risques, Eau et Contacts figurent toujours, dans l’ordre national. Le réglage s’applique aux
          révisions soumises ensuite : une version déjà publiée ne change pas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {save.error ? <ApiErrorAlert error={save.error} /> : null}
        {save.isSuccess && !changed ? <Alert tone="info">Réglage enregistré et tracé.</Alert> : null}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Sections affichées</legend>
          {OPTIONAL_SECTIONS.map((section) => (
            <label key={section} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-brand-accent"
                checked={!current.includes(section)}
                onChange={(event) => toggle(section, event.target.checked)}
              />
              <span>
                <span className="font-semibold">{SECTION_TITLES[section]}</span>
                <span className="block text-sm text-muted">{SECTION_HELP[section]}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Button
          size="sm"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate({ hidden_sections: [...current] }, { onSuccess: () => setHidden(null) })}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PortalSettingsCard() {
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
