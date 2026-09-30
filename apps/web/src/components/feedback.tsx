'use client';

import { Alert, Card, CardContent, Skeleton } from '@etare/ui';
import Link from 'next/link';
import { ApiRequestError } from '@/lib/api-client';

/** Displays an API error with its trace id (to give to support) and without technical detail. */
export function ApiErrorAlert({ error }: { error: unknown }) {
  const message =
    error instanceof ApiRequestError ? error.message : 'Une erreur inattendue est survenue. Réessayez plus tard.';
  const traceId = error instanceof ApiRequestError ? error.traceId : null;
  const secondFactor = error instanceof ApiRequestError && error.code === 'MFA_REQUIRED';
  return (
    <Alert tone="critical">
      <p>{message}</p>
      {secondFactor ? (
        <p className="mt-1">
          <Link href="/compte" className="font-semibold underline">
            Activer la double authentification
          </Link>
        </p>
      ) : null}
      {traceId ? <p className="mt-1 text-xs opacity-80">Référence : {traceId}</p> : null}
    </Alert>
  );
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <Card>
      <CardContent className="space-y-3" aria-busy="true">
        <span className="sr-only">Chargement…</span>
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className="h-5 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}
