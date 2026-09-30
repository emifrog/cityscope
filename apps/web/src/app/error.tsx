'use client';

import { Alert, Button } from '@etare/ui';
import { useEffect } from 'react';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Technical details stay in the console; the user only sees a neutral message and a reference.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-xl p-6">
      <Alert tone="critical">
        <p className="font-semibold">Cette page n’a pas pu être affichée.</p>
        {error.digest ? <p className="mt-1 text-xs">Référence : {error.digest}</p> : null}
      </Alert>
      <Button className="mt-4" variant="secondary" onClick={reset}>
        Réessayer
      </Button>
    </main>
  );
}
