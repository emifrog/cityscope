import type { Substance, SubstanceCreate, SubstanceUpdate } from '@etare/contracts';
import { InvalidInput, type RequestContext } from '@etare/domain';
import type { RequestSession, SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

/**
 * Hazardous substances of a site (RISK-03): read with the site, written by the prevision; the
 * safety data sheet is a document of the same site classed FDS (checked here for a clear message,
 * and again by the database).
 */
export function listSiteSubstances(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
): Promise<Substance[]> {
  return inTenant(sessions, context, 'site:read', async (session) =>
    found(await session.substances.listBySite(siteId), 'Site introuvable.'),
  );
}

async function checkSheet(session: RequestSession, siteId: string, documentId: string | null | undefined) {
  if (!documentId) return;
  const sheet = (await session.documents.listBySite(siteId)).find((document) => document.id === documentId);
  if (!sheet || sheet.status !== 'active' || sheet.category !== 'fds') {
    throw new InvalidInput('La fiche de données de sécurité est un document actif du site, classé FDS.', [
      { path: 'fds_document_id', message: 'Document du site classé FDS attendu.' },
    ]);
  }
}

export function createSiteSubstance(
  sessions: SessionFactory,
  context: RequestContext,
  siteId: string,
  input: SubstanceCreate,
): Promise<Substance> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    await checkSheet(session, siteId, input.fds_document_id);
    return found(await session.substances.create(siteId, input), 'Site introuvable.');
  });
}

export function updateSiteSubstance(
  sessions: SessionFactory,
  context: RequestContext,
  id: string,
  expectedVersion: number,
  patch: SubstanceUpdate,
): Promise<Substance> {
  return inTenant(sessions, context, 'site:write', async (session) => {
    const current = found(await session.substances.get(id), 'Matière introuvable.');
    if (patch.fds_document_id !== undefined) await checkSheet(session, current.site_id, patch.fds_document_id);
    return found(await session.substances.update(id, expectedVersion, patch), 'Matière introuvable.');
  });
}
