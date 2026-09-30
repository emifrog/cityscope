'use client';

import { Alert, Card, CardContent } from '@etare/ui';
import { useRouter } from 'next/navigation';
import { AddressSearch } from '@/components/address-search';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, usePermissions } from '@/lib/queries';
import { SiteForm } from '../site-form';

export function NewSite() {
  const router = useRouter();
  const permissions = usePermissions();
  const create = useApiMutation(api.createSite, (tenantId) => [queryKeys.sites(tenantId)]);

  if (!permissions.has('site:write')) {
    return <Alert tone="important">Votre rôle ne permet pas de créer de site.</Alert>;
  }

  return (
    <>
      <PageHeader
        title="Nouveau site"
        description="Le site est créé en brouillon dans votre SIS ; il ne sera diffusé aux intervenants qu’après validation et publication."
      />
      <Card>
        <CardContent>
          <SiteForm
            mode="create"
            addressSearch={(apply) => <AddressSearch id="address-search" onSelect={apply} />}
            submitting={create.isPending}
            error={create.error}
            onSubmit={async (payload) => {
              // Creation only offers the draft and active statuses.
              const site = await create.mutateAsync({
                ...payload,
                status: payload.status === 'active' ? 'active' : 'draft',
              });
              router.push(`/sites/${site.id}`);
            }}
            onCancel={() => router.push('/sites')}
          />
        </CardContent>
      </Card>
    </>
  );
}
