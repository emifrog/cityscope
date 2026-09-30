import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Signalements terrain' };

export default function Page() {
  return (
    <ComingSoon
      title="Signalements terrain"
      description="Traitement des écarts remontés par les intervenants."
      sprint="Sprint 5"
    />
  );
}
