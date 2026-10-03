import type { DeviceRepository, DistributedPackage } from '@etare/application';
import {
  catalogEntrySchema,
  catalogWithdrawalSchema,
  deviceEnrollmentSchema,
  deviceSchema,
  signatureSchema,
  type CatalogEntry,
  type CatalogWithdrawal,
  type Device,
  type DeviceEnrollment,
  type SyncReceipt,
} from '@etare/contracts';
import { deviceState, type DevicePlatform, type DeviceStatus, type SyncReceiptStatus } from '@etare/domain';
import type { PoolClient } from './pool';
import { toIso } from './versioned';

interface DeviceRow {
  id: string;
  name: string;
  status: DeviceStatus;
  platform: DevicePlatform | null;
  enrollment_expires_at: Date | null;
  enrolled_at: Date | null;
  enrolled_by_name: string | null;
  revoked_at: Date | null;
  revocation_reason: string | null;
  app_version: string | null;
  last_user_name: string | null;
  last_seen_at: Date | null;
  last_sync_at: Date | null;
  last_status: SyncReceiptStatus | null;
  last_error_code: string | null;
  catalog_generation: string | null;
  installed_generation: string | null;
  installed_sites: number;
  created_at: Date;
  row_version: number;
}

/** Terminals of the current SIS with their synchronization state (RLS: device:manage). */
const DEVICE_SELECT = `
  select d.id, d.name, d.status, d.platform, d.enrollment_expires_at, d.enrolled_at,
         app.member_name(d.enrolled_by) as enrolled_by_name, d.revoked_at, d.revocation_reason,
         s.app_version, app.member_name(s.last_user_id) as last_user_name, s.last_seen_at, s.last_sync_at,
         s.last_status, s.last_error_code, s.catalog_generation, s.installed_generation,
         (select count(*)::int from app.device_publication p where p.device_id = d.id) as installed_sites,
         d.created_at, d.row_version
  from app.device d
  left join app.device_sync_state s on s.device_id = d.id
  where d.tenant_id = app.current_tenant_id()`;

const generation = (value: string | null) => (value === null ? null : Number(value));

function toDevice(row: DeviceRow, now: Date): Device {
  return deviceSchema.parse({
    id: row.id,
    name: row.name,
    status: row.status,
    state: deviceState({ status: row.status, lastSyncAt: row.last_sync_at, lastSyncStatus: row.last_status, now }),
    platform: row.platform,
    enrollment_expires_at: toIso(row.enrollment_expires_at),
    enrolled_at: toIso(row.enrolled_at),
    enrolled_by_name: row.enrolled_by_name,
    revoked_at: toIso(row.revoked_at),
    revocation_reason: row.revocation_reason,
    app_version: row.app_version,
    last_user_name: row.last_user_name,
    last_seen_at: toIso(row.last_seen_at),
    last_sync_at: toIso(row.last_sync_at),
    last_sync_status: row.last_status,
    last_error_code: row.last_error_code,
    catalog_generation: generation(row.catalog_generation),
    installed_generation: generation(row.installed_generation),
    installed_sites: row.installed_sites,
    created_at: row.created_at.toISOString(),
    row_version: row.row_version,
  } satisfies Device);
}

interface CatalogRow {
  site_id: string;
  publication_id: string;
  publication_number: number;
  manifest_hash: string;
  published_at: string;
  size_bytes: number;
  etare_number: string | null;
  site_name: string;
}

/**
 * Administration reads are plain queries under RLS (device:manage); every
 * change and every terminal access goes through app.admin_* and app.sync_*
 * functions, which re-check the permission and the terminal in PostgreSQL.
 */
