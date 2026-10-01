import type { Metadata } from 'next';
import { PortalSiteView } from './portal-site';

export const metadata: Metadata = { title: 'Site — portail exploitant' };

export default async function Page(props: PageProps<'/portail/sites/[id]'>) {
  const { id } = await props.params;
  return <PortalSiteView id={id} />;
}
