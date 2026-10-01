import { randomUUID } from 'node:crypto';
import type { ContributionFile, ContributionRepository } from '@etare/application';
import {
  contributionSchema,
  portalContributionSchema,
  type Contribution,
  type ContributionCreate,
  type ContributionListQuery,
  type ContributionUpdate,
  type PortalContribution,
} from '@etare/contracts';
import { assetStorageKey, quarantineStorageKey } from '@etare/domain';
import { decodeCursor, encodeCursor } from './cursor';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, lockVersion } from './versioned';

const iso = (value: unknown) =>
  value === null || value === undefined ? null : new Date(value as string).toISOString();

/**
 * Proposals of the exploitants (POR-03/04, ADR-019). The exploitant goes
 * through the portal_*contribution* functions (their own proposals, on their
 * sites, contribution:create); the Prévision reads and instructs them under
 * RLS (contribution:review).
 */
const CONTRIBUTION_SELECT = `
  select c.id, c.site_id, s.name as site_name, s.etare_number,
         c.author_id, app.member_name(c.author_id) as author_name, app.contribution_author_email(c.id) as author_email,
         c.target_type, c.target_id, c.operation, c.title, c.description, c.base_value, c.proposed_value,
         app.contribution_working_value(c.site_id, c.target_type, c.target_id) as current_value,
         app.contribution_in_conflict(c) as conflict,
         c.publication_id, p.publication_number,
         (select ap.publication_number from app.publication ap
          where ap.site_id = c.site_id and ap.status = 'published') as current_publication_number,
         c.status, c.assigned_to,
         case when c.assigned_to is not null then app.member_name(c.assigned_to) end as assigned_name,
         c.decision_comment, c.conflict_resolution, c.decided_by,
         case when c.decided_by is not null then app.member_name(c.decided_by) end as decided_name,
         c.decided_at, c.created_at,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', m.id, 'side', m.side, 'kind', m.kind, 'body', m.body,
                    'created_at', m.created_at, 'author_id', m.author_id,
                    'author_name', app.member_name(m.author_id)) order by m.created_at, m.id)
           from app.contribution_message m where m.contribution_id = c.id), '[]'::jsonb) as messages,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', a.id, 'filename', a.filename, 'mime_type', a.mime_type,
                    'size_bytes', a.size_bytes, 'sha256', a.sha256, 'scan_status', a.scan_status,
                    'rejection_reason', a.scan_detail ->> 'reason', 'created_at', a.created_at) order by ca.sort_order)
           from app.contribution_attachment ca join app.asset a on a.id = ca.asset_id
           where ca.contribution_id = c.id), '[]'::jsonb) as attachments,
         res.id as resolution_revision_id, res.revision_no as resolution_revision_no,
         res.status as resolution_revision_status,
         (select max(rp.publication_number) from app.publication rp
          where rp.revision_id = res.id and rp.status in ('published', 'superseded')) as resolution_publication_number,
         c.row_version
  from app.contribution c
  join app.site s on s.id = c.site_id
  left join app.publication p on p.id = c.publication_id
  left join app.etare_revision res on res.id = c.revision_id
  where c.tenant_id = app.current_tenant_id()`;

interface ContributionRow {
  id: string;
  site_id: string;
  site_name: string;
  etare_number: string | null;
  author_id: string;
  author_name: string | null;
  author_email: string | null;
  target_type: string;
  target_id: string | null;
  operation: string;
  title: string;
  description: string;
  base_value: Record<string, unknown> | null;
  proposed_value: Record<string, unknown> | null;
  current_value: Record<string, unknown> | null;
  conflict: boolean;
  publication_id: string | null;
  publication_number: number | null;
  current_publication_number: number | null;
  status: string;
  assigned_to: string | null;
  assigned_name: string | null;
  decision_comment: string | null;
  conflict_resolution: string | null;
  decided_by: string | null;
  decided_name: string | null;
  decided_at: Date | null;
  created_at: Date;
  messages: Record<string, unknown>[];
  attachments: Record<string, unknown>[];
  resolution_revision_id: string | null;
  resolution_revision_no: number | null;
  resolution_revision_status: string | null;
  resolution_publication_number: number | null;
  row_version: number;
}

