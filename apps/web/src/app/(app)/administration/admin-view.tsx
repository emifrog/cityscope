'use client';

import type { Permission } from '@etare/domain';
import { Alert } from '@etare/ui';
import { useSearchParams } from 'next/navigation';
import { LoadingCard } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { TabLinks } from '@/components/tab-links';
import { usePermissions } from '@/lib/queries';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';
import { MembersAdmin } from './members-admin';
import { RiskCatalogAdmin } from './risk-catalog-admin';

const TABS: readonly { key: string; label: string; permission: Permission }[] = [
  { key: 'membres', label: 'Membres', permission: 'member:manage' },
  { key: 'risques', label: 'Catalogue des risques', permission: 'catalog:manage' },
];

/** Administration of the SIS: one tab per permission held. */
export function AdminView() {
  const { ready } = useSession();
  const { loading } = useTenant();
  const permissions = usePermissions();
  const requested = useSearchParams().get('onglet');

  // Roles come with the active SIS: do not conclude anything before it is known.
  if (!ready || loading) return <LoadingCard lines={5} />;
  const tabs = TABS.filter((tab) => permissions.has(tab.permission));
  const tab = tabs.find((candidate) => candidate.key === requested) ?? tabs[0];
  if (!tab) {
    return (
      <>
        <PageHeader title="Administration" />
        <Alert tone="info">L’administration du SIS est réservée à ses administrateurs.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Administration"
        description="Membres du SIS, rôles et catalogue des risques. Terminaux et paramètres : à venir."
      />
      <TabLinks tabs={tabs} active={tab.key} param="onglet" basePath="/administration" />
      {tab.key === 'membres' ? <MembersAdmin /> : <RiskCatalogAdmin />}
    </>
  );
}
