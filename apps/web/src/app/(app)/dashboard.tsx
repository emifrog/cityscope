'use client';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import Link from 'next/link';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { ROLE_LABELS } from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { SitesTable } from '@/components/sites-table';
import {
  useContributions,
  useEtareCounts,
  useFieldReports,
  usePermissions,
  useSites,
  useValidations,
} from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';

function Indicator({ label, value, note, href }: { label: string; value: string; note: string; href?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-3xl font-bold">{value}</p>
        {href ? (
          <Link href={href} className="mt-2 inline-block text-xs text-info hover:underline">
            {note}
          </Link>
        ) : (
          <p className="mt-2 text-xs text-muted">{note}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { me, activeTenant, loading, error } = useTenant();
  const sites = useSites({}, 10);
  const readsEtare = usePermissions().has('etare:read');
  const counts = useEtareCounts(readsEtare);
  const queue = useValidations(readsEtare);
  const reviewsReports = usePermissions().has('field_report:review');
  const reports = useFieldReports({ view: 'open', limit: 1 }, reviewsReports);
  const reviewsContributions = usePermissions().has('contribution:review');
  const contributions = useContributions({ view: 'open', limit: 1 }, reviewsContributions);

  if (loading) return <LoadingCard lines={4} />;
  if (error) return <ApiErrorAlert error={error} />;
  if (!activeTenant) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted">
            Votre compte n’est rattaché à aucun SIS. Contactez l’administrateur de votre service.
          </p>
        </CardContent>
      </Card>
    );
  }

  const firstPage = sites.data?.pages[0];
  const name = me?.user.display_name ?? me?.user.email ?? '';

  return (
    <>
      <PageHeader
        title={`Bonjour, ${name}`}
        description={`Situation de la base opérationnelle — ${activeTenant.tenant_name}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Sites (hors archives)</p>
            <p className="mt-1 text-3xl font-bold">
              {readsEtare && counts.data
                ? String(counts.data.sites)
                : firstPage
                  ? `${firstPage.items.length}${firstPage.next_cursor ? '+' : ''}`
                  : '—'}
            </p>
            <Badge tone="info" className="mt-2">
              {activeTenant.tenant_name}
            </Badge>
          </CardContent>
        </Card>
        <Indicator
          label="ETARE publiés"
          value={readsEtare && counts.data ? String(counts.data.published) : '—'}
          note={readsEtare && counts.data ? `sur ${counts.data.sites} site(s)` : 'Dossiers ETARE'}
          href="/etare"
        />
        <Indicator
          label="À valider"
          value={readsEtare && queue.data ? String(queue.data.length) : '—'}
          note="File des validations"
          href="/validations"
        />
        <Indicator
          label="Signalements à traiter"
          value={reviewsReports && reports.data ? String(reports.data.open_count) : '—'}
          note="Remontés par les intervenants"
          href="/signalements"
        />
        <Indicator
          label="Contributions à traiter"
          value={reviewsContributions && contributions.data ? String(contributions.data.open_count) : '—'}
          note="Proposées par les exploitants"
          href="/contributions"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Sites de votre SIS</CardTitle>
              <CardDescription>Données de travail, limitées à votre SIS et à vos droits.</CardDescription>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/sites">Voir tout</Link>
            </Button>
          </CardHeader>
          <div className="pt-4">
            {sites.isPending ? <LoadingCard /> : null}
            {sites.error ? (
              <div className="px-5 pb-4">
                <ApiErrorAlert error={sites.error} />
              </div>
            ) : null}
            {firstPage ? <SitesTable sites={firstPage.items} /> : null}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vos habilitations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {activeTenant.roles.map((role) => (
                <li key={role}>
                  <Badge tone="info">{ROLE_LABELS[role]}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">
              Les droits sont vérifiés par le serveur à chaque requête ; l’affichage ne les remplace jamais.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
