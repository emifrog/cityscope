'use client';

import type { PortalSite } from '@etare/contracts';
import { Alert, Badge, Button } from '@etare/ui';
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Download,
  Files,
  Map,
  MapPin,
  MessageSquarePlus,
  Phone,
  Plus,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { DOCUMENT_CATEGORY_ICONS } from '@/components/document-category-icon';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CLASSIFICATION_TYPE_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  PLAN_TYPE_LABELS,
  SITE_TYPE_LABELS,
} from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { SITE_TYPE_ICONS } from '@/components/site-type-icon';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { useApiMutation, usePortalSite } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { verificationState } from '@/lib/site-verification';
import { ContributionForm } from './contribution-form';
import { MyContributions } from './my-contributions';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
const sizeFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const formatDay = (day: string) => date.format(new Date(`${day}T12:00:00Z`));
const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${sizeFormat.format(bytes / 1024)} Ko` : `${sizeFormat.format(bytes / 1024 / 1024)} Mo`;
const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** A short "nothing here" line inside a list card. */
function EmptyLine({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}

const Counter = ({ count, one, many }: { count: number; one: string; many: string }) => (
  <Badge tone={count > 0 ? 'info' : 'neutral'}>{plural(count, one, many)}</Badge>
);

/** When the SIS last checked this contact on the ground: recent, overdue, or never. */
function Verification({ verifiedAt, now }: { verifiedAt: string | null; now: number }) {
  const state = verificationState(verifiedAt, now);
  if (state === 'never') return <Badge tone="neutral">Jamais vérifié par le SIS</Badge>;
  return (
    <Badge tone={state === 'verified' ? 'success' : 'important'}>Vérifié {agoLabel(verifiedAt as string, now)}</Badge>
  );
}

function Contacts({ site, now }: { site: PortalSite; now: number }) {
  return (
    <SectionCard
      icon={Phone}
      title="Contacts"
      description="Les personnes que les secours appellent en cas d’intervention."
      aside={<Counter count={site.contacts.length} one="contact" many="contacts" />}
      contentClassName="px-0 py-0"
    >
      {site.contacts.length === 0 ? (
        <EmptyLine icon={UserRound}>Aucun contact publié.</EmptyLine>
      ) : (
        <ul className="divide-y divide-border" aria-label="Contacts publiés">
          {site.contacts.map((contact) => (
            <li key={contact.id} className="grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
              >
                <UserRound className="size-5" />
              </span>
              <div className="min-w-0 space-y-1 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{contact.name}</span>
                  {contact.role ? <Badge>{contact.role}</Badge> : null}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {[contact.phone, contact.phone_alt].filter(Boolean).map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${(phone as string).replace(/\s+/g, '')}`}
                      className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                    >
                      <Phone aria-hidden="true" className="size-3.5 text-muted" />
                      {phone}
                    </a>
                  ))}
                  {contact.email ? (
                    <a href={`mailto:${contact.email}`} className="break-all text-foreground hover:underline">
                      {contact.email}
                    </a>
                  ) : null}
                </p>
                {contact.availability ? <p className="text-xs text-muted">Joignable : {contact.availability}</p> : null}
              </div>
              <div className="md:text-right">
                <Verification verifiedAt={contact.verified_at} now={now} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Plans({ site }: { site: PortalSite }) {
  return (
    <SectionCard
      icon={Map}
      title="Plans"
      description="Les plans tenus par le SIS pour ce site. Leur contenu est réservé aux équipes de secours."
      aside={<Counter count={site.plans.length} one="plan" many="plans" />}
      contentClassName="px-0 py-0"
    >
      {site.plans.length === 0 ? (
        <EmptyLine icon={Map}>Aucun plan publié.</EmptyLine>
      ) : (
        <ul className="divide-y divide-border" aria-label="Plans publiés">
          {site.plans.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
              >
                <Map className="size-5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-foreground">{plan.title}</p>
                <p className="text-xs text-muted">
                  {[PLAN_TYPE_LABELS[plan.plan_type], plan.building_name, plan.level_name].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Badge>Fond n° {plan.revision_no}</Badge>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Documents({ site }: { site: PortalSite }) {
  const download = useApiMutation(
    (options, documentId: string) => api.getPortalDocumentDownload(options, site.id, documentId),
    () => [],
  );
  return (
    <SectionCard
      icon={Files}
      title="Documents partagés"
      description="Les documents que le SIS a choisi de partager avec vous."
      aside={<Counter count={site.documents.length} one="document" many="documents" />}
      contentClassName="px-0 py-0"
    >
      {download.error ? (
        <div className="px-5 pt-4">
          <ApiErrorAlert error={download.error} />
        </div>
      ) : null}
      {site.documents.length === 0 ? (
        <EmptyLine icon={Files}>Aucun document partagé.</EmptyLine>
      ) : (
        <ul className="divide-y divide-border" aria-label="Documents partagés">
          {site.documents.map((document) => {
            const Icon = DOCUMENT_CATEGORY_ICONS[document.category];
            return (
              <li
                key={document.id}
                className="grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{document.title}</span>
                    <Badge>{DOCUMENT_CATEGORY_LABELS[document.category]}</Badge>
                  </p>
                  <p className="text-xs text-muted">
                    {[
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
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/** Proposals of updates (POR-03): the form, then the proposals already sent and their outcome. */
function Proposals({ site, now }: { site: PortalSite; now: number }) {
  const [proposing, setProposing] = useState(false);
  return (
    <SectionCard
      icon={MessageSquarePlus}
      title="Vos propositions de mise à jour"
      description="Contact, stockage, travaux, nouveau plan… Signalez ce qui change : le SIS l’examine, vous répond et met à jour son dossier."
      aside={
        proposing ? null : (
          <Button size="sm" onClick={() => setProposing(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Proposer une mise à jour
          </Button>
        )
      }
      contentClassName="space-y-4 px-5 py-4"
    >
      {proposing ? (
        <div className="rounded-md bg-subtle/60 p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">Nouvelle proposition</p>
          <ContributionForm site={site} onDone={() => setProposing(false)} />
        </div>
      ) : null}
      <MyContributions siteId={site.id} now={now} />
    </SectionCard>
  );
}

/** One site as its exploitant sees it: the whitelist of the published version (POR-02, ADR-019). */
export function PortalSiteView({ id }: { id: string }) {
  const site = usePortalSite(id);
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const crumbs = (
    <nav aria-label="Fil d’Ariane" className="mb-3 flex items-center gap-1 text-sm text-muted">
      <Link href="/portail" className="hover:text-foreground hover:underline">
        Vos sites
      </Link>
      <ChevronRight aria-hidden="true" className="size-4" />
      <span className="truncate text-foreground">{site.data?.short_name ?? site.data?.name ?? 'Site'}</span>
    </nav>
  );
  if (site.isPending) return <LoadingCard lines={6} />;
  if (site.error) {
    return (
      <div className="space-y-4">
        {crumbs}
        <ApiErrorAlert error={site.error} />
      </div>
    );
  }
  const data = site.data;
  const Icon = SITE_TYPE_ICONS[data.site_type];

  return (
    <>
      <header className="mb-5">
        {crumbs}
        <div className="flex flex-wrap items-start gap-4">
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-card bg-brand-navy text-white"
          >
            <Icon className="size-7" />
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="text-2xl font-bold break-words text-foreground">{data.name}</h1>
            {data.address?.label ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <MapPin aria-hidden="true" className="size-4 shrink-0" />
                <span>{data.address.label}</span>
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {data.publication ? (
                <Badge tone="success">
                  Version n° {data.publication.publication_number} publiée{' '}
                  {agoLabel(data.publication.published_at, now)}
                </Badge>
              ) : (
                <Badge tone="important">Aucune version publiée</Badge>
              )}
              <Badge tone="info">{SITE_TYPE_LABELS[data.site_type]}</Badge>
              {data.etare_number ? <Badge>N° ETARE {data.etare_number}</Badge> : null}
              {data.access_until ? (
                <Badge className="gap-1">
                  <CalendarClock aria-hidden="true" className="size-3" />
                  Accès jusqu’au {date.format(new Date(data.access_until))}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <div className="space-y-4">
        {data.publication ? null : (
          <Alert tone="important">
            Le SIS n’a pas encore publié de dossier pour ce site, ou l’a retiré : rien n’est consultable pour l’instant.
            Vous pouvez néanmoins lui proposer une mise à jour.
          </Alert>
        )}
        {data.publication ? (
          <>
            <SectionCard
              icon={Building2}
              title="Identité"
              description={`Version n° ${data.publication.publication_number} publiée par le SIS le ${date.format(new Date(data.publication.published_at))}.`}
            >
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted">Adresse</dt>
                  <dd className="mt-0.5 text-foreground">
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
                  <dt className="text-xs font-medium text-muted">Classement</dt>
                  <dd className="mt-1 flex flex-wrap gap-2">
                    {data.classifications.length === 0 ? (
                      <span className="text-muted">Aucun classement publié</span>
                    ) : null}
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
            </SectionCard>
            <Contacts site={data} now={now} />
            <Plans site={data} />
            <Documents site={data} />
          </>
        ) : null}
        <Proposals site={data} now={now} />
      </div>
    </>
  );
}
