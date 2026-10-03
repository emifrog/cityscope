/**
 * Sprint 9 — SEC-03 through the real stack: limits counted in PostgreSQL outside
 * the transaction of the request (refused attempts count), 429 with Retry-After,
 * and sensitive refusals traced in the audit log with outcome 'denied'.
 */
import { randomUUID } from 'node:crypto';
import { DEFAULT_RATE_LIMITS, createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, requireEnv, signIn, withSecondFactor } from './helpers';

// Limits switched on for this file only, with fresh windows and low ceilings.
const run = randomUUID().slice(0, 8);
const app = createApiApp({
  ...createApiDependencies({ ...process.env, RATE_LIMITS: 'on' }),
  rateLimits: {
    ...DEFAULT_RATE_LIMITS,
    recovery: { name: `recovery-${run}`, limit: 2, windowSeconds: 600 },
    enrollment: { name: `enrollment-${run}`, limit: 2, windowSeconds: 600 },
  },
});
const admin = new pg.Client({ connectionString: requireEnv('LOCAL_DATABASE_ADMIN_URL') });

const call = (token: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(`${API_BASE_PATH}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'x-tenant-id': TENANT_06,
      'x-client-platform': 'web',
      'content-type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

/** Audit rows of a request, by its trace id. */
const trail = async (response: Response) =>
  (
    await admin.query<{ action: string; outcome: string; tenant_id: string | null; actor_user_id: string | null }>(
      'select action, outcome, tenant_id, actor_user_id from app.audit_event where trace_id = $1',
      [response.headers.get('x-trace-id')],
    )
  ).rows;

const factors: { token: string; factorId: string }[] = [];

beforeAll(async () => {
  await admin.connect();
});

afterAll(async () => {
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  await admin.end();
});

describe('rate limits', () => {
  it('count refused recovery codes and stop the guessing with a 429', async () => {
    const token = await signIn('lecteur06@demo.etare.test');
    const guess = () => call(token, 'POST', '/me/second-factor/recovery', { code: 'AAAAA-AAAAA' });
    const first = await guess();
    expect(await codeOf(first)).toBe('VALIDATION_FAILED');
    expect(await trail(first)).toEqual([
      expect.objectContaining({ action: 'security.recovery_refused', outcome: 'denied' }),
    ]);
    expect(await codeOf(await guess())).toBe('VALIDATION_FAILED');
    const stopped = await guess();
    expect(stopped.status).toBe(429);
    expect(Number(stopped.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await trail(stopped)).toEqual([expect.objectContaining({ action: 'security.rate_limited' })]);
    // Only the first refusal of the window is traced.
    expect(await trail(await guess())).toEqual([]);
  });

  it('stop the guessing of enrollment codes', async () => {
    const token = await signIn('ops06@demo.etare.test');
    const enroll = () =>
      call(token, 'POST', '/sync/enrollment', {
        code: 'ABCD-EFGH-JKLM',
        public_key: 'RBT2z2voNAO9JYKeVAH6W8barTg7dr9gu6JIi5OjM0U=',
        platform: 'android',
        app_version: '1.0.0',
        proof: 'AAAA',
      });
    expect((await enroll()).status).not.toBe(429);
    expect((await enroll()).status).not.toBe(429);
    expect((await enroll()).status).toBe(429);
  });
});

describe('traces of refusals', () => {
  it('names the person and the SIS of a refusal for want of the second factor', async () => {
    const token = await signIn('admin.sis06@demo.etare.test');
    const refused = await call(token, 'GET', '/members');
    expect(await codeOf(refused)).toBe('MFA_REQUIRED');
    const [row] = await trail(refused);
    expect(row).toMatchObject({ action: 'security.mfa_required', outcome: 'denied', tenant_id: TENANT_06 });
    expect(row?.actor_user_id).toBe('00000000-0000-4000-b000-000000000001');
  });

  it('never names a SIS the person does not belong to', async () => {
    const token = await signIn('redacteur83@demo.etare.test');
    const refused = await call(token, 'GET', '/sites');
    expect(refused.status).toBe(403);
    expect(await trail(refused)).toEqual([expect.objectContaining({ action: 'security.forbidden', tenant_id: null })]);
  });

  it('refuses and traces a browser request from another site', async () => {
    const factor = await withSecondFactor(await signIn('validateur06@demo.etare.test'));
    factors.push(factor);
    const foreign = await call(factor.token, 'GET', '/me', undefined, { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    expect(await trail(foreign)).toEqual([expect.objectContaining({ action: 'security.cross_origin' })]);
    expect(endpoints.getMe.response.parse(await (await call(factor.token, 'GET', '/me')).json()).user.email).toBe(
      'validateur06@demo.etare.test',
    );
  });
});
