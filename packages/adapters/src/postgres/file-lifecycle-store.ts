import type {
  AssetForVariants,
  AssetVariantStore,
  FileMaintenanceStore,
  PublicationOutputToPurge,
  QuarantineToRelease,
} from '@etare/application';
import type { Pool } from './pool';

/** Worker side: reduced images of a clean image, through dedicated functions filtered by SIS. */
export class PostgresAssetVariantStore implements AssetVariantStore {
  constructor(private readonly pool: Pool) {}

  async get(assetId: string, tenantId: string): Promise<AssetForVariants | null> {
    const { rows } = await this.pool.query<{
      storage_key: string;
      mime_type: string;
      scan_status: AssetForVariants['scanStatus'];
      thumbnail_key: string | null;
    }>('select storage_key, mime_type, scan_status, thumbnail_key from app.worker_asset_for_variants($1, $2)', [
      assetId,
      tenantId,
    ]);
    const row = rows[0];
    return row
      ? {
          storageKey: row.storage_key,
          mimeType: row.mime_type,
          scanStatus: row.scan_status,
          thumbnailKey: row.thumbnail_key,
        }
      : null;
  }

  async record(assetId: string, tenantId: string, thumbnailKey: string, previewKey: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_record_asset_variants($1, $2, $3, $4) as ok',
      [assetId, tenantId, thumbnailKey, previewKey],
    );
    return rows[0]?.ok === true;
  }
}

/** Worker side: the database chooses what to remove and audits every removal. */
export class PostgresFileMaintenanceStore implements FileMaintenanceStore {
  constructor(private readonly pool: Pool) {}

  async schedule(slot: string): Promise<void> {
    await this.pool.query('select app.worker_schedule_maintenance($1)', [slot]);
  }

  async quarantineToRelease(limit: number): Promise<QuarantineToRelease[]> {
    const { rows } = await this.pool.query<{
      asset_id: string;
      tenant_id: string;
      quarantine_key: string;
      reason: QuarantineToRelease['reason'];
    }>('select asset_id, tenant_id, quarantine_key, reason from app.worker_quarantine_to_release($1)', [limit]);
    return rows.map((row) => ({
      assetId: row.asset_id,
      tenantId: row.tenant_id,
      quarantineKey: row.quarantine_key,
      reason: row.reason,
    }));
  }

  async releaseQuarantine(item: QuarantineToRelease): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>('select app.worker_release_quarantine($1, $2, $3) as ok', [
      item.assetId,
      item.tenantId,
      item.reason,
    ]);
    return rows[0]?.ok === true;
  }

  async publicationOutputsToPurge(limit: number): Promise<PublicationOutputToPurge[]> {
    const { rows } = await this.pool.query<{ output_id: string; tenant_id: string; storage_key: string }>(
      'select output_id, tenant_id, storage_key from app.worker_publication_outputs_to_purge($1)',
      [limit],
    );
    return rows.map((row) => ({ outputId: row.output_id, tenantId: row.tenant_id, storageKey: row.storage_key }));
  }

  async markPublicationOutputRemoved(outputId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_mark_publication_output_removed($1) as ok',
      [outputId],
    );
    return rows[0]?.ok === true;
  }

  async purgeRateLimits(): Promise<number> {
    const { rows } = await this.pool.query<{ purged: number }>('select app.worker_purge_rate_limits() as purged');
    return rows[0]?.purged ?? 0;
  }
}
