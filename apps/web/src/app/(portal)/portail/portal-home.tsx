'use client';

import type { MyPortalInvitation } from '@etare/contracts';
import { Button, Card } from '@etare/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarClock, Mail, MailQuestion, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { SectionCard } from '@/components/section-card';
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
    <SectionCard
      icon={Mail}
      title={`Invitation de ${invitation.tenant_name}`}
      description={`${invitation.invited_by_name} vous invite à consulter ce que le SIS sait de ${
        invitation.sites.length > 1 ? 'ces sites' : 'ce site'
      } et à proposer des mises à jour${invitation.organization ? `, au titre de « ${invitation.organization} »` : ''}.`}
      contentClassName="space-y-4 px-5 py-4"
    >
      <ul className="divide-y divide-border rounded-md border border-border" aria-label="Sites de l’invitation">
        {invitation.sites.map((site) => (
          <li key={site.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
            >
              <Building2 className="size-4" />
            </span>
            <span className="font-medium text-foreground">{site.name}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 text-sm text-muted">
        <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          À accepter avant le {dateTime.format(new Date(invitation.expires_at))}
          {invitation.access_until
            ? ` ; accès jusqu’au ${date.format(new Date(invitation.access_until))}.`
            : ' ; accès jusqu’à ce que le SIS y mette fin.'}
        </span>
      </p>
      {accept.error ? <ApiErrorAlert error={accept.error} /> : null}
      <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
        {accept.isPending ? 'Acceptation…' : 'Accepter l’invitation'}
      </Button>
    </SectionCard>
  );
}

/** Home of the exploitant: invitations to accept, second factor, then their sites (ADR-019). */
export function PortalHome() {
  const { ready } = useSession();
  const { loading, activeTenant } = useTenant();
  const invitations = useMyPortalInvitations();
  const access = usePortalAccess(Boolean(activeTenant));
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());

  if (!ready || loading || invitations.isPending) return <LoadingCard lines={4} />;
  const pending = invitations.data ?? [];
  const state = activeTenant ? access.data?.state : 'none';

  return (
    <>
      <PageHeader
        title="Portail exploitant"
        description="Ce que le service d’incendie et de secours sait de vos sites, et vos propositions de mise à jour. Le SIS reste seul à publier la donnée opérationnelle."
      />
      <div className="space-y-4">
        {invitations.error ? <ApiErrorAlert error={invitations.error} /> : null}
        {pending.map((invitation) => (
          <InvitationCard key={invitation.id} invitation={invitation} />
        ))}
        {access.error ? <ApiErrorAlert error={access.error} /> : null}
        {state === 'mfa_required' ? (
          <SectionCard
            icon={ShieldCheck}
            title="Double authentification exigée"
            description={`${activeTenant?.tenant_name} demande un code à usage unique, en plus de votre mot de passe, pour accéder à vos sites. Activez-la ici ; si elle l’est déjà, reconnectez-vous et saisissez votre code.`}
          >
            <SecondFactorSection />
          </SectionCard>
        ) : null}
        {state === 'granted' ? <PortalSites now={now} /> : null}
        {state === 'none' && pending.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
            >
              <MailQuestion className="size-6" />
            </span>
            <p className="font-semibold text-foreground">Aucun site ne vous est ouvert pour l’instant.</p>
            <p className="max-w-md text-sm text-muted">
              Votre accès passe par une invitation du service d’incendie et de secours ; elle a pu expirer ou être
              révoquée. Rapprochez-vous de votre interlocuteur à la Prévision.
            </p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
