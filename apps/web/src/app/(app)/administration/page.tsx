import type { Metadata } from 'next';
import { MembersAdmin } from './members-admin';

export const metadata: Metadata = { title: 'Administration' };

export default function Page() {
  return <MembersAdmin />;
}
