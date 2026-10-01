import { randomUUID } from 'node:crypto';
import type { FieldReportRepository, ReportPhotoFile, SubmittedReport } from '@etare/application';
import {
  fieldReportSchema,
  syncReportStatusSchema,
  type FieldReport,
  type FieldReportListQuery,
  type FieldReportSubmit,
  type FieldReportUpdate,
  type SyncReportStatus,
} from '@etare/contracts';
import { assetStorageKey, quarantineStorageKey } from '@etare/domain';
import { decodeCursor, encodeCursor } from './cursor';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion } from './versioned';

const iso = (value: unknown) =>
  value === null || value === undefined ? null : new Date(value as string).toISOString();

/**
 * Field reports (OPS-04, ADR-017). Terminals go through the sync_*report*
 * functions (terminal of the SIS, offline:download, field_report:create); the
 * Prévision reads and instructs them under RLS (field_report:review).
 */
const REPORT_SELECT = `
  select r.id, r.site_id, s.name as site_name, s.etare_number, r.category, r.severity, r.description, r.status,
         r.observed_at, r.received_at, r.reporter_id, app.member_name(r.reporter_id) as reporter_name,
         r.assigned_to, case when r.assigned_to is not null then app.member_name(r.assigned_to) end as assigned_name,
         r.decision_comment, r.decided_by,
         case when r.decided_by is not null then app.member_name(r.decided_by) end as decided_name, r.decided_at,
         r.publication_id, p.publication_number,
         (select ap.publication_number from app.publication ap
          where ap.site_id = r.site_id and ap.status = 'published') as current_publication_number,
         r.item_type, r.item_id,
         (select coalesce(e ->> 'name', e ->> 'label', e ->> 'type_name')
          from jsonb_array_elements(coalesce(rev.snapshot -> (r.item_type || 's'), '[]'::jsonb)) e
          where e ->> 'id' = r.item_id::text limit 1) as item_label,
         case r.item_type
           when 'object' then (select o.status from app.operational_object o where o.id = r.item_id)
           when 'risk' then (select ro.status from app.risk_occurrence ro where ro.id = r.item_id)
           when 'zone' then (select z.status from app.zone z where z.id = r.item_id)
         end as item_current_status,
         r.plan_revision_id, r.plan_x, r.plan_y,
         (select pl ->> 'id' from jsonb_array_elements(coalesce(rev.snapshot -> 'plans', '[]'::jsonb)) pl
          where pl -> 'background' ->> 'revision_id' = r.plan_revision_id::text limit 1) as plan_id,
         (select pl ->> 'title' from jsonb_array_elements(coalesce(rev.snapshot -> 'plans', '[]'::jsonb)) pl
          where pl -> 'background' ->> 'revision_id' = r.plan_revision_id::text limit 1) as plan_title,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename, 'mime_type', a.mime_type,
                    'size_bytes', a.size_bytes, 'sha256', a.sha256, 'scan_status', a.scan_status,
                    'rejection_reason', a.scan_detail ->> 'reason', 'created_at', a.created_at) order by ph.sort_order)
           from app.field_report_photo ph join app.asset a on a.id = ph.asset_id
           where ph.report_id = r.id), '[]'::jsonb) as photos,
         res.id as resolution_revision_id, res.revision_no as resolution_revision_no,
         res.status as resolution_revision_status,
         (select max(rp.publication_number) from app.publication rp
          where rp.revision_id = res.id and rp.status in ('published', 'superseded')) as resolution_publication_number,
         r.row_version
  from app.field_report r
  join app.site s on s.id = r.site_id
  join app.publication p on p.id = r.publication_id
  join app.etare_revision rev on rev.id = p.revision_id
  left join app.etare_revision res on res.id = r.resolution_revision_id
  where r.tenant_id = app.current_tenant_id()`;

