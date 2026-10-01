import type { AssetDownload, PortalSite, PortalSiteList } from '@etare/contracts';
import { TenantRequired, type RequestContext } from '@etare/domain';
import type { RequestSession, SessionFactory } from './ports';
import { requireStorage, type DocumentDependencies } from './uploads';
import { found } from './use-cases';

/**
 * Consultation by the exploitant (POR-02, ADR-019): the published version of
 * their sites, through a whitelist computed in PostgreSQL. Access is checked
 * there, site by site (portal:read, with the second factor setting of the SIS);
 * a site or a document that is not open reads as not found.
 */
const DOWNLOAD_URL_SECONDS = 60;

function inPortal<T>(
  sessions: SessionFactory,
  context: RequestContext,
  work: (session: RequestSession) => Promise<T>,
): Promise<T> {
  if (!context.tenantId) throw new TenantRequired();
  return sessions.run(context, work);
}

export function listPortalSites(sessions: SessionFactory, context: RequestContext): Promise<PortalSiteList> {
  return inPortal(sessions, context, async (session) => ({ items: await session.portal.sites() }));
}

export function getPortalSite(sessions: SessionFactory, context: RequestContext, siteId: string): Promise<PortalSite> {
  return inPortal(sessions, context, async (session) => found(await session.portal.site(siteId), 'Site introuvable.'));
}

export async function getPortalDocumentDownload(
  deps: DocumentDependencies,
  context: RequestContext,
  siteId: string,
  documentId: string,
): Promise<AssetDownload> {
  const storage = requireStorage(deps);
  const asset = await inPortal(deps.sessions, context, async (session) => {
    const file = found(await session.portal.documentFile(siteId, documentId), 'Document introuvable.');
    await session.audit.record('portal.document_download', 'document', documentId, {
      site_id: siteId,
      filename: file.filename,
    });
    return file;
  });
  const { url, expiresAt } = await storage.createDownloadUrl(asset.storageKey, DOWNLOAD_URL_SECONDS);
  return { url, expires_at: expiresAt.toISOString(), filename: asset.filename, mime_type: asset.mimeType };
}
