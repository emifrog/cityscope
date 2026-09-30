'use client';

// Last-resort boundary: replaces the root layout, so it must render its own <html>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
        <h1>Le service a rencontré une erreur.</h1>
        {error.digest ? <p>Référence : {error.digest}</p> : null}
        <button type="button" onClick={reset}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
