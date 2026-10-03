import type {
  Building,
  BuildingCreate,
  BuildingUpdate,
  Classification,
  ClassificationCreate,
  ClassificationUpdate,
  Contact,
  ContactCreate,
  ContactUpdate,
  ExternalId,
  ExternalIdCreate,
  Level,
  LevelCreate,
  LevelUpdate,
  SiteCreate,
  SiteArchive,
  SiteDetail,
  SiteUpdate,
} from '@etare/contracts';
import { Conflict, type RequestContext } from '@etare/domain';
import type { RequestSession, SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

/**
 * Use cases of the editable site referential (SITE-01 to SITE-04). Reading
 * needs site:read, writing site:write; RLS applies the same rules again, and
 * every write is audited and recorded as authorship by PostgreSQL.
 */
type Ctx = RequestContext;

const SITE_NOT_FOUND = 'Site introuvable.';

async function visibleSite(session: RequestSession, siteId: string): Promise<SiteDetail> {
  return found(await session.sites.get(siteId), SITE_NOT_FOUND);
}

// ------------------------------------------------------------------ sites
export function createSite(sessions: SessionFactory, context: Ctx, input: SiteCreate): Promise<SiteDetail> {
  return inTenant(sessions, context, 'site:write', (session) => session.sites.create(input));
}

export function updateSite(
  sessions: SessionFactory,
  context: Ctx,
  id: string,
  expectedVersion: number,
  patch: SiteUpdate,
): Promise<SiteDetail> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.sites.update(id, expectedVersion, patch), SITE_NOT_FOUND),
  );
}

/**
 * Archives a site and its dossier (MET-04): refused while a version is in
 * force (a validator withdraws it first), a build runs or a revision waits for
 * a decision. Open drafts are closed; the history stays in the audit.
 */
export function archiveSite(
  sessions: SessionFactory,
  context: Ctx,
  id: string,
  expectedVersion: number,
  input: SiteArchive,
): Promise<SiteDetail> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    const current = await visibleSite(session, id);
    if (current.status === 'archived') throw new Conflict('Ce site est déjà archivé.');
    return found(await session.sites.archive(id, expectedVersion, input.reason), SITE_NOT_FOUND);
  });
}

export function restoreSite(
  sessions: SessionFactory,
  context: Ctx,
  id: string,
  expectedVersion: number,
): Promise<SiteDetail> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    const current = await visibleSite(session, id);
    if (current.status !== 'archived') throw new Conflict('Ce site n’est pas archivé.');
    return found(await session.sites.restore(id, expectedVersion), SITE_NOT_FOUND);
  });
}

// ------------------------------------------------------------------ buildings and levels
export function listBuildings(sessions: SessionFactory, context: Ctx, siteId: string): Promise<Building[]> {
  return inTenant(sessions, context, 'site:read', async (session) => {
    await visibleSite(session, siteId);
    return session.buildings.listBySite(siteId);
  });
}

export function createBuilding(
  sessions: SessionFactory,
  context: Ctx,
  siteId: string,
  input: BuildingCreate,
): Promise<Building> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.buildings.create(siteId, input), SITE_NOT_FOUND),
  );
}

export function updateBuilding(
  sessions: SessionFactory,
  context: Ctx,
  id: string,
  expectedVersion: number,
  patch: BuildingUpdate,
): Promise<Building> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.buildings.update(id, expectedVersion, patch), 'Bâtiment introuvable.'),
  );
}

export function createLevel(
  sessions: SessionFactory,
  context: Ctx,
  buildingId: string,
  input: LevelCreate,
): Promise<Level> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.buildings.createLevel(buildingId, input), 'Bâtiment introuvable.'),
  );
}

export function updateLevel(
  sessions: SessionFactory,
  context: Ctx,
  id: string,
  expectedVersion: number,
  patch: LevelUpdate,
): Promise<Level> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.buildings.updateLevel(id, expectedVersion, patch), 'Niveau introuvable.'),
  );
}

// ------------------------------------------------------------------ classifications
export function listClassifications(sessions: SessionFactory, context: Ctx, siteId: string): Promise<Classification[]> {
  return inTenant(sessions, context, 'site:read', async (session) => {
    await visibleSite(session, siteId);
    return session.classifications.listBySite(siteId);
  });
}

export function createClassification(
  sessions: SessionFactory,
  context: Ctx,
  siteId: string,
  input: ClassificationCreate,
): Promise<Classification> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.classifications.create(siteId, input), SITE_NOT_FOUND),
  );
}

export function updateClassification(
  sessions: SessionFactory,
  context: Ctx,
  id: string,
  expectedVersion: number,
  patch: ClassificationUpdate,
): Promise<Classification> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.classifications.update(id, expectedVersion, patch), 'Classification introuvable.'),
  );
}

// ------------------------------------------------------------------ contacts
export function listContacts(sessions: SessionFactory, context: Ctx, siteId: string): Promise<Contact[]> {
  return inTenant(sessions, context, 'site:read', async (session) => {
    await visibleSite(session, siteId);
    return session.contacts.listBySite(siteId);
  });
}

export function createContact(
  sessions: SessionFactory,
  context: Ctx,
  siteId: string,
  input: ContactCreate,
): Promise<Contact> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.contacts.create(siteId, input), SITE_NOT_FOUND),
  );
}

export function updateContact(
  sessions: SessionFactory,
  context: Ctx,
  id: string,
  expectedVersion: number,
  patch: ContactUpdate,
): Promise<Contact> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.contacts.update(id, expectedVersion, patch), 'Contact introuvable.'),
  );
}

// ------------------------------------------------------------------ external identifiers
export function listExternalIds(sessions: SessionFactory, context: Ctx, siteId: string): Promise<ExternalId[]> {
  return inTenant(sessions, context, 'site:read', async (session) => {
    await visibleSite(session, siteId);
    return session.externalIds.listBySite(siteId);
  });
}

export function createExternalId(
  sessions: SessionFactory,
  context: Ctx,
  siteId: string,
  input: ExternalIdCreate,
): Promise<ExternalId> {
  return inTenant(sessions, context, 'site:write', async (session) =>
    found(await session.externalIds.create(siteId, input), SITE_NOT_FOUND),
  );
}
