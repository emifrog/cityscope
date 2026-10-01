import type {
  BuiltPublication,
  PublicationBuildLease,
  PublicationBuildStore,
  PublicationToBuild,
} from '@etare/application';
import type { Pool } from './pool';

interface StartRow {
  tenant_id: string;
  site_id: string;
  publication_number: number;
  revision_id: string;
  revision_no: number;
  content_hash: string;
  snapshot: unknown;
  requested_by: string | null;
  requested_by_name: string;
  submitted_by: string | null;
  submitted_by_name: string;
  submitted_at: Date;
  approved_by: string | null;
  approved_by_name: string;
  approved_at: Date;
}

/** Publication build through SECURITY DEFINER functions granted to etare_worker only. */
export class PostgresPublicationBuildStore implements PublicationBuildStore {
  constructor(private readonly pool: Pool) {}

  async start(
    publicationId: string,
    tenantId: string,
    lease: PublicationBuildLease,
  ): Promise<PublicationToBuild | null> {
    const { rows } = await this.pool.query<StartRow>('select * from app.worker_start_publication($1, $2, $3, $4)', [
      publicationId,
      tenantId,
      lease.jobId,
      lease.attempt,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: publicationId,
      tenantId: row.tenant_id,
      siteId: row.site_id,
      publicationNumber: row.publication_number,
      revisionId: row.revision_id,
      revisionNo: row.revision_no,
      contentHash: row.content_hash,
      snapshot: row.snapshot,
      requestedBy: { id: row.requested_by, name: row.requested_by_name },
      submittedBy: { id: row.submitted_by, name: row.submitted_by_name },
      submittedAt: row.submitted_at,
      approvedBy: { id: row.approved_by, name: row.approved_by_name },
      approvedAt: row.approved_at,
    };
  }

  async complete(
    publicationId: string,
    built: BuiltPublication,
    lease: PublicationBuildLease,
  ): Promise<'published' | 'superseded' | null> {
    const { rows } = await this.pool.query<{ outcome: 'published' | 'superseded' | null }>(
      'select app.worker_complete_publication($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7::jsonb, $8, $9) as outcome',
      [
        publicationId,
        JSON.stringify(built.payload),
        JSON.stringify(built.manifest),
        built.manifestHash,
        built.templateVersion,
        built.pdfStorageKey,
        built.manifestSignature ? JSON.stringify(built.manifestSignature) : null,
        lease.jobId,
        lease.attempt,
      ],
    );
    return rows[0]?.outcome ?? null;
  }

  async assetFiles(
    tenantId: string,
    assetIds: readonly string[],
  ): Promise<{ id: string; storageKey: string; sha256: string; mimeType: string }[]> {
    if (assetIds.length === 0) return [];
    const { rows } = await this.pool.query<{ id: string; storage_key: string; sha256: string; mime_type: string }>(
      'select id, storage_key, sha256, mime_type from app.worker_publication_assets($1, $2::uuid[])',
      [tenantId, [...assetIds]],
    );
    return rows.map((row) => ({
      id: row.id,
      storageKey: row.storage_key,
      sha256: row.sha256,
      mimeType: row.mime_type,
    }));
  }

  async fail(publicationId: string, failureCode: string, lease: PublicationBuildLease): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_fail_publication($1, $2, $3, $4) as ok',
      [publicationId, failureCode, lease.jobId, lease.attempt],
    );
    return rows[0]?.ok === true;
  }
}
