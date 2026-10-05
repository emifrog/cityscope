import type { Sector, SectorCommuneList, SectorList, SectorSave } from '@etare/contracts';
import type { RequestContext } from '@etare/domain';
import type { SessionFactory } from './ports';
import { inTenant, inTenantWithAny } from './use-cases';

/**
 * Sectors of the SIS (PER-01, ADR-025): named groups of sites, by commune and
 * site by site, perimeter of terminals and members. Composed by the
 * administration of the members (member:manage); read also by the
 * administration of the terminals, which assigns them.
 */
export function listSectors(sessions: SessionFactory, context: RequestContext): Promise<SectorList> {
  return inTenantWithAny(sessions, context, ['member:manage', 'device:manage'], (session) => session.sectors.list());
}

export function listSectorCommunes(sessions: SessionFactory, context: RequestContext): Promise<SectorCommuneList> {
  return inTenant(sessions, context, 'member:manage', async (session) => ({ items: await session.sectors.communes() }));
}

export function createSector(sessions: SessionFactory, context: RequestContext, input: SectorSave): Promise<Sector> {
  return inTenant(sessions, context, 'member:manage', (session) => session.sectors.save(null, null, input));
}

export function updateSector(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  input: SectorSave,
): Promise<Sector> {
  return inTenant(sessions, context, 'member:manage', (session) => session.sectors.save(id, expectedVersion, input));
}

export function archiveSector(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
): Promise<SectorList> {
  return inTenant(sessions, context, 'member:manage', async (session) => {
    await session.sectors.archive(id, expectedVersion);
    return session.sectors.list();
  });
}
