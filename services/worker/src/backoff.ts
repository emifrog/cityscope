const BASE_SECONDS = 10;
const MAX_SECONDS = 3_600;

/**
 * Exponential backoff with full jitter: attempt 1 -> up to 10 s, 2 -> 20 s,
 * 3 -> 40 s... capped at one hour. Jitter spreads retries of a failing
 * dependency instead of hammering it in lockstep.
 */
export function retryDelaySeconds(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_SECONDS, BASE_SECONDS * 2 ** Math.max(0, attempt - 1));
  return Math.max(1, Math.round(ceiling * random()));
}
