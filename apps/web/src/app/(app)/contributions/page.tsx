import type { Metadata } from 'next';
import { ContributionsList } from './contributions-list';

export const metadata: Metadata = { title: 'Contributions' };

export default function Page() {
  return <ContributionsList />;
}
