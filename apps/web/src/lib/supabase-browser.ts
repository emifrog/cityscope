'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { publicEnv } from './public-env';

let client: SupabaseClient | undefined;

/** Browser auth client (publishable key only). Business data never goes through it: see lib/api-client.ts. */
export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    const env = publicEnv();
    client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  }
  return client;
}
