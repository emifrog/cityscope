import type { Metadata } from 'next';
import { ContributionDetail } from './contribution-detail';

export const metadata: Metadata = { title: 'Contribution' };

export default async function Page(props: PageProps<'/contributions/[id]'>) {
  const { id } = await props.params;
  return <ContributionDetail id={id} />;
}
