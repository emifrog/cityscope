import type { SiteDetail } from '@etare/contracts';
import {
  AccessDenied,
  NotFound,
  StrongAuthenticationRequired,
  TenantRequired,
  permissionsForRoles,
  type RequestContext,
  type Role,
} from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import type { RequestSession, SessionFactory } from './ports';
import { getMe, getSite, listSites, requirePermission } from './use-cases';

const tenantId = '06000000-0000-4000-8000-000000000000';
const context: RequestContext = {
  principal: { provider: 'supabase', subject: 'sub', email: 'a@demo.etare.test', assurance: 'aal1' },
  tenantId,
  traceId: 'trace',
  origin: 'web',
};

function fakeSessions(roles: Role[], site: SiteDetail | null = null) {
  const sites = { list: vi.fn(async () => ({ items: [], next_cursor: null })), get: vi.fn(async () => site) };
  const identity = { me: vi.fn(async () => ({ user: { id: 'u', email: 'e', display_name: null }, memberships: [] })) };
  const calls: RequestContext[] = [];
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) => {
      calls.push(ctx);
      return work({
        access: { userId: 'u', tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) },
        sites,
        identity,
      });
    },
  };
  return { sessions, sites, identity, calls };
}

describe('listSites', () => {
  it('requires an active tenant', async () => {
    const { sessions, calls } = fakeSessions(['READER']);
    await expect(listSites(sessions, { ...context, tenantId: null }, { limit: 25 })).rejects.toBeInstanceOf(
      TenantRequired,
    );
    expect(calls).toHaveLength(0);
  });

  it('requires site:read', async () => {
    const { sessions, sites } = fakeSessions(['OPS_USER']);
    await expect(listSites(sessions, context, { limit: 25 })).rejects.toBeInstanceOf(AccessDenied);
    expect(sites.list).not.toHaveBeenCalled();
  });

  it('lists the sites of the tenant for a reader', async () => {
    const { sessions, sites } = fakeSessions(['READER']);
    await expect(listSites(sessions, context, { limit: 10 })).resolves.toEqual({ items: [], next_cursor: null });
    expect(sites.list).toHaveBeenCalledWith({ limit: 10 });
  });
});

describe('getSite', () => {
  it('answers NOT_FOUND for unknown and foreign sites alike', async () => {
    const { sessions } = fakeSessions(['READER'], null);
    await expect(getSite(sessions, context, '83000002-0000-4000-8000-000000000001')).rejects.toBeInstanceOf(NotFound);
  });
});

describe('getMe', () => {
  it('runs without tenant context', async () => {
    const { sessions, calls } = fakeSessions([]);
    await getMe(sessions, context);
    expect(calls[0]?.tenantId).toBeNull();
  });
});

describe('requirePermission', () => {
  it('asks for a second factor on privileged permissions', () => {
    const access = { userId: 'u', tenantId, permissions: permissionsForRoles(['READER']) };
    expect(() => requirePermission(access, context, 'etare:approve')).toThrow(StrongAuthenticationRequired);
    expect(() =>
      requirePermission(
        access,
        { ...context, principal: { ...context.principal, assurance: 'aal2' } },
        'etare:approve',
      ),
    ).toThrow(AccessDenied);
  });
});
