import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, api } from './api-client';

const tenant = '06000000-0000-4000-8000-000000000000';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('api client', () => {
  it('sends the bearer token, the active SIS and parses the contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(200, { items: [], next_cursor: null }));
    await expect(api.listSites({ token: 't', tenantId: tenant, fetchImpl }, { limit: 10 })).resolves.toEqual({
      items: [],
      next_cursor: null,
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/sites?limit=10');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer t', 'x-tenant-id': tenant });
    expect(init?.cache).toBe('no-store');
  });

  it('encodes path parameters', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'Site introuvable.', trace_id: 'abc' } }),
    );
    await expect(api.getSite({ token: 't', tenantId: tenant, fetchImpl }, '../me')).rejects.toBeInstanceOf(
      ApiRequestError,
    );
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/api/v1/sites/..%2Fme');
  });

  it('exposes the stable error code and trace id', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'Accès refusé.', trace_id: 'trace-1' } }),
    );
    const error = await api.getMe({ token: 't', fetchImpl }).catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', traceId: 'trace-1' });
  });

  it('rejects answers that break the contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(200, { items: 'nope' }));
    await expect(api.listSites({ token: 't', tenantId: tenant, fetchImpl })).rejects.toThrow();
  });

  it('reports network failures without technical details', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(api.getMe({ token: 't', fetchImpl })).rejects.toMatchObject({ status: 0 });
  });
});
