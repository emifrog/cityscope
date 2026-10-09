import type { ExportPartLocation, ExportRepository } from '@etare/application';
import { exportRunSchema, type ExportRun } from '@etare/contracts';
import type { PoolClient } from './pool';

/** Exports of the SIS (ADMIN-04): reached through the database functions, which check export:manage. */
export class PostgresExportRepository implements ExportRepository {
  constructor(private readonly client: PoolClient) {}

  async list(): Promise<ExportRun[]> {
    const { rows } = await this.client.query<{ runs: unknown[] }>('select app.export_runs() as runs');
    return (rows[0]?.runs ?? []).map((run) => exportRunSchema.parse(run));
  }

  async request(): Promise<ExportRun> {
    const { rows } = await this.client.query<{ run: unknown }>('select app.request_export() as run');
    return exportRunSchema.parse(rows[0]?.run);
  }

  async part(exportId: string, index: number): Promise<ExportPartLocation | null> {
    const { rows } = await this.client.query<{
      part: { storage_key: string; filename: string; media_type: string } | null;
    }>('select app.export_part($1, $2) as part', [exportId, index]);
    const part = rows[0]?.part;
    return part ? { storageKey: part.storage_key, filename: part.filename, mediaType: part.media_type } : null;
  }
}
