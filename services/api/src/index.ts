import { createApiApp, type ApiDependencies } from './app';
import { createApiDependencies } from './dependencies';

export { createApiApp, routerPath, type ApiDependencies } from './app';
export { createApiDependencies } from './dependencies';
export { toApiError } from './errors';
export { DEFAULT_RATE_LIMITS, type RateLimitRule, type RateLimitRules } from './network';

type FetchHandler = (request: Request) => Promise<Response>;

const globalCache = globalThis as typeof globalThis & { __etareApiHandler?: FetchHandler };

/**
 * Process-wide API handler, created lazily on the first request (so that
 * `next build` does not need runtime secrets) and cached on globalThis so
 * that dev hot-reloads do not open a new connection pool each time.
 */
export function getApiHandler(dependencies?: ApiDependencies): FetchHandler {
  if (!globalCache.__etareApiHandler) {
    const app = createApiApp(dependencies ?? createApiDependencies(process.env));
    globalCache.__etareApiHandler = async (request) => app.fetch(request);
  }
  return globalCache.__etareApiHandler;
}
