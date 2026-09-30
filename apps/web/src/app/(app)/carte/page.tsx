import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Carte opérationnelle' };

export default function Page() {
  return (
    <ComingSoon
      title="Carte opérationnelle"
      description="Navigation géographique dans le référentiel, sur fond IGN (pas de SITAC)."
      sprint="Sprint 2"
    />
  );
}
