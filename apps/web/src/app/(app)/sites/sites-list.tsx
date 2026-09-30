'use client';

import { Button, Card } from '@etare/ui';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { SitesTable } from '@/components/sites-table';
import { useSites } from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';

export function SitesList() {
  const { activeTenant } = useTenant();
  const sites = useSites();
  const items = sites.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <PageHeader
        title="Sites"
        description={activeTenant ? `Référentiel des sites — ${activeTenant.tenant_name}` : undefined}
      />
      {sites.isPending ? <LoadingCard lines={5} /> : null}
      {sites.error ? <ApiErrorAlert error={sites.error} /> : null}
      {sites.data ? (
        <Card>
          <SitesTable sites={items} />
          {sites.hasNextPage ? (
            <div className="border-t border-border p-4 text-center">
              <Button
                variant="secondary"
                onClick={() => void sites.fetchNextPage()}
                disabled={sites.isFetchingNextPage}
              >
                {sites.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de sites'}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
