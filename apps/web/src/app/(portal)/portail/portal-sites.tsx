'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { usePortalSites } from '@/lib/queries';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

/** Sites open to the exploitant, each with the version the SIS published (POR-02). */
export function PortalSites() {
  const sites = usePortalSites();
  if (sites.isPending) return <LoadingCard lines={3} />;
  if (sites.error) return <ApiErrorAlert error={sites.error} />;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Vos sites</CardTitle>
          <CardDescription>
            Ce que le service d’incendie et de secours a publié pour ses équipes : identité, contacts, plans et
            documents partagés avec vous.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {sites.data.length === 0 ? <p className="text-sm text-muted">Aucun site ne vous est ouvert.</p> : null}
        <ul className="divide-y divide-border">
          {sites.data.map((site) => (
            <li key={site.id}>
              <Link
                href={`/portail/sites/${site.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:text-brand-accent-strong focus-visible:outline-2"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{site.name}</span>
                  <span className="block text-xs text-muted">
                    {[
                      site.etare_number ? `ETARE ${site.etare_number}` : null,
                      site.published_at
                        ? `version n° ${site.publication_number} publiée le ${date.format(new Date(site.published_at))}`
                        : 'aucune version publiée',
                      site.access_until ? `accès jusqu’au ${date.format(new Date(site.access_until))}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
