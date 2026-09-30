/**
 * Standalone HTTP server for the API. Not used at MVP (the web app serves the
 * same handler under /api/v1); it demonstrates and tests that the API can be
 * extracted into its own process without duplicating any rule (ADR-001).
 */
import { serve } from '@hono/node-server';
import { createApiApp } from './app';
import { createApiDependencies } from './dependencies';

const port = Number(process.env['API_PORT'] ?? 3001);
const dependencies = createApiDependencies(process.env);
const app = createApiApp(dependencies);

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  dependencies.logger.info('api listening', { url: `http://127.0.0.1:${info.port}/api/v1` });
});
