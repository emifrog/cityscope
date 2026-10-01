import type { AssetRepository, DocumentRepository, PendingUpload, StoredAsset } from '@etare/application';
import {
  documentSchema,
  type Document,
  type DocumentCreate,
  type DocumentUpdate,
  type DocumentVersionCreate,
  type FileDeclaration,
} from '@etare/contracts';
import type { ScanStatus } from '@etare/domain';
import { insertPendingAsset } from './pending-asset';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion, toIso } from './versioned';

interface DocumentRow {
  id: string;
  site_id: string;
  category: string;
  title: string;
  offline_policy: string;
  portal_visible: boolean;
  status: string;
  row_version: number;
}

interface VersionRow {
  document_id: string;
  id: string;
  version_no: number;
  valid_from: string | null;
  expires_at: string | null;
  created_at: Date;
  asset_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  scan_status: string;
  rejection_reason: string | null;
  asset_created_at: Date;
}

const DOCUMENT_COLUMNS =
  'd.id, d.site_id, d.category, d.title, d.offline_policy, d.portal_visible, d.status, d.row_version';
const VERSION_COLUMNS = `v.document_id, v.id, v.version_no, v.valid_from::text as valid_from, v.expires_at::text as expires_at,
  v.created_at, a.id as asset_id, a.filename, a.mime_type, a.size_bytes::int as size_bytes, a.sha256, a.scan_status,
  a.scan_detail ->> 'reason' as rejection_reason, a.created_at as asset_created_at`;

function toDocument(row: DocumentRow, versions: VersionRow[]): Document {
  return documentSchema.parse({
    ...row,
    versions: versions
      .filter((version) => version.document_id === row.id)
      .map((version) => ({
        id: version.id,
        version_no: version.version_no,
        valid_from: version.valid_from,
        expires_at: version.expires_at,
        created_at: toIso(version.created_at),
        asset: {
          id: version.asset_id,
          filename: version.filename,
          mime_type: version.mime_type,
          size_bytes: version.size_bytes,
          sha256: version.sha256,
          scan_status: version.scan_status,
          rejection_reason: version.rejection_reason,
          created_at: toIso(version.asset_created_at),
        },
      })),
  });
}

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<Document[]> {
    const documents = await this.client.query<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from app.document d
       where d.site_id = $1 and d.tenant_id = app.current_tenant_id()
       order by d.status, d.title`,
      [siteId],
    );
    const versions = await this.client.query<VersionRow>(
      `select ${VERSION_COLUMNS}
       from app.document_version v
       join app.asset a on a.tenant_id = v.tenant_id and a.id = v.asset_id
       where v.site_id = $1 and v.tenant_id = app.current_tenant_id()
       order by v.version_no desc`,
      [siteId],
    );
    return documents.rows.map((row) => toDocument(row, versions.rows));
  }

  async create(siteId: string, input: DocumentCreate): Promise<{ document: Document; upload: PendingUpload } | null> {
    const site = await this.client.query<{ tenant_id: string }>(
      'select tenant_id from app.site where id = $1 and tenant_id = app.current_tenant_id()',
      [siteId],
    );
    const tenantId = site.rows[0]?.tenant_id;
    if (!tenantId) return null;
    const document = await this.client.query<{ id: string }>(
      `insert into app.document (tenant_id, site_id, category, title, offline_policy, portal_visible)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [tenantId, siteId, input.category, input.title, input.offline_policy, input.portal_visible],
    );
    const documentId = document.rows[0]?.id ?? '';
    const upload = await this.insertVersion(tenantId, siteId, documentId, 1, input);
    return { document: await this.getOrFail(documentId), upload };
  }

  async addVersion(
    documentId: string,
    input: DocumentVersionCreate,
  ): Promise<{ document: Document; upload: PendingUpload } | null> {
    // Locking the document serializes concurrent uploads: version numbers stay strictly increasing.
    const document = await this.client.query<{ tenant_id: string; site_id: string; next_version: number }>(
      `select d.tenant_id, d.site_id,
              coalesce((select max(v.version_no) from app.document_version v where v.document_id = d.id), 0) + 1 as next_version
       from app.document d
       where d.id = $1 and d.tenant_id = app.current_tenant_id()
       for update`,
      [documentId],
    );
    const row = document.rows[0];
    if (!row) return null;
    const upload = await this.insertVersion(row.tenant_id, row.site_id, documentId, row.next_version, input);
    return { document: await this.getOrFail(documentId), upload };
  }

  async update(id: string, expectedVersion: number, patch: DocumentUpdate): Promise<Document | null> {
    if (!(await lockVersion(this.client, 'app.document', id, expectedVersion))) return null;
    await applyAssignments(
      this.client,
      'app.document',
      id,
      assignments(patch, {
        title: 'title',
        category: 'category',
        offline_policy: 'offline_policy',
        portal_visible: 'portal_visible',
        status: 'status',
      }),
    );
    return this.get(id);
  }

  private async insertVersion(
    tenantId: string,
    siteId: string,
    documentId: string,
    versionNo: number,
    input: { file: FileDeclaration; valid_from?: string | null | undefined; expires_at?: string | null | undefined },
  ): Promise<PendingUpload> {
    const upload = await insertPendingAsset(this.client, tenantId, siteId, input.file);
    await this.client.query(
      `insert into app.document_version (tenant_id, site_id, document_id, version_no, asset_id, valid_from, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, siteId, documentId, versionNo, upload.assetId, input.valid_from ?? null, input.expires_at ?? null],
    );
    return upload;
  }

  private async get(id: string): Promise<Document | null> {
    const document = await this.client.query<DocumentRow>(
      `select ${DOCUMENT_COLUMNS} from app.document d where d.id = $1 and d.tenant_id = app.current_tenant_id()`,
      [id],
    );
    const row = document.rows[0];
    if (!row) return null;
    const versions = await this.client.query<VersionRow>(
      `select ${VERSION_COLUMNS}
       from app.document_version v
       join app.asset a on a.tenant_id = v.tenant_id and a.id = v.asset_id
       where v.document_id = $1
       order by v.version_no desc`,
      [id],
    );
    return toDocument(row, versions.rows);
  }

  private async getOrFail(id: string): Promise<Document> {
    const document = await this.get(id);
    if (!document) throw new Error('Created document is not readable.');
    return document;
  }
}

export class PostgresAssetRepository implements AssetRepository {
  constructor(private readonly client: PoolClient) {}

  async get(id: string): Promise<StoredAsset | null> {
    const result = await this.client.query<{
      id: string;
      storage_key: string;
      filename: string;
      mime_type: string;
      scan_status: ScanStatus;
    }>(
      `select id, storage_key, filename, mime_type, scan_status from app.asset
       where id = $1 and tenant_id = app.current_tenant_id()`,
      [id],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          storageKey: row.storage_key,
          filename: row.filename,
          mimeType: row.mime_type,
          scanStatus: row.scan_status,
        }
      : null;
  }
}
