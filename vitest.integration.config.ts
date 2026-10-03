import { defineConfig } from 'vitest/config';

// Integration tests: require the local stack (`pnpm db:start` then `pnpm setup:local`).
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
    // Hundreds of requests per test file: the limits are tested by their own file (rate-limits.test.ts).
    env: { RATE_LIMITS: 'off' },
  },
});
