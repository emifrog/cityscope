import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingCard } from '@/components/feedback';
import { SitesList } from './sites-list';

export const metadata: Metadata = { title: 'Sites' };

export default function SitesPage() {
  // The list reads its filters from the URL (useSearchParams): Suspense is required for static rendering.
  return (
    <Suspense fallback={<LoadingCard lines={5} />}>
      <SitesList />
    </Suspense>
  );
}
