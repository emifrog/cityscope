'use client';

import { PRIVILEGED_PERMISSIONS, permissionsForRoles } from '@etare/domain';
import { Alert, Badge } from '@etare/ui';
import { CircleHelp, KeyRound, MonitorSmartphone, ShieldCheck, Users } from 'lucide-react';
import { LoadingCard } from '@/components/feedback';
import { PRIVILEGED_ACTION_LABELS } from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { useTenant } from '@/providers/tenant-provider';
import { AccountHeader } from './account-header';
import { MembershipsSection } from './memberships-section';
import { PasswordSection } from './password-section';
import { RecoveryCodesSection } from './recovery-codes-section';
import { SecondFactorSection } from './second-factor-section';
import { SessionsSection } from './sessions-section';

export function AccountView({ welcome }: { welcome: boolean }) {
  const { me, loading, activeTenant } = useTenant();
  const privileged = [...permissionsForRoles(activeTenant?.roles ?? [])]
    .filter((permission) => PRIVILEGED_PERMISSIONS.has(permission))
    .map((permission) => PRIVILEGED_ACTION_LABELS[permission])
    .filter(Boolean);

  if (loading || !me) return <LoadingCard lines={4} />;
  const requiredBySis = activeTenant?.second_factor_required ?? false;
  const enrolled = me.user.second_factor;
  // Until a new factor is enrolled, the API answers nothing but the profile.
  const awaitingNewFactor = me.user.second_factor_reenrollment && !enrolled;

  return (
    <div className="mx-auto max-w-6xl">
      <AccountHeader
        email={me.user.email}
        displayName={me.user.display_name}
        protectedAccount={enrolled}
        activeTenant={activeTenant}
      />
      {awaitingNewFactor || (requiredBySis && !enrolled) || welcome ? (
        <div className="mb-4 space-y-3">
          {awaitingNewFactor ? (
            <Alert tone="important">
              Votre double authentification a été retirée (code de secours utilisé ou réinitialisation par votre SIS) :
              activez-en une nouvelle ci-dessous pour continuer.
            </Alert>
          ) : requiredBySis && !enrolled ? (
            <Alert tone="important">
              {activeTenant?.tenant_name} exige la double authentification pour tout accès au back-office : activez-la
              ci-dessous pour continuer.
            </Alert>
          ) : null}
          {welcome ? (
            <Alert tone="info">
              Votre compte est activé. Si votre rôle comprend des actions sensibles, activez maintenant la double
              authentification.
            </Alert>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4">
          <SectionCard
            icon={ShieldCheck}
            title="Double authentification"
            description={
              requiredBySis
                ? 'Exigée par votre SIS pour tout accès au back-office (la tablette s’identifie par sa propre clé).'
                : privileged.length > 0
                  ? `Exigée par votre rôle pour : ${privileged.join(', ')}.`
                  : 'Recommandée pour protéger votre accès, même si votre rôle ne l’exige pas.'
            }
            aside={enrolled ? <Badge tone="success">Activée</Badge> : <Badge tone="important">Non activée</Badge>}
          >
            <SecondFactorSection requiredBySis={requiredBySis || me.user.second_factor_reenrollment} />
            {enrolled ? <RecoveryCodesSection /> : null}
          </SectionCard>

          <SectionCard
            icon={KeyRound}
            title="Mot de passe"
            description="Choisi par vous seul, jamais connu de votre SIS."
          >
            <PasswordSection />
          </SectionCard>

          {awaitingNewFactor ? null : (
            <SectionCard
              icon={MonitorSmartphone}
              title="Sessions ouvertes"
              description="Navigateurs et applications connectés à votre compte."
            >
              <SessionsSection />
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          <SectionCard
            icon={Users}
            title="Mes habilitations"
            description="Attribuées par l’administrateur de chaque SIS."
          >
            <MembershipsSection memberships={me.memberships} activeTenantId={activeTenant?.tenant_id ?? null} />
          </SectionCard>

          <SectionCard icon={CircleHelp} title="Besoin d’aide ?" contentClassName="px-5 py-4 text-sm">
            <dl className="space-y-3">
              <div>
                <dt className="font-semibold text-foreground">Nom affiché ou rôles à corriger</dt>
                <dd className="text-muted">
                  Demandez-le à l’administrateur de votre SIS : vous ne pouvez pas les modifier.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Téléphone perdu</dt>
                <dd className="text-muted">
                  Un code de secours remplace une fois l’application d’authentification, puis vous en activez une
                  nouvelle.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground">Mot de passe oublié</dt>
                <dd className="text-muted">Depuis l’écran de connexion, un lien valable une heure vous est envoyé.</dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
