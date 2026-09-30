import type { ZoneRepository } from '@etare/application';
import { zoneSchema, type Zone, type ZoneCreate, type ZoneUpdate } from '@etare/contracts';
import {
  localGeometry,
  placementAssignments,
  placementValues,
  planPositionColumn,
  planPositionJoin,
} from './plan-position';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion } from './versioned';

const ZONE_SELECT = `
  select z.id, z.site_id, z.level_id, z.name, z.zone_type, ${planPositionColumn('z')}, z.status, z.row_version
  from app.zone z
  ${planPositionJoin('z')}
  where z.tenant_id = app.current_tenant_id()`;

/** Zones of the levels (rooms, refuges, technical rooms…), drawn on the current background of a level plan. */
export class PostgresZoneRepository implements ZoneRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<Zone[] | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const { rows } = await this.client.query<Zone>(
      `${ZONE_SELECT} and z.site_id = $1 order by z.status = 'archived', z.name, z.id`,
      [siteId],
    );
    return rows.map((row) => zoneSchema.parse(row));
  }

  async get(id: string): Promise<Zone | null> {
    const { rows } = await this.client.query<Zone>(`${ZONE_SELECT} and z.id = $1`, [id]);
    return rows[0] ? zoneSchema.parse(rows[0]) : null;
  }

  async create(siteId: string, input: ZoneCreate): Promise<Zone | null> {
    if (!(await this.siteVisible(siteId))) return null;
    // The level is the one of the plan (set by the placement trigger).
    const { rows } = await this.client.query<{ id: string }>(
      `insert into app.zone (tenant_id, site_id, name, zone_type, plan_revision_id, local_geom)
       values (app.current_tenant_id(), $1, $2, $3, $4, ${localGeometry('$5')})
       returning id`,
      [siteId, input.name, input.zone_type, ...placementValues(input.plan_position)],
    );
    return this.get(rows[0]?.id ?? '');
  }

  async update(id: string, expectedVersion: number, patch: ZoneUpdate): Promise<Zone | null> {
    if (!(await lockVersion(this.client, 'app.zone', id, expectedVersion))) return null;
    await applyAssignments(this.client, 'app.zone', id, [
      ...assignments(patch, { name: 'name', zone_type: 'zone_type', status: 'status' }),
      ...placementAssignments(patch.plan_position),
    ]);
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
