import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const WEB_FILES = ['apps/web/**/*.{js,jsx,mjs,ts,tsx}'];

/** Architecture rules (docs/architecture.md, "Règles de dépendance"). */
const restrict = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/next-env.d.ts',
    'apps/mobile/**',
    'supabase/**',
    '.tools/**',
    '.pnpm-store/**',
    'tmp/**',
    // Copied from maplibre-gl at dev/build time.
    'apps/web/public/maplibre/**',
    'apps/web/public/pdfjs/**',
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Next.js, React and accessibility rules, for the web app only.
  ...nextVitals
    .filter((config) => !(config.ignores && Object.keys(config).length === 1))
    .map((config) => ({ ...config, files: WEB_FILES })),
  {
    files: WEB_FILES,
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: 'apps/web/' } },
  },

  // Command-line scripts report to the terminal.
  { files: ['scripts/**'], rules: { 'no-console': 'off' } },

  // --- Dependency rules between layers ------------------------------------------------
  {
    files: ['packages/domain/src/**'],
    rules: restrict(
      ['next', 'next/*', 'react', 'react-dom', 'hono', 'pg', 'zod', '@supabase/*', '@etare/*'],
      'Le domaine est pur : aucune dépendance de framework, de base de données ou de fournisseur.',
    ),
  },
  {
    files: ['packages/application/src/**'],
    rules: restrict(
      ['next', 'next/*', 'react', 'hono', 'pg', '@supabase/*', '@etare/adapters', '@etare/adapters/*', '@etare/api'],
      'Les cas d’usage ne dépendent que du domaine, des contrats et de leurs ports (pas des adaptateurs).',
    ),
  },
  {
    files: ['packages/contracts/src/**', 'packages/schemas/src/**', 'packages/config/src/**'],
    rules: restrict(
      ['next', 'next/*', 'react', 'hono', 'pg', '@supabase/*', '@etare/adapters', '@etare/adapters/*', '@etare/api'],
      'Les contrats et schémas sont partagés : aucune dépendance d’infrastructure.',
    ),
  },
  {
    files: ['packages/ui/src/**'],
    rules: restrict(['@etare/*', '@supabase/*', 'pg'], 'Le paquet UI ne contient que des composants de présentation.'),
  },
  {
    files: ['apps/web/src/**'],
    ignores: ['apps/web/src/app/api/**'],
    rules: restrict(
      ['@etare/api', '@etare/adapters', '@etare/adapters/*', '@etare/application', 'pg'],
      'Le web passe par l’API HTTP (lib/api-client.ts) ; seul le route handler app/api monte le serveur.',
    ),
  },
]);
