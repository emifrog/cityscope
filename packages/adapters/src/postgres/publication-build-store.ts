import type { BuiltPublication, PublicationBuildStore, PublicationToBuild } from '@etare/application';
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

  async start(publicationId: string, tenantId: string): Promise<PublicationToBuild | null> {
    const { rows } = await this.pool.query<StartRow>('select * from app.worker_start_publication($1, $2)', [
      publicationId,
      tenantId,
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

  async complete(publicationId: string, built: BuiltPublication): Promise<'published' | 'superseded' | null> {
    const { rows } = await this.pool.query<{ outcome: 'published' | 'superseded' | null }>(
      'select app.worker_complete_publication($1, $2::jsonb, $3::jsonb, $4, $5) as outcome',
      [
        publicationId,
        JSON.stringify(built.payload),
        JSON.stringify(built.manifest),
        built.manifestHash,
        built.templateVersion,
      ],
    );
    return rows[0]?.outcome ?? null;
  }

  async fail(publicationId: string, failureCode: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>('select app.worker_fail_publication($1, $2) as ok', [
      publicationId,
      failureCode,
    ]);
    return rows[0]?.ok === true;
  }
}
