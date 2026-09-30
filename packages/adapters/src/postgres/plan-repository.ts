import type { PendingUpload, PlanRepository } from '@etare/application';
import { planSchema, type Plan, type PlanCreate, type PlanRevisionCreate, type PlanUpdate } from '@etare/contracts';
import { ASSET_COLUMNS, insertPendingAsset, toAsset, type AssetColumns } from './pending-asset';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion, toIso } from './versioned';

interface PlanRow {
  id: string;
  site_id: string;
  building_id: string | null;
  building_name: string | null;
  level_id: string | null;
  level_label: string | null;
  plan_type: string;
  title: string;
  status: string;
  row_version: number;
}

interface RevisionRow extends AssetColumns {
  plan_id: string;
  id: string;
  revision_no: number;
  page_number: number;
  width: number;
  height: number;
  local_unit: string;
  is_current: boolean;
  created_at: Date;
}

const PLAN_SELECT = `
  select p.id, p.site_id, p.building_id, b.name as building_name, p.level_id, l.label as level_label,
         p.plan_type, p.title, p.status, p.row_version
  from app.plan p
  left join app.building b on b.tenant_id = p.tenant_id and b.id = p.building_id
  left join app.level l on l.tenant_id = p.tenant_id and l.id = p.level_id
  where p.tenant_id = app.current_tenant_id()`;

const REVISION_SELECT = `
  select r.plan_id, r.id, r.revision_no, r.page_number, r.width::float8 as width, r.height::float8 as height,
         r.local_unit, r.is_current, r.created_at, ${ASSET_COLUMNS}
  from app.plan_revision r
  join app.asset a on a.tenant_id = r.tenant_id and a.id = r.asset_id
  where r.tenant_id = app.current_tenant_id()`;

const toPlan = (row: PlanRow, revisions: readonly RevisionRow[]): Plan =>
  planSchema.parse({
    ...row,
    revisions: revisions
      .filter((revision) => revision.plan_id === row.id)
      .map((revision) => ({
        id: revision.id,
        revision_no: revision.revision_no,
        page_number: revision.page_number,
        width: revision.width,
        height: revision.height,
        local_unit: revision.local_unit,
        is_current: revision.is_current,
        created_at: toIso(revision.created_at),
        asset: toAsset(revision),
      })),
  });

export class PostgresPlanRepository implements PlanRepository {
  constructor(private readonly client: PoolClient) {}

  async listBySite(siteId: string): Promise<Plan[] | null> {
    const site = await this.client.query(
      'select 1 from app.site where id = $1 and tenant_id = app.current_tenant_id()',
      [siteId],
    );
    if (site.rowCount !== 1) return null;
    const plans = await this.client.query<PlanRow>(
      `${PLAN_SELECT} and p.site_id = $1
       order by p.status, b.sort_order nulls first, b.name nulls first, l.sort_order nulls first, p.title`,
      [siteId],
    );
    const revisions = await this.client.query<RevisionRow>(
      `${REVISION_SELECT} and r.site_id = $1 order by r.revision_no desc`,
      [siteId],
    );
    return plans.rows.map((row) => toPlan(row, revisions.rows));
  }

  async get(id: string): Promise<Plan | null> {
    const plans = await this.client.query<PlanRow>(`${PLAN_SELECT} and p.id = $1`, [id]);
    const row = plans.rows[0];
    if (!row) return null;
    const revisions = await this.client.query<RevisionRow>(
      `${REVISION_SELECT} and r.plan_id = $1 order by r.revision_no desc`,
      [id],
    );
    return toPlan(row, revisions.rows);
  }

  async create(siteId: string, input: PlanCreate): Promise<{ plan: Plan; upload: PendingUpload } | null> {
    const site = await this.client.query<{ tenant_id: string }>(
      'select tenant_id from app.site where id = $1 and tenant_id = app.current_tenant_id()',
      [siteId],
    );
    const tenantId = site.rows[0]?.tenant_id;
    if (!tenantId) return null;
    // A level plan belongs to the building of its level, whatever the client sent.
    let buildingId = input.building_id ?? null;
    if (input.level_id) {
      const level = await this.client.query<{ building_id: string }>(
        'select building_id from app.level where id = $1 and site_id = $2 and tenant_id = $3',
        [input.level_id, siteId, tenantId],
      );
      const found = level.rows[0];
      if (!found) return null;
      buildingId = found.building_id;
    }
    const plan = await this.client.query<{ id: string }>(
      `insert into app.plan (tenant_id, site_id, building_id, level_id, plan_type, title)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [tenantId, siteId, buildingId, input.level_id ?? null, input.plan_type, input.title],
    );
    const planId = plan.rows[0]?.id ?? '';
    const upload = await this.insertRevision(tenantId, siteId, planId, 1, input);
    return { plan: await this.getOrFail(planId), upload };
  }

  async addRevision(planId: string, input: PlanRevisionCreate): Promise<{ plan: Plan; upload: PendingUpload } | null> {
    // Locking the plan serializes concurrent replacements: revision numbers stay strictly increasing.
    const plan = await this.client.query<{ tenant_id: string; site_id: string; next_revision: number }>(
      `select p.tenant_id, p.site_id,
              coalesce((select max(r.revision_no) from app.plan_revision r where r.plan_id = p.id), 0) + 1 as next_revision
       from app.plan p
       where p.id = $1 and p.tenant_id = app.current_tenant_id()
       for update`,
      [planId],
    );
    const row = plan.rows[0];
    if (!row) return null;
    // The previous background is kept (history, publications); only the current flag moves.
    await this.client.query('update app.plan_revision set is_current = false where plan_id = $1 and is_current', [
      planId,
    ]);
    const upload = await this.insertRevision(row.tenant_id, row.site_id, planId, row.next_revision, input);
    return { plan: await this.getOrFail(planId), upload };
  }

  async update(id: string, expectedVersion: number, patch: PlanUpdate): Promise<Plan | null> {
    if (!(await lockVersion(this.client, 'app.plan', id, expectedVersion))) return null;
    await applyAssignments(this.client, 'app.plan', id, assignments(patch, { title: 'title', status: 'status' }));
    return this.get(id);
  }

  private async insertRevision(
    tenantId: string,
    siteId: string,
    planId: string,
    revisionNo: number,
    input: PlanRevisionCreate,
  ): Promise<PendingUpload> {
    const upload = await insertPendingAsset(this.client, tenantId, siteId, input.file);
    await this.client.query(
      `insert into app.plan_revision
         (tenant_id, site_id, plan_id, revision_no, asset_id, page_number, width, height, local_unit, is_current)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'pixel', true)`,
      [tenantId, siteId, planId, revisionNo, upload.assetId, input.page_number, input.width, input.height],
    );
    return upload;
  }

  private async getOrFail(id: string): Promise<Plan> {
    const plan = await this.get(id);
    if (!plan) throw new Error('Created plan is not readable.');
    return plan;
  }
}
