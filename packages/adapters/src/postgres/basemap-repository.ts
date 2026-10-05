import type { BasemapBuildResult, BasemapBuildStore, BasemapJob, BasemapRepository } from '@etare/application';
import { basemapSectorStateSchema, type BasemapSectorState } from '@etare/contracts';
import type { Pool, PoolClient } from './pool';

/** Base maps of the SIS for the administration (device:manage), through app.* functions only. */
export class PostgresBasemapRepository implements BasemapRepository {
  constructor(private readonly client: PoolClient) {}

  async overview(): Promise<BasemapSectorState[]> {
    const { rows } = await this.client.query<{ items: unknown[] }>('select app.basemap_overview() as items');
    return (rows[0]?.items ?? []).map((item) => basemapSectorStateSchema.parse(item));
  }

  async requestBuild(sectorId: string, sourceId: string): Promise<string> {
    const { rows } = await this.client.query<{ id: string }>('select app.request_basemap_build($1, $2) as id', [
      sectorId,
      sourceId,
    ]);
    const id = rows[0]?.id;
    if (!id) throw new Error('Base map build not queued.');
    return id;
  }
}

interface JobRow {
  pack_id: string;
  tenant_id: string;
  sector_id: string;
  sector_name: string;
  version: number;
  source_id: string;
  coverage: {
    site_count: number;
    extent: [number, number, number, number] | null;
    detail: [number, number][];
  };
}

/** Worker side of the base maps: preparation, planning and cleanup functions. */
export class PostgresBasemapBuildStore implements BasemapBuildStore {
  constructor(private readonly pool: Pool) {}

  async schedule(slot: string): Promise<void> {
    await this.pool.query('select app.worker_schedule_basemaps($1)', [slot]);
  }

  async plan(sourceId: string): Promise<number> {
    const { rows } = await this.pool.query<{ planned: number }>('select app.worker_plan_basemaps($1) as planned', [
      sourceId,
    ]);
    return rows[0]?.planned ?? 0;
  }

  async start(packId: string, tenantId: string): Promise<BasemapJob | null> {
    const { rows } = await this.pool.query<{ job: JobRow | null }>('select app.worker_start_basemap($1, $2) as job', [
      packId,
      tenantId,
    ]);
    const job = rows[0]?.job;
    if (!job) return null;
    const extent = job.coverage.extent;
    return {
      packId: job.pack_id,
      tenantId: job.tenant_id,
      sectorId: job.sector_id,
      sectorName: job.sector_name,
      version: job.version,
      sourceId: job.source_id,
      siteCount: job.coverage.site_count,
      coverage: {
        extent: extent ? [Number(extent[0]), Number(extent[1]), Number(extent[2]), Number(extent[3])] : null,
        detail: job.coverage.detail.map(([lon, lat]) => [Number(lon), Number(lat)] as const),
      },
    };
  }

  async recordObject(packId: string, tenantId: string, key: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_record_basemap_object($1, $2, $3) as ok',
      [packId, tenantId, key],
    );
    return rows[0]?.ok === true;
  }

  async complete(packId: string, tenantId: string, result: BasemapBuildResult): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_complete_basemap($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7, $8, $9) as ok',
      [
        packId,
        tenantId,
        JSON.stringify(result.manifest),
        result.manifestHash,
        JSON.stringify(result.signature),
        JSON.stringify(
          result.files.map((file) => ({
            sha256: file.sha256,
            size_bytes: file.sizeBytes,
            storage_key: file.storageKey,
          })),
        ),
        result.totalBytes,
        result.tileCount,
        result.renewAfter,
      ],
    );
    return rows[0]?.ok === true;
  }

  async fail(packId: string, tenantId: string, code: string, detail: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>('select app.worker_fail_basemap($1, $2, $3, $4) as ok', [
      packId,
      tenantId,
      code,
      detail,
    ]);
    return rows[0]?.ok === true;
  }

  async objectsToRemove(limit: number): Promise<{ packId: string; tenantId: string; keys: readonly string[] }[]> {
    const { rows } = await this.pool.query<{ pack_id: string; tenant_id: string; storage_keys: string[] }>(
      'select pack_id, tenant_id, storage_keys from app.worker_basemap_objects_to_remove($1)',
      [limit],
    );
    return rows.map((row) => ({ packId: row.pack_id, tenantId: row.tenant_id, keys: row.storage_keys }));
  }

  async markRemoved(packId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>(
      'select app.worker_mark_basemap_objects_removed($1) as ok',
      [packId],
    );
    return rows[0]?.ok === true;
  }
}
