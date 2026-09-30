import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingCard } from '@/components/feedback';
import { SiteDetailView } from './site-detail';

export const metadata: Metadata = { title: 'Fiche site' };

export default async function SitePage(props: PageProps<'/sites/[id]'>) {
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingCard lines={6} />}>
      <SiteDetailView id={id} />
    </Suspense>
  );
}
