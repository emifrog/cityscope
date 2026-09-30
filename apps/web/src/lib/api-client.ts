import {
  API_BASE_PATH,
  TENANT_HEADER,
  apiErrorSchema,
  endpoints,
  type ApiErrorCode,
  type MeResponse,
  type SiteDetail,
  type SiteListResponse,
} from '@etare/contracts';
import type { z } from 'zod';

/** Error returned by the product API, with its stable code and trace id (for support). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly traceId: string | null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ApiCallOptions {
  readonly token: string;
  readonly tenantId?: string;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

async function call<T extends z.ZodType>(
  schema: T,
  path: string,
  options: ApiCallOptions,
  query: Record<string, string | number | undefined> = {},
): Promise<z.infer<T>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${options.token}`,
    'x-client-platform': 'web',
  };
  if (options.tenantId) headers[TENANT_HEADER] = options.tenantId;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${API_BASE_PATH}${path}${search.size ? `?${search}` : ''}`, {
      headers,
      cache: 'no-store',
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch {
    throw new ApiRequestError(0, 'INTERNAL', 'Le service est injoignable. Vérifiez votre connexion.', null);
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, trace_id } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, trace_id);
    }
    throw new ApiRequestError(response.status, 'INTERNAL', 'Réponse inattendue du service.', null);
  }
  return schema.parse(body);
}

function pathOf(template: string, params: Record<string, string>): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => encodeURIComponent(params[name] ?? ''));
}

/** Typed client of the product API, driven by the shared contracts. */
export const api = {
  getMe: (options: ApiCallOptions): Promise<MeResponse> =>
    call(endpoints.getMe.response, endpoints.getMe.path, options),

  listSites: (options: ApiCallOptions, query: { limit?: number; cursor?: string } = {}): Promise<SiteListResponse> =>
    call(endpoints.listSites.response, endpoints.listSites.path, options, query),

  getSite: (options: ApiCallOptions, id: string): Promise<SiteDetail> =>
    call(endpoints.getSite.response, pathOf(endpoints.getSite.path, { id }), options),
};
