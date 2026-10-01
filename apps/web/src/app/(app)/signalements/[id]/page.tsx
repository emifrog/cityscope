import type { Metadata } from 'next';
import { FieldReportDetail } from './field-report-detail';

export const metadata: Metadata = { title: 'Signalement terrain' };

export default async function Page(props: PageProps<'/signalements/[id]'>) {
  const { id } = await props.params;
  return <FieldReportDetail id={id} />;
}
