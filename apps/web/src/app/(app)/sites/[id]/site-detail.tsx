'use client';

import { Badge } from '@etare/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { TabLinks } from '@/components/tab-links';
import { useSite } from '@/lib/queries';
import { BuildingsPanel } from './buildings-panel';
import { ClassificationsPanel } from './classifications-panel';
import { ContactsPanel } from './contacts-panel';
import { DocumentsPanel } from './documents-panel';
import { LocationPanel } from './location-panel';
import { SummaryPanel } from './summary-panel';

const TABS = [
  { key: 'synthese', label: 'Synthèse' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'batiments', label: 'Bâtiments & niveaux' },
  { key: 'classifications', label: 'Classifications' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'documents', label: 'Documents' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const isTab = (value: string | null): value is TabKey => TABS.some((tab) => tab.key === value);

export function SiteDetailView({ id }: { id: string }) {
  const site = useSite(id);
  const requested = useSearchParams().get('onglet');
  const tab: TabKey = isTab(requested) ? requested : 'synthese';

  if (site.isPending) return <LoadingCard lines={6} />;
  if (site.error) {
    return (
      <>
        <ApiErrorAlert error={site.error} />
        <Link href="/sites" className="mt-4 inline-block text-sm text-info hover:underline">
          ← Retour aux sites
        </Link>
      </>
    );
  }

  const data = site.data;
  return (
    <>
      <PageHeader
        title={data.name}
        description={data.address?.label ?? undefined}
        actions={
          data.active_publication ? (
            <Badge tone="success">Version publiée n° {data.active_publication.publication_number}</Badge>
          ) : (
            <Badge tone="important">Aucune version publiée</Badge>
          )
        }
      />
      <TabLinks tabs={TABS} active={tab} param="onglet" basePath={`/sites/${id}`} />
      {tab === 'synthese' ? <SummaryPanel site={data} /> : null}
      {tab === 'localisation' ? <LocationPanel site={data} /> : null}
      {tab === 'batiments' ? <BuildingsPanel siteId={id} /> : null}
      {tab === 'classifications' ? <ClassificationsPanel siteId={id} /> : null}
      {tab === 'contacts' ? <ContactsPanel siteId={id} /> : null}
      {tab === 'documents' ? <DocumentsPanel siteId={id} /> : null}
    </>
  );
}
