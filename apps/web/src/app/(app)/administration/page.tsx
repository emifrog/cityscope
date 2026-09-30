import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingCard } from '@/components/feedback';
import { AdminView } from './admin-view';

export const metadata: Metadata = { title: 'Administration' };

export default function Page() {
  return (
    <Suspense fallback={<LoadingCard lines={5} />}>
      <AdminView />
    </Suspense>
  );
}