interface ReportRow {
  id: string;
  site_id: string;
  site_name: string;
  etare_number: string | null;
  category: string;
  severity: string;
  description: string;
  status: string;
  observed_at: Date;
  received_at: Date;
  reporter_id: string;
  reporter_name: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  decision_comment: string | null;
  decided_by: string | null;
  decided_name: string | null;
  decided_at: Date | null;
  publication_id: string;
  publication_number: number;
  current_publication_number: number | null;
  item_type: string | null;
  item_id: string | null;
  item_label: string | null;
  item_current_status: string | null;
  plan_revision_id: string | null;
  plan_x: number | null;
  plan_y: number | null;
  plan_id: string | null;
  plan_title: string | null;
  photos: Record<string, unknown>[];
  resolution_revision_id: string | null;
  resolution_revision_no: number | null;
  resolution_revision_status: string | null;
  resolution_publication_number: number | null;
  row_version: number;
}

const person = (id: string | null, name: string | null) => (id ? { id, name: name ?? 'Membre du SIS' } : null);

const toReport = (row: ReportRow): FieldReport =>
  fieldReportSchema.parse({
    id: row.id,
    site_id: row.site_id,
    site_name: row.site_name,
    etare_number: row.etare_number,
    category: row.category,
    severity: row.severity,
    description: row.description,
    status: row.status,
    observed_at: iso(row.observed_at),
    received_at: iso(row.received_at),
    reporter: person(row.reporter_id, row.reporter_name),
    assigned_to: person(row.assigned_to, row.assigned_name),
    decision_comment: row.decision_comment,
    decided_by: person(row.decided_by, row.decided_name),
    decided_at: iso(row.decided_at),
    publication: { id: row.publication_id, publication_number: row.publication_number },
    current_publication_number: row.current_publication_number,
    item:
      row.item_type && row.item_id
        ? {
            type: row.item_type,
            id: row.item_id,
            label: row.item_label ?? 'Élément',
            current_status: row.item_current_status,
          }
        : null,
    plan_position:
      row.plan_revision_id && row.plan_x !== null && row.plan_y !== null
        ? {
            plan_revision_id: row.plan_revision_id,
            plan_id: row.plan_id,
            plan_title: row.plan_title,
            x: row.plan_x,
            y: row.plan_y,
          }
        : null,
    photos: row.photos.map((photo) => ({ ...photo, created_at: iso(photo['created_at']) })),
    resolution:
      row.resolution_revision_id && row.resolution_revision_no !== null
        ? {
            revision_id: row.resolution_revision_id,
            revision_no: row.resolution_revision_no,
            revision_status: row.resolution_revision_status ?? 'draft',
            publication_number: row.resolution_publication_number,
          }
        : null,
    row_version: row.row_version,
  });

const VIEW_STATUSES = {
  open: ['new', 'triaged'],
  closed: ['resolved', 'rejected'],
  all: ['new', 'triaged', 'resolved', 'rejected'],
} as const;

export class PostgresFieldReportRepository implements FieldReportRepository {
  constructor(private readonly client: PoolClient) {}

  async submit(deviceId: string, tenantId: string, input: FieldReportSubmit): Promise<SubmittedReport> {
    // Identifiers and storage keys of the files are prepared here; on a replay they are ignored.
    const photos = input.photos.map((file) => {
      const assetId = randomUUID();
      const objectVersion = randomUUID();
      return {
        asset_id: assetId,
        storage_key: assetStorageKey(tenantId, assetId, objectVersion),
        quarantine_key: quarantineStorageKey(tenantId, assetId, objectVersion),
        filename: file.filename,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        sha256: file.sha256,
      };
    });
    const report = {
      client_report_id: input.client_report_id,
      site_id: input.site_id,
      publication_id: input.publication_id,
      category: input.category,
      severity: input.severity,
      description: input.description,
      observed_at: input.observed_at,
      item_type: input.item?.type ?? null,
      item_id: input.item?.id ?? null,
      plan_revision_id: input.plan_position?.plan_revision_id ?? null,
      plan_x: input.plan_position?.x ?? null,
      plan_y: input.plan_position?.y ?? null,
    };
    const submitted = await this.client.query<{ report_id: string; created: boolean }>(
      'select report_id, created from app.sync_submit_report($1, $2::jsonb, $3::jsonb)',
      [deviceId, JSON.stringify(report), JSON.stringify(photos)],
    );
    const row = submitted.rows[0];
    if (!row) throw new Error('Field report not recorded.');
    const { rows } = await this.client.query<{ content_hash: string; received_at: Date }>(
      'select content_hash, received_at from app.field_report where id = $1',
      [row.report_id],
    );
    const stored = rows[0];
    if (!stored) throw new Error('Field report not readable after its creation.');
    return {
      reportId: row.report_id,
      created: row.created,
      contentHash: stored.content_hash,
      receivedAt: stored.received_at.toISOString(),
    };
  }

