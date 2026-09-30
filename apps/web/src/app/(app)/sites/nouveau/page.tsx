import type { Metadata } from 'next';
import { NewSite } from './new-site';

export const metadata: Metadata = { title: 'Nouveau site' };

export default function NewSitePage() {
  return <NewSite />;
}
