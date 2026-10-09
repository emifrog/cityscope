import type { SubstanceRepository } from '@etare/application';
import { substanceSchema, type Substance, type SubstanceCreate, type SubstanceUpdate } from '@etare/contracts';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion } from './versioned';

const SELECT = `
  select s.id, s.site_id, s.name, s.hazard_classes, s.un_number, s.physical_state, s.quantity::float8 as quantity,
         s.unit, s.building_id, s.level_id, s.zone_id, s.location_note, s.fds_document_id, d.title as fds_title,
         s.notes, s.status, s.row_version
  from app.hazardous_substance s
  left join app.document d on d.id = s.fds_document_id
  where s.tenant_id = app.current_tenant_id()`;

/** Hazardous substances of the sites (RISK-03), site-scoped under RLS like the risks. */
export class PostgresSubstanceRepository implements SubstanceRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<Substance[] | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const { rows } = await this.client.query<Substance>(
      `${SELECT} and s.site_id = $1 order by s.status = 'archived', s.name, s.id`,
      [siteId],
    );
    return rows.map((row) => substanceSchema.parse(row));
  }

  async get(id: string): Promise<Substance | null> {
    const { rows } = await this.client.query<Substance>(`${SELECT} and s.id = $1`, [id]);
    return rows[0] ? substanceSchema.parse(rows[0]) : null;
  }

  async create(siteId: string, input: SubstanceCreate): Promise<Substance | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const { rows } = await this.client.query<{ id: string }>(
      `insert into app.hazardous_substance
         (tenant_id, site_id, name, hazard_classes, un_number, physical_state, quantity, unit,
          building_id, level_id, zone_id, location_note, fds_document_id, notes)
       values (app.current_tenant_id(), $1, $2, $3::text[], $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning id`,
      [
        siteId,
        input.name,
        input.hazard_classes,
        input.un_number ?? null,
        input.physical_state ?? null,
        input.quantity ?? null,
        input.unit ?? null,
        input.building_id ?? null,
        input.level_id ?? null,
        input.zone_id ?? null,
        input.location_note ?? null,
        input.fds_document_id ?? null,
        input.notes ?? null,
      ],
    );
    return this.get(rows[0]?.id ?? '');
  }

  async update(id: string, expectedVersion: number, patch: SubstanceUpdate): Promise<Substance | null> {
    if (!(await lockVersion(this.client, 'app.hazardous_substance', id, expectedVersion))) return null;
    const values = assignments(patch, {
      name: 'name',
      hazard_classes: { column: 'hazard_classes', expression: (parameter) => `${parameter}::text[]` },
      un_number: 'un_number',
      physical_state: 'physical_state',
      quantity: 'quantity',
      unit: 'unit',
      building_id: 'building_id',
      level_id: 'level_id',
      zone_id: 'zone_id',
      location_note: 'location_note',
      fds_document_id: 'fds_document_id',
      notes: 'notes',
      status: 'status',
    });
    await applyAssignments(this.client, 'app.hazardous_substance', id, values);
    return this.get(id);
  }

  private async siteVisible(siteId: string): Promise<boolean> {
    const site = await this.client.query(
      'select 1 from app.site where id = $1 and tenant_id = app.current_tenant_id()',
      [siteId],
    );
    return site.rowCount === 1;
  }
}
