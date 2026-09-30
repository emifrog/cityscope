import type { RiskRepository } from '@etare/application';
import {
  riskSchema,
  riskTypeSchema,
  type Risk,
  type RiskCreate,
  type RiskType,
  type RiskTypeCreate,
  type RiskTypeUpdate,
  type RiskUpdate,
} from '@etare/contracts';
import {
  localGeometry,
  placementAssignments,
  placementValues,
  planPositionColumn,
  planPositionJoin,
} from './plan-position';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion } from './versioned';

const TYPE_SELECT = `
  select t.id, t.code, t.name, t.default_severity, t.icon_key, t.properties_schema,
         case when t.tenant_id is null then 'national' else 'sis' end as owner, t.status, t.row_version
  from app.risk_type t`;

const RISK_SELECT = `
  select r.id, r.site_id, r.risk_type_id, t.code as type_code, t.name as type_name, t.icon_key, r.severity, r.label,
         r.description, r.quantity::float8 as quantity, r.unit, r.properties, r.building_id, r.level_id, r.zone_id,
         ${planPositionColumn('r')}, r.status, r.row_version
  from app.risk_occurrence r
  join app.risk_type t on t.id = r.risk_type_id
  ${planPositionJoin('r')}
  where r.tenant_id = app.current_tenant_id()`;

/**
 * Risk catalogue and occurrences. RLS shows the national catalogue and the
 * entries of the SIS; only SIS entries can be written (catalog:manage).
 */
export class PostgresRiskRepository implements RiskRepository {
  constructor(private readonly client: PoolClient) {}

  async types(options: { includeDeprecated?: boolean } = {}): Promise<RiskType[]> {
    const { rows } = await this.client.query<RiskType>(
      `${TYPE_SELECT} where t.status = 'active' or $1 order by t.tenant_id is not null, t.name`,
      [options.includeDeprecated === true],
    );
    return rows.map((row) => riskTypeSchema.parse(row));
  }

  async type(id: string): Promise<RiskType | null> {
    const { rows } = await this.client.query<RiskType>(`${TYPE_SELECT} where t.id = $1`, [id]);
    return rows[0] ? riskTypeSchema.parse(rows[0]) : null;
  }

  async createType(input: RiskTypeCreate & { properties_schema: Record<string, unknown> }): Promise<RiskType> {
    const { rows } = await this.client.query<{ id: string }>(
      `insert into app.risk_type (tenant_id, code, name, default_severity, icon_key, properties_schema)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5::jsonb)
       returning id`,
      [input.code, input.name, input.default_severity, input.icon_key, JSON.stringify(input.properties_schema)],
    );
    const created = await this.type(rows[0]?.id ?? '');
    if (!created) throw new Error('Created risk type is not visible.');
    return created;
  }

  async updateType(
    id: string,
    expectedVersion: number,
    patch: Omit<RiskTypeUpdate, 'fields'> & { properties_schema?: Record<string, unknown> },
  ): Promise<RiskType | null> {
    if (!(await lockVersion(this.client, 'app.risk_type', id, expectedVersion))) return null;
    const values = assignments(patch, {
      name: 'name',
      default_severity: 'default_severity',
      icon_key: 'icon_key',
      status: 'status',
      properties_schema: { column: 'properties_schema', expression: (parameter) => `${parameter}::jsonb` },
    }).map((assignment) =>
      assignment.column === 'properties_schema'
        ? { ...assignment, value: JSON.stringify(assignment.value) }
        : assignment,
    );
    await applyAssignments(this.client, 'app.risk_type', id, values);
    return this.type(id);
  }

  async listBySite(siteId: string): Promise<Risk[] | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const { rows } = await this.client.query<Risk>(
      `${RISK_SELECT} and r.site_id = $1 order by r.status = 'archived', r.severity desc, t.name, r.id`,
      [siteId],
    );
    return rows.map((row) => riskSchema.parse(row));
  }

  async get(id: string): Promise<Risk | null> {
    const { rows } = await this.client.query<Risk>(`${RISK_SELECT} and r.id = $1`, [id]);
    return rows[0] ? riskSchema.parse(rows[0]) : null;
  }

  async create(siteId: string, input: RiskCreate & { severity: number }): Promise<Risk | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const { rows } = await this.client.query<{ id: string }>(
      `insert into app.risk_occurrence
         (tenant_id, site_id, risk_type_id, severity, label, description, quantity, unit, properties,
          building_id, level_id, zone_id, plan_revision_id, local_geom)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, ${localGeometry('$13')})
       returning id`,
      [
        siteId,
        input.risk_type_id,
        input.severity,
        input.label ?? null,
        input.description ?? null,
        input.quantity ?? null,
        input.unit ?? null,
        JSON.stringify(input.properties),
        input.building_id ?? null,
        input.level_id ?? null,
        input.zone_id ?? null,
        ...placementValues(input.plan_position),
      ],
    );
    return this.get(rows[0]?.id ?? '');
  }

  async update(id: string, expectedVersion: number, patch: RiskUpdate): Promise<Risk | null> {
    if (!(await lockVersion(this.client, 'app.risk_occurrence', id, expectedVersion))) return null;
    const values = assignments(patch, {
      severity: 'severity',
      label: 'label',
      description: 'description',
      quantity: 'quantity',
      unit: 'unit',
      building_id: 'building_id',
      level_id: 'level_id',
      zone_id: 'zone_id',
      status: 'status',
      properties: { column: 'properties', expression: (parameter) => `${parameter}::jsonb` },
    }).map((assignment) =>
      assignment.column === 'properties' ? { ...assignment, value: JSON.stringify(assignment.value) } : assignment,
    );
    await applyAssignments(this.client, 'app.risk_occurrence', id, [
      ...values,
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
