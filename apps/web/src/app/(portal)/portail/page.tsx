import type { Metadata } from 'next';
import { PortalHome } from './portal-home';

export const metadata: Metadata = { title: 'Portail exploitant' };

export default function Page() {
  return <PortalHome />;
}
