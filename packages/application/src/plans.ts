import type {
  Plan,
  PlanCreate,
  PlanRevisionCreate,
  PlanUpdate,
  PlanUploadResponse,
  UploadTicket,
} from '@etare/contracts';
import { ServiceUnavailable, type RequestContext } from '@etare/domain';
import type { DocumentDependencies } from './documents';
import type { ObjectStorage, PendingUpload } from './ports';
import { found, inTenant } from './use-cases';

/**
 * Level plans (PLAN-01, PLAN-06). A background is uploaded through the same
 * controlled chain as documents (quarantine, verification by the worker);
 * replacing it creates a new revision and keeps the previous ones.
 */
function requireStorage(deps: DocumentDependencies): ObjectStorage {
  if (!deps.storage) throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  return deps.storage;
}

async function ticket(storage: ObjectStorage, upload: PendingUpload): Promise<UploadTicket> {
  const { url, headers, expiresAt } = await storage.createUploadUrl(upload.quarantineKey, upload.mimeType);
  return { asset_id: upload.assetId, method: 'PUT', url, headers, expires_at: expiresAt.toISOString() };
}

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
  // The signed URL is requested after the commit: no network call inside the transaction.
  return { plan: created.plan, upload: await ticket(storage, created.upload) };
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
  return { plan: created.plan, upload: await ticket(storage, created.upload) };
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
