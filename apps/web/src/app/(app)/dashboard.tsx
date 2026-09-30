'use client';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import Link from 'next/link';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { ROLE_LABELS } from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { SitesTable } from '@/components/sites-table';
import { useSites } from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';

const PLANNED_INDICATORS = [
  { label: 'ETARE publiés', sprint: 'Sprint 3' },
  { label: 'À valider', sprint: 'Sprint 3' },
  { label: 'Signalements terrain', sprint: 'Sprint 5' },
];

export function Dashboard() {
  const { me, activeTenant, loading, error } = useTenant();
  const sites = useSites({}, 10);

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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-sm text-muted">Sites visibles</p>
            <p className="mt-1 text-3xl font-bold">
              {firstPage ? `${firstPage.items.length}${firstPage.next_cursor ? '+' : ''}` : '—'}
            </p>
            <Badge tone="info" className="mt-2">
              {activeTenant.tenant_name}
            </Badge>
          </CardContent>
        </Card>
        {PLANNED_INDICATORS.map((indicator) => (
          <Card key={indicator.label}>
            <CardContent>
              <p className="text-sm text-muted">{indicator.label}</p>
              <p className="mt-1 text-3xl font-bold text-muted">—</p>
              <Badge className="mt-2">{indicator.sprint}</Badge>
            </CardContent>
          </Card>
        ))}
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
