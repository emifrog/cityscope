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
  },
});
