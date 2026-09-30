import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Contributions' };

export default function Page() {
  return (
    <ComingSoon title="Contributions" description="Propositions de mise à jour des exploitants." sprint="Sprint 5" />
  );
}
