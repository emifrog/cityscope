import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingCard } from '@/components/feedback';
import { SitesMapView } from './sites-map';

export const metadata: Metadata = { title: 'Carte' };

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard lines={8} />}>
      <SitesMapView />
    </Suspense>
  );
}
