import type { BuildingRepository } from '@etare/application';
import {
  buildingSchema,
  levelSchema,
  type Building,
  type BuildingCreate,
  type BuildingUpdate,
  type Level,
  type LevelCreate,
  type LevelUpdate,
} from '@etare/contracts';
import type { PoolClient } from './pool';
import { applyAssignments, asGeoJsonText, assignments, geoJsonSurface, lockVersion } from './versioned';

const BUILDING_COLUMNS = `b.id, b.site_id, b.name, b.code, b.status, b.sort_order, b.construction_type,
  b.height_m::float8 as height_m, b.floors_above, b.floors_below, b.notes, b.row_version,
  extensions.st_asgeojson(b.geom, 7)::json as footprint`;
const LEVEL_COLUMNS = `l.id, l.building_id, l.label, l.sort_order, l.elevation_m::float8 as elevation_m, l.status, l.row_version`;

type BuildingRow = Omit<Building, 'levels'>;

export class PostgresBuildingRepository implements BuildingRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<Building[]> {
    const buildings = await this.client.query<BuildingRow>(
      `select ${BUILDING_COLUMNS} from app.building b
       where b.site_id = $1 and b.tenant_id = app.current_tenant_id()
       order by b.sort_order, b.name`,
      [siteId],
    );
    const levels = await this.client.query<Level>(
      `select ${LEVEL_COLUMNS} from app.level l
       where l.site_id = $1 and l.tenant_id = app.current_tenant_id()
       order by l.sort_order, l.label`,
      [siteId],
    );
    return buildings.rows.map((building) =>
      buildingSchema.parse({ ...building, levels: levels.rows.filter((level) => level.building_id === building.id) }),
    );
  }

  async create(siteId: string, input: BuildingCreate): Promise<Building | null> {
    const site = await this.client.query(
      'select 1 from app.site where id = $1 and tenant_id = app.current_tenant_id()',
      [siteId],
    );
    if (site.rowCount !== 1) return null;
    const result = await this.client.query<{ id: string }>(
      `insert into app.building
         (tenant_id, site_id, name, code, sort_order, construction_type, height_m, floors_above, floors_below, notes, geom)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9, ${geoJsonSurface('$10')})
       returning id`,
      [
        siteId,
        input.name,
        input.code ?? null,
        input.sort_order ?? 0,
        input.construction_type ?? null,
        input.height_m ?? null,
        input.floors_above ?? null,
        input.floors_below ?? null,
        input.notes ?? null,
        input.footprint ? JSON.stringify(input.footprint) : null,
      ],
    );
    return this.getBuilding(result.rows[0]?.id ?? '');
  }

  async update(id: string, expectedVersion: number, patch: BuildingUpdate): Promise<Building | null> {
    if (!(await lockVersion(this.client, 'app.building', id, expectedVersion))) return null;
    await applyAssignments(
      this.client,
      'app.building',
      id,
      assignments(patch, {
        name: 'name',
        code: 'code',
        sort_order: 'sort_order',
        construction_type: 'construction_type',
        height_m: 'height_m',
        floors_above: 'floors_above',
        floors_below: 'floors_below',
        notes: 'notes',
        status: 'status',
        footprint: { column: 'geom', expression: geoJsonSurface },
      }).map((assignment) => (assignment.column === 'geom' ? asGeoJsonText(assignment) : assignment)),
    );
    return this.getBuilding(id);
  }

  async createLevel(buildingId: string, input: LevelCreate): Promise<Level | null> {
    const building = await this.client.query<{ site_id: string }>(
      'select site_id from app.building where id = $1 and tenant_id = app.current_tenant_id()',
      [buildingId],
    );
    const siteId = building.rows[0]?.site_id;
    if (!siteId) return null;
    const result = await this.client.query<{ id: string }>(
      `insert into app.level (tenant_id, site_id, building_id, label, sort_order, elevation_m)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5)
       returning id`,
      [siteId, buildingId, input.label, input.sort_order, input.elevation_m ?? null],
    );
    return this.getLevel(result.rows[0]?.id ?? '');
  }

  async updateLevel(id: string, expectedVersion: number, patch: LevelUpdate): Promise<Level | null> {
    if (!(await lockVersion(this.client, 'app.level', id, expectedVersion))) return null;
    await applyAssignments(
      this.client,
      'app.level',
      id,
      assignments(patch, { label: 'label', sort_order: 'sort_order', elevation_m: 'elevation_m', status: 'status' }),
    );
    return this.getLevel(id);
  }

  private async getBuilding(id: string): Promise<Building | null> {
    const building = await this.client.query<BuildingRow>(
      `select ${BUILDING_COLUMNS} from app.building b where b.id = $1 and b.tenant_id = app.current_tenant_id()`,
      [id],
    );
    const row = building.rows[0];
    if (!row) return null;
    const levels = await this.client.query<Level>(
      `select ${LEVEL_COLUMNS} from app.level l where l.building_id = $1 order by l.sort_order, l.label`,
      [id],
    );
    return buildingSchema.parse({ ...row, levels: levels.rows });
  }

  private async getLevel(id: string): Promise<Level | null> {
    const result = await this.client.query<Level>(
      `select ${LEVEL_COLUMNS} from app.level l where l.id = $1 and l.tenant_id = app.current_tenant_id()`,
      [id],
    );
    return result.rows[0] ? levelSchema.parse(result.rows[0]) : null;
  }
}
