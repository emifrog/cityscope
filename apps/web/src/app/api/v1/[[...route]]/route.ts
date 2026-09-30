import { getApiHandler } from '@etare/api';

// Thin adapter: the whole API (auth, tenant context, validation, errors) lives in services/api.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function handle(request: Request): Promise<Response> {
  return getApiHandler()(request);
}

export { handle as DELETE, handle as GET, handle as PATCH, handle as POST, handle as PUT };
