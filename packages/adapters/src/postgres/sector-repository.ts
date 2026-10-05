import type { SectorRepository } from '@etare/application';
import { sectorSchema, type Sector, type SectorCommuneList, type SectorList, type SectorSave } from '@etare/contracts';
import type { PoolClient } from './pool';

interface SectorRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  row_version: number;
  communes: { insee_code: string; label: string }[];
  sites: { id: string; name: string }[];
  site_count: string;
  member_count: string;
  device_count: string;
}

const toSector = (row: SectorRow): Sector =>
  sectorSchema.parse({
    ...row,
    site_count: Number(row.site_count),
    member_count: Number(row.member_count),
    device_count: Number(row.device_count),
  });

/** Sectors of the SIS (PER-01): read and written through app.admin_* functions only. */
export class PostgresSectorRepository implements SectorRepository {
  constructor(private readonly client: PoolClient) {}

  async list(): Promise<SectorList> {
    const [sectors, outside] = await Promise.all([
      this.client.query<SectorRow>('select * from app.admin_sectors()'),
      this.client.query<{ count: string }>('select app.admin_sites_outside_sectors() as count'),
    ]);
    return { items: sectors.rows.map(toSector), sites_outside_sectors: Number(outside.rows[0]?.count ?? 0) };
  }

  async communes(): Promise<SectorCommuneList['items']> {
    const { rows } = await this.client.query<{ insee_code: string; label: string; site_count: string }>(
      'select insee_code, label, site_count from app.admin_sector_communes()',
    );
    return rows.map((row) => ({ ...row, site_count: Number(row.site_count) }));
  }

  async save(id: string | null, expectedVersion: number | null, input: SectorSave): Promise<Sector> {
    const { rows } = await this.client.query<{ sector_id: string }>(
      'select sector_id from app.admin_save_sector($1, $2, $3, $4, $5, $6::jsonb, $7::uuid[])',
      [
        id,
        expectedVersion,
        input.name,
        input.code ?? null,
        input.description ?? null,
        JSON.stringify(input.communes),
        input.site_ids,
      ],
    );
    const saved = rows[0]?.sector_id;
    const sector = (await this.list()).items.find((item) => item.id === saved);
    if (!sector) throw new Error('Sector not readable after its change.');
    return sector;
  }

  async archive(id: string, expectedVersion: number): Promise<void> {
    await this.client.query('select app.admin_archive_sector($1, $2)', [id, expectedVersion]);
  }
}
