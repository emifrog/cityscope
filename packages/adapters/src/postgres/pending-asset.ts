import { randomUUID } from 'node:crypto';
import type { PendingUpload } from '@etare/application';
import type { Asset, FileDeclaration } from '@etare/contracts';
import { assetStorageKey, quarantineStorageKey } from '@etare/domain';
import type { PoolClient } from './pool';
import { toIso } from './versioned';

/**
 * Declares a file about to be uploaded (documents, plan backgrounds): the
 * asset starts 'pending' with a quarantine key of its SIS; the worker will
 * check it against this declaration before it can ever be served.
 */
export async function insertPendingAsset(
  client: PoolClient,
  tenantId: string,
  siteId: string,
  file: FileDeclaration,
): Promise<PendingUpload> {
  const assetId = randomUUID();
  const objectVersion = randomUUID();
  const quarantineKey = quarantineStorageKey(tenantId, assetId, objectVersion);
  await client.query(
    `insert into app.asset
       (id, tenant_id, site_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      assetId,
      tenantId,
      siteId,
      assetStorageKey(tenantId, assetId, objectVersion),
      quarantineKey,
      file.filename,
      file.mime_type,
      file.size_bytes,
      file.sha256,
    ],
  );
  return { assetId, quarantineKey, mimeType: file.mime_type };
}

/** Asset columns of a joined `app.asset a`, prefixed to avoid name clashes. */
export const ASSET_COLUMNS = `a.id as asset_id, a.filename as asset_filename, a.mime_type as asset_mime_type,
  a.size_bytes::int as asset_size_bytes, a.sha256 as asset_sha256, a.scan_status as asset_scan_status,
  a.scan_detail ->> 'reason' as asset_rejection_reason, a.created_at as asset_created_at`;

export interface AssetColumns {
  asset_id: string;
  asset_filename: string;
  asset_mime_type: string;
  asset_size_bytes: number;
  asset_sha256: string;
  asset_scan_status: string;
  asset_rejection_reason: string | null;
  asset_created_at: Date;
}

export const toAsset = (row: AssetColumns) =>
  ({
    id: row.asset_id,
    filename: row.asset_filename,
    mime_type: row.asset_mime_type,
    size_bytes: row.asset_size_bytes,
    sha256: row.asset_sha256,
    scan_status: row.asset_scan_status,
    rejection_reason: row.asset_rejection_reason,
    created_at: toIso(row.asset_created_at),
  }) as Asset;
