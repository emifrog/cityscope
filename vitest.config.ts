import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit tests: no network, no database. Integration tests live in tests/integration.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'services/*/src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)) } },
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
