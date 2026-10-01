'use client';

import type { PortalSite } from '@etare/contracts';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@etare/ui';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import {
  CLASSIFICATION_TYPE_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  PLAN_TYPE_LABELS,
  SITE_TYPE_LABELS,
} from '@/components/labels';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { useApiMutation, usePortalSite } from '@/lib/queries';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
const sizeFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatDay = (day: string) => date.format(new Date(`${day}T12:00:00Z`));
const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${sizeFormat.format(bytes / 1024)} Ko` : `${sizeFormat.format(bytes / 1024 / 1024)} Mo`;

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted">{children}</p>;

function Contacts({ site }: { site: PortalSite }) {
  return (
    <Section title="Contacts" description="Les personnes que les secours appellent en cas d’intervention.">
      {site.contacts.length === 0 ? <Empty>Aucun contact publié.</Empty> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {site.contacts.map((contact, index) => (
          <li key={index} className="rounded-md border border-border p-3 text-sm">
            <p className="font-semibold">{contact.name}</p>
            {contact.role ? <p className="text-muted">{contact.role}</p> : null}
            <p className="mt-1">
              {[contact.phone, contact.phone_alt].filter(Boolean).join(' · ')}
              {contact.email ? <span className="block break-all">{contact.email}</span> : null}
            </p>
            {contact.availability ? <p className="text-xs text-muted">Joignable : {contact.availability}</p> : null}
            <p className="text-xs text-muted">
              {contact.verified_at
                ? `Vérifié le ${date.format(new Date(contact.verified_at))}`
                : 'Jamais vérifié par le SIS'}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Documents({ site }: { site: PortalSite }) {
  const download = useApiMutation(
    (options, documentId: string) => api.getPortalDocumentDownload(options, site.id, documentId),
    () => [],
  );
  return (
    <Section title="Documents partagés" description="Les documents que le SIS a choisi de partager avec vous.">
      {download.error ? <ApiErrorAlert error={download.error} /> : null}
      {site.documents.length === 0 ? <Empty>Aucun document partagé.</Empty> : null}
      <ul className="divide-y divide-border">
        {site.documents.map((document) => (
          <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{document.title}</p>
              <p className="text-xs text-muted">
                {[
                  DOCUMENT_CATEGORY_LABELS[document.category],
                  `version ${document.version_no}`,
                  formatBytes(document.size_bytes),
                  document.valid_from ? `valable dès le ${formatDay(document.valid_from)}` : null,
                  document.expires_at ? `expire le ${formatDay(document.expires_at)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={download.isPending}
              onClick={() => download.mutate(document.id, { onSuccess: (ticket) => openInNewTab(ticket.url) })}
            >
              <Download aria-hidden="true" className="size-4" />
              Télécharger
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** One site as its exploitant sees it: the whitelist of the published version (POR-02, ADR-019). */
export function PortalSiteView({ id }: { id: string }) {
  const site = usePortalSite(id);
  const back = (
    <Button asChild variant="ghost" size="sm">
      <Link href="/portail">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Vos sites
      </Link>
    </Button>
  );
  if (site.isPending) return <LoadingCard lines={6} />;
  if (site.error) {
    return (
      <div className="space-y-4">
        {back}
        <ApiErrorAlert error={site.error} />
      </div>
    );
  }
  const data = site.data;

  return (
    <>
      <PageHeader
        title={data.name}
        description={[
          SITE_TYPE_LABELS[data.site_type],
          data.etare_number ? `ETARE ${data.etare_number}` : null,
          data.address?.label,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={back}
      />
      <div className="space-y-6">
        {data.publication ? (
          <Alert tone="info">
            Version n° {data.publication.publication_number} publiée par le SIS le{' '}
            {date.format(new Date(data.publication.published_at))}
            {data.access_until ? ` · votre accès court jusqu’au ${date.format(new Date(data.access_until))}` : ''}.
          </Alert>
        ) : (
          <Alert tone="important">
            Le SIS n’a pas encore publié de dossier pour ce site, ou l’a retiré : rien n’est consultable pour l’instant.
          </Alert>
        )}
        {data.publication ? (
          <>
            <Section title="Identité">
              <dl className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-muted">Adresse</dt>
                  <dd>
                    {data.address ? (
                      <>
                        {data.address.street ?? data.address.label}
                        <br />
                        {[data.address.postal_code, data.address.city].filter(Boolean).join(' ')}
                      </>
                    ) : (
                      'Non renseignée'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Classement</dt>
                  <dd className="flex flex-wrap gap-2">
                    {data.classifications.length === 0 ? 'Aucun classement publié' : null}
                    {data.classifications.map((classification, index) => (
                      <Badge key={index}>
                        {[
                          CLASSIFICATION_TYPE_LABELS[classification.classification_type],
                          classification.code,
                          classification.category ? `cat. ${classification.category}` : null,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </Badge>
                    ))}
                  </dd>
                </div>
              </dl>
            </Section>
            <Contacts site={data} />
            <Section
              title="Plans"
              description="Les plans tenus par le SIS pour ce site. Leur contenu est réservé aux équipes de secours."
            >
              {data.plans.length === 0 ? <Empty>Aucun plan publié.</Empty> : null}
              <ul className="divide-y divide-border text-sm">
                {data.plans.map((plan) => (
                  <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-semibold">{plan.title}</span>
                      <span className="block text-xs text-muted">
                        {[PLAN_TYPE_LABELS[plan.plan_type], plan.building_name, plan.level_name]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Badge>Fond n° {plan.revision_no}</Badge>
                  </li>
                ))}
              </ul>
            </Section>
            <Documents site={data} />
          </>
        ) : null}
      </div>
    </>
  );
}
