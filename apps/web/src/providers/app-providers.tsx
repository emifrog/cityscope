'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiRequestError } from '@/lib/api-client';
import { SessionProvider } from './session-provider';
import { TenantProvider } from './tenant-provider';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Authorization and validation errors are final: retrying cannot fix them.
        retry: (failureCount, error) =>
          !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
    },
  });
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TenantProvider>{children}</TenantProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
