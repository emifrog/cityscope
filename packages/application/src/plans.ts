import type { Plan, PlanCreate, PlanRevisionCreate, PlanUpdate, PlanUploadResponse } from '@etare/contracts';
import type { RequestContext } from '@etare/domain';
import { requireStorage, uploadTicket, type DocumentDependencies } from './uploads';
import { found, inTenant } from './use-cases';

/**
 * Level plans (PLAN-01, PLAN-06). A background is uploaded through the same
 * controlled chain as documents (quarantine, verification by the worker);
 * replacing it creates a new revision and keeps the previous ones.
 */
export function listPlans(deps: DocumentDependencies, context: RequestContext, siteId: string): Promise<Plan[]> {
  return inTenant(deps.sessions, context, 'site:read', async (session) =>
    found(await session.plans.listBySite(siteId), 'Site introuvable.'),
  );
}

export async function createPlan(
  deps: DocumentDependencies,
  context: RequestContext,
  siteId: string,
  input: PlanCreate,
): Promise<PlanUploadResponse> {
  const storage = requireStorage(deps);
  const created = await inTenant(deps.sessions, context, 'site:write', async (session) =>
    found(await session.plans.create(siteId, input), 'Site ou niveau introuvable.'),
  );
  return { plan: created.plan, upload: await uploadTicket(storage, created.upload) };
}

export async function addPlanRevision(
  deps: DocumentDependencies,
  context: RequestContext,
  planId: string,
  input: PlanRevisionCreate,
): Promise<PlanUploadResponse> {
  const storage = requireStorage(deps);
  const created = await inTenant(deps.sessions, context, 'site:write', async (session) =>
    found(await session.plans.addRevision(planId, input), 'Plan introuvable.'),
  );
  return { plan: created.plan, upload: await uploadTicket(storage, created.upload) };
}

export function updatePlan(
  deps: DocumentDependencies,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: PlanUpdate,
): Promise<Plan> {
  return inTenant(deps.sessions, context, 'site:write', async (session) =>
    found(await session.plans.update(id, expectedVersion, patch), 'Plan introuvable.'),
  );
}
