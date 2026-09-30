import type { Metadata } from 'next';
import { Dashboard } from './dashboard';

export const metadata: Metadata = { title: 'Tableau de bord' };

export default function DashboardPage() {
  return <Dashboard />;
}
