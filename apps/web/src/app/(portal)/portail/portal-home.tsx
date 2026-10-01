'use client';

import type { MyPortalInvitation } from '@etare/contracts';
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';
import { queryKeys, useMyPortalInvitations, usePortalAccess } from '@/lib/queries';
import { SecondFactorSection } from '@/app/(app)/compte/second-factor-section';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';
import { PortalSites } from './portal-sites';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

function InvitationCard({ invitation }: { invitation: MyPortalInvitation }) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api.acceptPortalInvitation({ token: session?.access_token ?? '' }, invitation.id),
    onSuccess: async () => {
      // New membership: the SIS list and the invitations change.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.myPortalInvitations(session?.user.id ?? 'none') }),
        queryClient.invalidateQueries({ queryKey: ['tenant'] }),
      ]);
    },
  });
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Invitation de {invitation.tenant_name}</CardTitle>
          <CardDescription>
            {invitation.invited_by_name} vous invite à consulter ce que le SIS sait de{' '}
            {invitation.sites.length > 1 ? 'ces sites' : 'ce site'} et à proposer des mises à jour
            {invitation.organization ? `, au titre de « ${invitation.organization} »` : ''}.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="list-disc pl-5 text-sm">
          {invitation.sites.map((site) => (
            <li key={site.id}>{site.name}</li>
          ))}
        </ul>
        <p className="text-sm text-muted">
          À accepter avant le {dateTime.format(new Date(invitation.expires_at))}
          {invitation.access_until
            ? ` ; accès jusqu’au ${date.format(new Date(invitation.access_until))}.`
            : ' ; accès jusqu’à ce que le SIS y mette fin.'}
        </p>
        {accept.error ? <ApiErrorAlert error={accept.error} /> : null}
        <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
          {accept.isPending ? 'Acceptation…' : 'Accepter l’invitation'}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Home of the exploitant: invitations to accept, second factor, then their sites (ADR-019). */
export function PortalHome() {
  const { ready } = useSession();
  const { loading, activeTenant } = useTenant();
  const invitations = useMyPortalInvitations();
  const access = usePortalAccess(Boolean(activeTenant));

  if (!ready || loading || invitations.isPending) return <LoadingCard lines={4} />;
  const pending = invitations.data ?? [];
  const state = activeTenant ? access.data?.state : 'none';

  return (
    <>
      <PageHeader
        title="Portail exploitant"
        description="Ce que le service d’incendie et de secours sait de vos sites, et vos propositions de mise à jour. Le SIS reste seul à publier la donnée opérationnelle."
      />
      <div className="space-y-6">
        {invitations.error ? <ApiErrorAlert error={invitations.error} /> : null}
        {pending.map((invitation) => (
          <InvitationCard key={invitation.id} invitation={invitation} />
        ))}
        {access.error ? <ApiErrorAlert error={access.error} /> : null}
        {state === 'mfa_required' ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Double authentification exigée</CardTitle>
                <CardDescription>
                  {activeTenant?.tenant_name} demande un code à usage unique, en plus de votre mot de passe, pour
                  accéder à vos sites. Activez-la ici ; si elle l’est déjà, reconnectez-vous et saisissez votre code.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SecondFactorSection />
            </CardContent>
          </Card>
        ) : null}
        {state === 'granted' ? <PortalSites /> : null}
        {state === 'none' && pending.length === 0 ? (
          <Alert tone="info">
            Aucun site ne vous est ouvert pour l’instant. Votre accès passe par une invitation du service d’incendie et
            de secours ; elle a pu expirer ou être révoquée.
          </Alert>
        ) : null}
      </div>
    </>
  );
}
