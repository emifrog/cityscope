import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-sm text-muted">Cette page n’existe pas ou vous n’y avez pas accès.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-semibold text-info hover:underline">
        Retour au tableau de bord
      </Link>
    </main>
  );
}
