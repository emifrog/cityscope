import { publicEnvSchema, type PublicEnv } from '@etare/config';

let cached: PublicEnv | undefined;

/**
 * Browser-visible configuration. Each variable is referenced literally so that
 * Next.js can inline it; parsing is lazy so that a missing value fails with a
 * clear message at first use instead of breaking the build.
 */
export function publicEnv(): PublicEnv {
  cached ??= publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cached;
}
