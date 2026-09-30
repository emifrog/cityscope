import { defineConfig } from 'tsup';

// Workspace packages ship TypeScript sources: bundle them, keep npm dependencies external.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@etare\//],
});
