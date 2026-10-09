import type {
  ExportBuildResult,
  ExportBuildStore,
  ExportFile,
  ExportJob,
  ExportLease,
  ExportTable,
} from '@etare/application';
import type { Pool } from './pool';

interface JobRow {
  export_id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  requested_at: string;
  requested_by: string;
}

/** Worker side of the reversibility exports (ADR-033): every call is fenced by the database. */
export class PostgresExportBuildStore implements ExportBuildStore {
  constructor(private readonly pool: Pool) {}

  async start(exportId: string, tenantId: string, lease: ExportLease): Promise<ExportJob | null> {
    const { rows } = await this.pool.query<{ job: JobRow | null }>(
      'select app.worker_start_export($1, $2, $3, $4) as job',
      [exportId, tenantId, lease.jobId, lease.attempt],
    );
    const job = rows[0]?.job;
    return job
      ? {
          exportId: job.export_id,
          tenantId: job.tenant_id,
          tenantSlug: job.tenant_slug,
          tenantName: job.tenant_name,
          requestedAt: job.requested_at,
          requestedBy: job.requested_by,
        }
      : null;
  }

  async rows(
    exportId: string,
    tenantId: string,
    table: ExportTable,
    offset: number,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    const { rows } = await this.pool.query<{ row: Record<string, unknown> }>(
      'select r as row from app.worker_export_rows($1, $2, $3, $4, $5) r',
      [exportId, tenantId, table, offset, limit],
    );
    return rows.map((row) => row.row);
  }

  async files(exportId: string, tenantId: string): Promise<ExportFile[]> {
    const { rows } = await this.pool.query<{
      kind: ExportFile['kind'];
      storage_key: string;
      filename: string;
      media_type: string;
      size_bytes: string | null;
      sha256: string | null;
    }>('select kind, storage_key, filename, media_type, size_bytes, sha256 from app.worker_export_files($1, $2)', [
      exportId,
      tenantId,
    ]);
    return rows.map((row) => ({
      kind: row.kind,
      storageKey: row.storage_key,
      filename: row.filename,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
      sha256: row.sha256,
    }));
  }

  async recordObject(exportId: string, tenantId: string, key: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_record_export_object($1, $2, $3) as ok',
      [exportId, tenantId, key],
    );
    return rows[0]?.ok === true;
  }

  async complete(exportId: string, tenantId: string, result: ExportBuildResult): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_complete_export($1, $2, $3::jsonb, $4, $5, $6) as ok',
      [exportId, tenantId, JSON.stringify(result.parts), result.totalBytes, result.fileCount, result.rowCount],
    );
    return rows[0]?.ok === true;
  }

  async fail(exportId: string, tenantId: string, code: string, detail: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>('select app.worker_fail_export($1, $2, $3, $4) as ok', [
      exportId,
      tenantId,
      code,
      detail,
    ]);
    return rows[0]?.ok === true;
  }
}
