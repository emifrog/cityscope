import type { Metadata } from 'next';
import { ValidationsList } from './validations-list';

export const metadata: Metadata = { title: 'Validations' };

export default function Page() {
  return <ValidationsList />;
}
