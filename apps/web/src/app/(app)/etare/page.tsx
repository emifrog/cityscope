import type { Metadata } from 'next';
import { EtareDossiers } from './etare-dossiers';

export const metadata: Metadata = { title: 'ETARE' };

export default function Page() {
  return <EtareDossiers />;
}
