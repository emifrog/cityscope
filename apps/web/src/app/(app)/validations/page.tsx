import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Validations' };

export default function Page() {
  return (
    <ComingSoon
      title="Validations"
      description="Contrôle des révisions soumises, comparaison et publication."
      sprint="Sprint 3"
    />
  );
}