  async photos(deviceId: string, reportId: string): Promise<ReportPhotoFile[]> {
    const { rows } = await this.client.query<{
      asset_id: string;
      quarantine_key: string | null;
      mime_type: string;
      sha256: string;
      scan_status: 'pending' | 'clean' | 'rejected';
    }>('select asset_id, quarantine_key, mime_type, sha256, scan_status from app.sync_report_photos($1, $2)', [
      deviceId,
      reportId,
    ]);
    return rows.map((photo) => ({
      assetId: photo.asset_id,
      quarantineKey: photo.quarantine_key,
      mimeType: photo.mime_type,
      sha256: photo.sha256,
      scanStatus: photo.scan_status,
    }));
  }

  async uploaded(deviceId: string, reportId: string): Promise<number> {
    const { rows } = await this.client.query<{ count: number }>('select app.sync_report_uploaded($1, $2) as count', [
      deviceId,
      reportId,
    ]);
    return rows[0]?.count ?? 0;
  }

  async forDevice(deviceId: string): Promise<SyncReportStatus[]> {
    const { rows } = await this.client.query<{ items: Record<string, unknown>[] }>(
      'select app.sync_reports($1) as items',
      [deviceId],
    );
    return (rows[0]?.items ?? []).map((item) =>
      syncReportStatusSchema.parse({
        ...item,
        decided_at: iso(item['decided_at']),
        received_at: iso(item['received_at']),
      }),
    );
  }

  async list(
    query: FieldReportListQuery,
  ): Promise<{ items: FieldReport[]; nextCursor: string | null; openCount: number }> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const values: unknown[] = [VIEW_STATUSES[query.view]];
    const filters = ['r.status = any($1::text[])'];
    const add = (sql: (parameter: string) => string, value: unknown) => {
      values.push(value);
      filters.push(sql(`$${values.length}`));
    };
    if (query.site_id) add((p) => `r.site_id = ${p}`, query.site_id);
    if (query.revision_id) add((p) => `r.resolution_revision_id = ${p}`, query.revision_id);
    if (after) {
      values.push(after.name, after.id);
      filters.push(`(r.received_at, r.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(query.limit + 1);
    const result = await this.client.query<ReportRow>(
      `${REPORT_SELECT} and ${filters.join(' and ')}
       order by r.received_at desc, r.id desc
       limit $${values.length}`,
      values,
    );
    const page = result.rows.slice(0, query.limit);
    const last = page.at(-1);
    const counted = await this.client.query<{ count: number }>(
      `select count(*)::int as count from app.field_report
       where tenant_id = app.current_tenant_id() and status in ('new', 'triaged')`,
    );
    return {
      items: page.map(toReport),
      nextCursor:
        result.rows.length > query.limit && last ? encodeCursor(last.received_at.toISOString(), last.id) : null,
      openCount: counted.rows[0]?.count ?? 0,
    };
  }

  async get(id: string): Promise<FieldReport | null> {
    const { rows } = await this.client.query<ReportRow>(`${REPORT_SELECT} and r.id = $1`, [id]);
    return rows[0] ? toReport(rows[0]) : null;
  }

  async update(id: string, expectedVersion: number, patch: FieldReportUpdate): Promise<FieldReport | null> {
    if (!(await lockVersion(this.client, 'app.field_report', id, expectedVersion))) return null;
    const values = assignments(patch, {
      status: 'status',
      assigned_to: 'assigned_to',
      decision_comment: 'decision_comment',
      resolution_revision_id: 'resolution_revision_id',
    });
    await applyAssignments(this.client, 'app.field_report', id, values);
    return this.get(id);
  }
}
