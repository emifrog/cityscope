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
import { stubSession } from './testing';
import { createSite } from './referential';
import { getMe, getSite, inTenant, listSites, requirePermission } from './use-cases';

const tenantId = '06000000-0000-4000-8000-000000000000';
const context: RequestContext = {
  principal: { provider: 'supabase', subject: 'sub', email: 'a@demo.etare.test', assurance: 'aal1' },
  tenantId,
  traceId: 'trace',
  origin: 'web',
};

function fakeSessions(roles: Role[], site: SiteDetail | null = null) {
  const sites = { list: vi.fn(async () => ({ items: [], next_cursor: null })), get: vi.fn(async () => site) };
  const identity = {
    me: vi.fn(async () => ({
      user: { id: 'u', email: 'e', display_name: null, second_factor: false, second_factor_reenrollment: false },
      memberships: [],
    })),
  };
  const calls: RequestContext[] = [];
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) => {
      calls.push(ctx);
      return work(
        stubSession(
          { userId: 'u', tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) },
          { sites, identity },
        ),
      );
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

describe('members limited to part of the SIS (PER-01)', () => {
  /** No permission over the whole SIS; site:read held on sectors only. */
  function partSessions(held: readonly string[]) {
    const holdsOnPart = vi.fn(async (permission: string) => held.includes(permission));
    const sites = { list: vi.fn(async () => ({ items: [], next_cursor: null })), create: vi.fn() };
    const sessions: SessionFactory = {
      run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) =>
        work(
          stubSession(
            { userId: 'u', tenantId: ctx.tenantId, permissions: new Set() },
            { sites, identity: { holdsOnPart, holdsWithSecondFactor: async () => false } },
          ),
        ),
    };
    return { sessions, sites, holdsOnPart };
  }

  it('let in a member holding the permission on sectors: row-level security shows their part', async () => {
    const { sessions, sites } = partSessions(['site:read']);
    await expect(listSites(sessions, context, { limit: 10 })).resolves.toEqual({ items: [], next_cursor: null });
    expect(sites.list).toHaveBeenCalled();
  });

  it('never for the administration of the SIS, held over the whole SIS only', async () => {
    const { sessions, holdsOnPart } = partSessions(['member:manage']);
    await expect(inTenant(sessions, context, 'member:manage', async () => 'done')).rejects.toBeInstanceOf(AccessDenied);
    expect(holdsOnPart).not.toHaveBeenCalled();
  });

  it('nor to create a site, which would belong to no sector yet', async () => {
    const { sessions, sites } = partSessions(['site:write']);
    await expect(
      createSite(sessions, context, { name: 'Nouveau', site_type: 'erp', status: 'draft', sensitivity: 'normal' }),
    ).rejects.toBeInstanceOf(AccessDenied);
    expect(sites.create).not.toHaveBeenCalled();
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

  it('is the one request an enrolled account may make without its code (profile purpose)', async () => {
    const { sessions, calls } = fakeSessions([]);
    await getMe(sessions, context);
    expect(calls[0]?.purpose).toBe('profile');
  });
});

describe('requirePermission', () => {
  const access = { userId: 'u', tenantId, permissions: permissionsForRoles(['READER']) };

  it('asks for a second factor when the roles grant the permission with it', () => {
    expect(() => requirePermission(access, context, 'etare:approve', true)).toThrow(StrongAuthenticationRequired);
  });

  it('refuses without mentioning the second factor when the roles do not grant the permission', () => {
    expect(() => requirePermission(access, context, 'etare:approve')).toThrow(AccessDenied);
    const aal2 = { ...context, principal: { ...context.principal, assurance: 'aal2' as const } };
    expect(() => requirePermission(access, aal2, 'etare:approve', true)).toThrow(AccessDenied);
  });
});
