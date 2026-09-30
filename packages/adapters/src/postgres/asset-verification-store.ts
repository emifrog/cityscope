import type { AssetForVerification, AssetVerificationStore } from '@etare/application';
import type { ScanStatus } from '@etare/domain';
import type { Pool } from './pool';

interface Row {
  tenant_id: string;
  storage_key: string;
  quarantine_key: string | null;
  mime_type: string;
  size_bytes: string;
  sha256: string;
  scan_status: ScanStatus;
}

/** Worker side: dedicated SECURITY DEFINER functions, the worker role has no direct access to app.asset. */
export class PostgresAssetVerificationStore implements AssetVerificationStore {
  constructor(private readonly pool: Pool) {}

  async get(assetId: string): Promise<AssetForVerification | null> {
    const result = await this.pool.query<Row>(
      `select tenant_id, storage_key, quarantine_key, mime_type, size_bytes::text as size_bytes, sha256, scan_status
       from app.worker_asset_for_verification($1)`,
      [assetId],
    );
    const row = result.rows[0];
    return row
      ? {
          tenantId: row.tenant_id,
          storageKey: row.storage_key,
          quarantineKey: row.quarantine_key,
          mimeType: row.mime_type,
          sizeBytes: Number(row.size_bytes),
          sha256: row.sha256,
          scanStatus: row.scan_status,
        }
      : null;
  }

  async complete(assetId: string, verdict: 'clean' | 'rejected', detail: Record<string, unknown>): Promise<boolean> {
    const result = await this.pool.query<{ ok: boolean }>(
      'select app.worker_complete_asset_verification($1, $2, $3::jsonb) as ok',
      [assetId, verdict, JSON.stringify(detail)],
    );
    return result.rows[0]?.ok === true;
  }
}
