import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Administration' };

export default function Page() {
  return (
    <ComingSoon
      title="Administration"
      description="Utilisateurs, rôles, terminaux, catalogues et paramètres du SIS."
      sprint="Sprint 4"
    />
  );
}
