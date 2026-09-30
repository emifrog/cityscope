import type { Metadata } from 'next';
import { AccountView } from './account-view';

export const metadata: Metadata = { title: 'Mon compte' };

export default async function AccountPage(props: PageProps<'/compte'>) {
  const params = await props.searchParams;
  return <AccountView welcome={params['bienvenue'] === '1'} />;
}
