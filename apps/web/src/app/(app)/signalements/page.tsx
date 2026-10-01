import type { Metadata } from 'next';
import { FieldReportsList } from './field-reports-list';

export const metadata: Metadata = { title: 'Signalements terrain' };

export default function Page() {
  return <FieldReportsList />;
}