const person = (id: string | null, name: string | null) => (id ? { id, name: name ?? 'Membre du SIS' } : null);

const toContribution = (row: ContributionRow): Contribution =>
  contributionSchema.parse({
    id: row.id,
    site_id: row.site_id,
    site_name: row.site_name,
    etare_number: row.etare_number,
    author: { id: row.author_id, name: row.author_name ?? 'Exploitant', email: row.author_email },
    target_type: row.target_type,
    target_id: row.target_id,
    operation: row.operation,
    title: row.title,
    description: row.description,
    base_value: row.base_value,
    proposed_value: row.proposed_value,
    current_value: row.current_value,
    conflict: row.conflict,
    publication:
      row.publication_id && row.publication_number !== null
        ? { id: row.publication_id, publication_number: row.publication_number }
        : null,
    current_publication_number: row.current_publication_number,
    status: row.status,
    assigned_to: person(row.assigned_to, row.assigned_name),
    decision_comment: row.decision_comment,
    conflict_resolution: row.conflict_resolution,
    decided_by: person(row.decided_by, row.decided_name),
    decided_at: iso(row.decided_at),
    created_at: iso(row.created_at),
    messages: row.messages.map((message) => ({
      id: message['id'],
      side: message['side'],
      kind: message['kind'],
      body: message['body'],
      created_at: iso(message['created_at']),
      author: person(message['author_id'] as string, (message['author_name'] as string | null) ?? null),
    })),
    attachments: row.attachments.map((asset) => ({ ...asset, created_at: iso(asset['created_at']) })),
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

/** Portal view built in PostgreSQL: timestamps normalized to the API format. */
const toPortalContribution = (value: Record<string, unknown>): PortalContribution =>
  portalContributionSchema.parse({
    ...value,
    decided_at: iso(value['decided_at']),
    created_at: iso(value['created_at']),
    messages: (value['messages'] as Record<string, unknown>[]).map((message) => ({
      ...message,
      created_at: iso(message['created_at']),
    })),
  });

const VIEW_STATUSES = {
  open: ['submitted', 'in_review', 'info_requested'],
  closed: ['accepted', 'partially_accepted', 'rejected', 'withdrawn'],
  all: ['submitted', 'in_review', 'info_requested', 'accepted', 'partially_accepted', 'rejected', 'withdrawn'],
} as const;

export class PostgresContributionRepository implements ContributionRepository {
  constructor(private readonly client: PoolClient) {}

  async submit(siteId: string, tenantId: string, input: ContributionCreate): Promise<string> {
    // Identifiers and storage keys of the files are prepared here; PostgreSQL checks them.
    const files = input.files.map((file) => {
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
    const { rows } = await this.client.query<{ id: string }>(
      'select app.portal_submit_contribution($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) as id',
      [
        siteId,
        input.target_type,
        input.target_id ?? null,
        input.operation,
        input.title,
        input.description,
        input.proposed_value ? JSON.stringify(input.proposed_value) : null,
        JSON.stringify(files),
      ],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error('Proposal not recorded.');
    return id;
  }

  async files(id: string): Promise<ContributionFile[]> {
    const { rows } = await this.client.query<{
      asset_id: string;
      quarantine_key: string | null;
      mime_type: string;
      sha256: string;
      scan_status: 'pending' | 'clean' | 'rejected';
    }>('select asset_id, quarantine_key, mime_type, sha256, scan_status from app.portal_contribution_files($1)', [id]);
    return rows.map((file) => ({
      assetId: file.asset_id,
      quarantineKey: file.quarantine_key,
      mimeType: file.mime_type,
      sha256: file.sha256,
      scanStatus: file.scan_status,
    }));
  }

  async uploaded(id: string): Promise<number> {
    const { rows } = await this.client.query<{ count: number }>(
      'select app.portal_contribution_uploaded($1) as count',
      [id],
    );
    return rows[0]?.count ?? 0;
  }

  async mine(siteId: string | null): Promise<PortalContribution[]> {
    const { rows } = await this.client.query<{ items: Record<string, unknown>[] }>(
      'select app.portal_contributions($1) as items',
      [siteId],
    );
    return (rows[0]?.items ?? []).map(toPortalContribution);
  }

  async mineOne(id: string): Promise<PortalContribution | null> {
    const { rows } = await this.client.query<{ item: Record<string, unknown> | null }>(
      'select app.portal_contribution($1) as item',
      [id],
    );
    const item = rows[0]?.item;
    return item ? toPortalContribution(item) : null;
  }

  async reply(id: string, body: string): Promise<void> {
    await this.client.query('select app.portal_contribution_reply($1, $2)', [id, body]);
  }

  async withdraw(id: string): Promise<void> {
    await this.client.query('select app.portal_withdraw_contribution($1)', [id]);
  }

  async list(
    query: ContributionListQuery,
  ): Promise<{ items: Contribution[]; nextCursor: string | null; openCount: number }> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const values: unknown[] = [VIEW_STATUSES[query.view]];
    const filters = ['c.status = any($1::text[])'];
    const add = (sql: (parameter: string) => string, value: unknown) => {
      values.push(value);
      filters.push(sql(`$${values.length}`));
    };
    if (query.site_id) add((p) => `c.site_id = ${p}`, query.site_id);
    if (query.revision_id) add((p) => `c.revision_id = ${p}`, query.revision_id);
    if (after) {
      values.push(after.name, after.id);
      filters.push(`(c.created_at, c.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(query.limit + 1);
    const result = await this.client.query<ContributionRow>(
      `${CONTRIBUTION_SELECT} and ${filters.join(' and ')}
       order by c.created_at desc, c.id desc
       limit $${values.length}`,
      values,
    );
    const page = result.rows.slice(0, query.limit);
    const last = page.at(-1);
    const counted = await this.client.query<{ count: number }>(
      `select count(*)::int as count from app.contribution
       where tenant_id = app.current_tenant_id() and status in ('submitted', 'in_review', 'info_requested')`,
    );
    return {
      items: page.map(toContribution),
      nextCursor:
        result.rows.length > query.limit && last ? encodeCursor(last.created_at.toISOString(), last.id) : null,
      openCount: counted.rows[0]?.count ?? 0,
    };
  }

  async get(id: string): Promise<Contribution | null> {
    const { rows } = await this.client.query<ContributionRow>(`${CONTRIBUTION_SELECT} and c.id = $1`, [id]);
    return rows[0] ? toContribution(rows[0]) : null;
  }

  async update(
    id: string,
    expectedVersion: number,
    patch: Omit<ContributionUpdate, 'message'>,
    message: { body: string; kind: 'message' | 'info_request' } | null,
  ): Promise<Contribution | null> {
    if (!(await lockVersion(this.client, 'app.contribution', id, expectedVersion))) return null;
    // The question first: the decision closes the exchange.
    if (message) {
      await this.client.query(
        `insert into app.contribution_message (tenant_id, site_id, contribution_id, side, kind, body)
         select c.tenant_id, c.site_id, c.id, 'sis', $2, $3 from app.contribution c where c.id = $1`,
        [id, message.kind, message.body],
      );
    }
    const values = assignments(patch, {
      status: 'status',
      assigned_to: 'assigned_to',
      decision_comment: 'decision_comment',
      conflict_resolution: 'conflict_resolution',
      revision_id: 'revision_id',
    });
    await applyAssignments(this.client, 'app.contribution', id, values);
    return this.get(id);
  }
}
