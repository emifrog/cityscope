import type { Metadata } from 'next';
import { SitesList } from './sites-list';

export const metadata: Metadata = { title: 'Sites' };

export default function SitesPage() {
  return <SitesList />;
}
