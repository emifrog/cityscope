'use client';

import { PRIVILEGED_PERMISSIONS, permissionsForRoles } from '@etare/domain';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import { LoadingCard } from '@/components/feedback';
import { PRIVILEGED_ACTION_LABELS, ROLE_LABELS } from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { useTenant } from '@/providers/tenant-provider';
import { SecondFactorSection } from './second-factor-section';

export function AccountView({ welcome }: { welcome: boolean }) {
  const { me, loading, activeTenant } = useTenant();
  const privileged = [...permissionsForRoles(activeTenant?.roles ?? [])]
    .filter((permission) => PRIVILEGED_PERMISSIONS.has(permission))
    .map((permission) => PRIVILEGED_ACTION_LABELS[permission])
    .filter(Boolean);

  if (loading || !me) return <LoadingCard lines={4} />;

  return (
    <>
      <PageHeader title="Mon compte" description={me.user.email} />
      <div className="space-y-4">
        {welcome ? (
          <Alert tone="info">
            Votre compte est activé. Si votre rôle comprend des actions sensibles, activez maintenant la double
            authentification.
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Double authentification</CardTitle>
            <CardDescription>
              {privileged.length > 0
                ? `Exigée par votre rôle pour : ${privileged.join(', ')}.`
                : 'Recommandée pour protéger votre accès, même si votre rôle ne l’exige pas.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SecondFactorSection />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mes habilitations</CardTitle>
            <CardDescription>Attribuées par l’administrateur de chaque SIS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {me.memberships.length === 0 ? <p className="text-sm text-muted">Aucun SIS.</p> : null}
            {me.memberships.map((membership) => (
              <div key={membership.tenant_id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{membership.tenant_name}</span>
                {membership.roles.map((role) => (
                  <Badge key={role} tone="info">
                    {ROLE_LABELS[role]}
                  </Badge>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
