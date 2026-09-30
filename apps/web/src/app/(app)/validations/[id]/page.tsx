import type { Metadata } from 'next';
import { RevisionReview } from './revision-review';

export const metadata: Metadata = { title: 'Contrôle d’une révision' };

export default async function Page(props: PageProps<'/validations/[id]'>) {
  const { id } = await props.params;
  return <RevisionReview id={id} />;
}
