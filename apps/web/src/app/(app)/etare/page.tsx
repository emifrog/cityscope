import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'ETARE' };

export default function Page() {
  return (
    <ComingSoon
      title="ETARE"
      description="Composition des dossiers ETARE à partir des données structurées et génération PDF."
      sprint="Sprint 3"
    />
  );
}
