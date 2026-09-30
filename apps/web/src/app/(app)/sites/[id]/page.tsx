import type { Metadata } from 'next';
import { SiteDetailView } from './site-detail';

export const metadata: Metadata = { title: 'Fiche site' };

export default async function SitePage(props: PageProps<'/sites/[id]'>) {
  const { id } = await props.params;
  return <SiteDetailView id={id} />;
}