export class PostgresDeviceRepository implements DeviceRepository {
  constructor(
    private readonly client: PoolClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(): Promise<{ items: Device[]; currentGeneration: number; undistributedPublications: number }> {
    const [devices, overview] = await Promise.all([
      this.client.query<DeviceRow>(`${DEVICE_SELECT} order by d.status = 'revoked', lower(d.name), d.id`),
      this.client.query<{ generation: string; undistributed: number }>(
        `select coalesce((select g.generation from app.distribution_generation g
                          where g.tenant_id = app.current_tenant_id()), 0) as generation,
                (select count(*)::int from app.publication p
                 where p.tenant_id = app.current_tenant_id() and p.status = 'published'
                   and (p.manifest_signature is null or p.sensitivity <> 'normal')) as undistributed`,
      ),
    ]);
    const now = this.now();
    return {
      items: devices.rows.map((row) => toDevice(row, now)),
      currentGeneration: Number(overview.rows[0]?.generation ?? 0),
      undistributedPublications: overview.rows[0]?.undistributed ?? 0,
    };
  }

  async get(id: string): Promise<Device | null> {
    const { rows } = await this.client.query<DeviceRow>(`${DEVICE_SELECT} and d.id = $1`, [id]);
    return rows[0] ? toDevice(rows[0], this.now()) : null;
  }

  private async required(id: string): Promise<Device> {
    const device = await this.get(id);
    if (!device) throw new Error('Terminal not readable after its change.');
    return device;
  }

  async create(name: string, codeHash: string, expiresAt: Date): Promise<Device> {
    const { rows } = await this.client.query<{ id: string }>('select app.admin_create_device($1, $2, $3) as id', [
      name,
      codeHash,
      expiresAt,
    ]);
    return this.required(rows[0]?.id ?? '');
  }

  async renewCode(id: string, expectedVersion: number, codeHash: string, expiresAt: Date): Promise<Device> {
    await this.client.query('select app.admin_renew_device_code($1, $2, $3, $4)', [
      id,
      expectedVersion,
      codeHash,
      expiresAt,
    ]);
    return this.required(id);
  }

  async revoke(id: string, expectedVersion: number, reason: string): Promise<Device> {
    await this.client.query('select app.admin_revoke_device($1, $2, $3)', [id, expectedVersion, reason]);
    return this.required(id);
  }

  async enroll(input: {
    codeHash: string;
    publicKey: string;
    platform: DevicePlatform;
    appVersion: string;
  }): Promise<DeviceEnrollment> {
    const { rows } = await this.client.query(
      'select device_id, device_name, tenant_id, tenant_name from app.enroll_device($1, $2, $3, $4)',
      [input.codeHash, input.publicKey, input.platform, input.appVersion],
    );
    return deviceEnrollmentSchema.parse(rows[0]);
  }

  async syncDevice(id: string): Promise<{ status: DeviceStatus; publicKey: string | null } | null> {
    const { rows } = await this.client.query<{ status: DeviceStatus; public_key: string | null }>(
      'select status, public_key from app.sync_device($1)',
      [id],
    );
    return rows[0] ? { status: rows[0].status, publicKey: rows[0].public_key } : null;
  }

  async catalog(
    deviceId: string,
    appVersion: string | null,
  ): Promise<{
    generation: number;
    tenantName: string;
    publications: CatalogEntry[];
    withdrawals: CatalogWithdrawal[];
  }> {
    const { rows } = await this.client.query<{
      catalog: {
        generation: number;
        tenant_name: string;
        publications: CatalogRow[];
        withdrawals?: (Omit<CatalogWithdrawal, 'at'> & { at: string })[];
      };
    }>('select app.sync_catalog($1, $2) as catalog', [deviceId, appVersion]);
    const catalog = rows[0]?.catalog;
    if (!catalog) throw new Error('Empty catalogue.');
    return {
      generation: Number(catalog.generation),
      tenantName: catalog.tenant_name,
      publications: catalog.publications.map((entry) =>
        catalogEntrySchema.parse({ ...entry, published_at: new Date(entry.published_at).toISOString() }),
      ),
      withdrawals: (catalog.withdrawals ?? []).map((entry) =>
        catalogWithdrawalSchema.parse({ ...entry, at: new Date(entry.at).toISOString() }),
      ),
    };
  }

  async package(deviceId: string, publicationId: string): Promise<DistributedPackage | null> {
    const { rows } = await this.client.query<{
      manifest: unknown;
      manifest_hash: string;
      manifest_signature: unknown;
      payload: unknown;
    }>('select manifest, manifest_hash, manifest_signature, payload from app.sync_package($1, $2)', [
      deviceId,
      publicationId,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      manifest: row.manifest,
      manifestHash: row.manifest_hash,
      signature: signatureSchema.parse(row.manifest_signature),
      payload: row.payload,
    };
  }

  async packageFiles(
    deviceId: string,
    publicationId: string,
    sha256: readonly string[],
  ): Promise<{ sha256: string; storageKey: string }[]> {
    const { rows } = await this.client.query<{ sha256: string; storage_key: string | null }>(
      'select sha256, storage_key from app.sync_package_files($1, $2, $3)',
      [deviceId, publicationId, sha256],
    );
    return rows.flatMap((row) => (row.storage_key ? [{ sha256: row.sha256, storageKey: row.storage_key }] : []));
  }

  async receipt(deviceId: string, receipt: SyncReceipt): Promise<number> {
    const { rows } = await this.client.query<{ installed: number }>(
      'select app.sync_receipt($1, $2, $3, $4, $5) as installed',
      [deviceId, receipt.generation, receipt.status, receipt.error_code, receipt.installed],
    );
    return rows[0]?.installed ?? 0;
  }
}
