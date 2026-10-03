import type { EtareRepository, PublicationRecord, RevisionRecord } from '@etare/application';
import {
  etareDossierSchema,
  etareRevisionSchema,
  publicationSummarySchema,
  validationQueueItemSchema,
  type EtareDossier,
  type EtareDossierCounts,
  type EtareDossierList,
  type EtareDossierListQuery,
  type EtareOverview,
  type EtareRevision,
  type EtareSnapshot,
  type ValidationQueueItem,
} from '@etare/contracts';
import { decodeCursor, encodeCursor } from './cursor';
import type { PoolClient } from './pool';
import { likeLiteral } from './site-repository';
import { lockVersion, toIso } from './versioned';

/** A member of the SIS named for the workflow (identity tables stay closed: app.member_name). */
const person = (column: string) =>
  `case when ${column} is null then null
   else json_build_object('id', ${column}, 'name', coalesce(app.member_name(${column}), 'Ancien membre')) end`;

/** The PDF is listed in the manifest by the worker (ETARE-02). */
const HAS_PDF = `coalesce(p.manifest -> 'files' @> '[{"path": "etare.pdf"}]'::jsonb, false)`;

const PUBLICATION_COLUMNS = `p.id, p.publication_number, p.status, p.requested_at, p.published_at, p.failure_code, p.manifest_hash,
  ${HAS_PDF} as has_pdf`;

const REVISION_SELECT = `
  select r.id, r.site_id, r.revision_no, r.status, r.change_summary, r.content_hash,
         ${person('r.created_by')} as created_by, r.created_at,
         ${person('r.submitted_by')} as submitted_by, r.submitted_at, r.decided_at,
         bp.publication_number as base_publication_number,
         (select json_build_object('decision', a.decision, 'comment', a.comment, 'actor', ${person('a.actor_id')},
                                   'created_at', a.created_at)
            from app.approval a where a.revision_id = r.id order by a.created_at desc limit 1) as decision,
         (select json_build_object('id', p.id, 'publication_number', p.publication_number, 'status', p.status,
                                   'requested_at', p.requested_at, 'published_at', p.published_at,
                                   'failure_code', p.failure_code, 'manifest_hash', p.manifest_hash,
                                   'has_pdf', ${HAS_PDF})
            from app.publication p where p.revision_id = r.id order by p.publication_number desc limit 1) as publication,
         r.row_version
  from app.etare_revision r
  left join app.publication bp on bp.tenant_id = r.tenant_id and bp.id = r.base_publication_id
  where r.tenant_id = app.current_tenant_id()`;

interface RevisionRow extends Omit<EtareRevision, 'created_at' | 'submitted_at' | 'decided_at'> {
  created_at: Date;
  submitted_at: Date | null;
  decided_at: Date | null;
}

const toRevision = (row: RevisionRow): EtareRevision =>
  etareRevisionSchema.parse({
    ...row,
    created_at: toIso(row.created_at),
    submitted_at: toIso(row.submitted_at),
    decided_at: toIso(row.decided_at),
  });

interface PublicationRow {
  id: string;
  publication_number: number;
  status: string;
  requested_at: Date;
  published_at: Date | null;
  failure_code: string | null;
  manifest_hash: string | null;
  has_pdf: boolean;
}

/** Sites of the SIS (archived ones excepted), their version in force and their latest revision. */
const DOSSIER_FROM = `from app.site s
  left join app.publication ap on ap.tenant_id = s.tenant_id and ap.id = s.active_publication_id
  left join lateral (
    select r.id, r.revision_no, r.status, r.updated_at
    from app.etare e join app.etare_revision r on r.etare_id = e.id
    where e.site_id = s.id and e.status = 'active'
    order by r.revision_no desc limit 1
  ) lr on true
  where s.tenant_id = app.current_tenant_id() and s.status <> 'archived'`;

interface DossierRow {
  site_id: string;
  site_name: string;
  etare_number: string | null;
  publication_number: number | null;
  published_at: Date | null;
  revision_id: string | null;
  revision_no: number | null;
  revision_status: string | null;
  revision_updated_at: Date | null;
}

const toDossier = (row: DossierRow): EtareDossier =>
  etareDossierSchema.parse({
    site_id: row.site_id,
    site_name: row.site_name,
    etare_number: row.etare_number,
    active_publication:
      row.publication_number && row.published_at
        ? { publication_number: row.publication_number, published_at: toIso(row.published_at) }
        : null,
    latest_revision:
      row.revision_id && row.revision_no && row.revision_status && row.revision_updated_at
        ? {
            id: row.revision_id,
            revision_no: row.revision_no,
            status: row.revision_status,
            updated_at: toIso(row.revision_updated_at),
          }
        : null,
  });

export class PostgresEtareRepository implements EtareRepository {
  constructor(private readonly client: PoolClient) {}

  async dossiers(query: EtareDossierListQuery): Promise<EtareDossierList> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const { rows } = await this.client.query<DossierRow>(
      `select s.id as site_id, s.name as site_name, s.etare_number,
              ap.publication_number, ap.published_at,
              lr.id as revision_id, lr.revision_no, lr.status as revision_status, lr.updated_at as revision_updated_at
       ${DOSSIER_FROM}
         and ($1::text is null or s.name ilike $1 or s.etare_number ilike $1)
         and case $2::text
               when 'published' then ap.id is not null
               when 'unpublished' then ap.id is null
               when 'to_validate' then coalesce(lr.status = 'submitted', false)
               when 'in_progress' then coalesce(lr.status in ('draft', 'changes_requested'), false)
               else true
             end
         and ($3::text is null or (s.name, s.id) > ($3::text, $4::uuid))
       order by s.name, s.id
       limit $5`,
      [query.q ? likeLiteral(query.q) : null, query.state, after?.name ?? null, after?.id ?? null, query.limit + 1],
    );
    const counted = await this.client.query<EtareDossierCounts>(
      `select count(*)::int as sites,
              count(ap.id)::int as published,
              (count(*) - count(ap.id))::int as unpublished,
              count(*) filter (where lr.status = 'submitted')::int as to_validate,
              count(*) filter (where lr.status in ('draft', 'changes_requested'))::int as in_progress
       ${DOSSIER_FROM}`,
    );
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toDossier),
      next_cursor: rows.length > query.limit && last ? encodeCursor(last.site_name, last.site_id) : null,
      counts: counted.rows[0] ?? { sites: 0, published: 0, unpublished: 0, to_validate: 0, in_progress: 0 },
    };
  }

  async overview(siteId: string): Promise<EtareOverview | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const etare = await this.client.query<{ id: string }>(
      `select id from app.etare where site_id = $1 and tenant_id = app.current_tenant_id() and status = 'active'`,
      [siteId],
    );
    const etareId = etare.rows[0]?.id ?? null;
    if (!etareId) return { etare_id: null, revisions: [], publications: [] };
    const revisions = await this.client.query<RevisionRow>(
      `${REVISION_SELECT} and r.etare_id = $1 order by r.revision_no desc`,
      [etareId],
    );
    // Publications visible to back-office roles (RLS: OPS only sees the active one).
    const publications = await this.client.query<PublicationRow>(
      `select ${PUBLICATION_COLUMNS} from app.publication p
       where p.etare_id = $1 and p.tenant_id = app.current_tenant_id() order by p.publication_number desc`,
      [etareId],
    );
    return {
      etare_id: etareId,
      revisions: revisions.rows.map(toRevision),
      publications: publications.rows.map((row) =>
        publicationSummarySchema.parse({
          ...row,
          requested_at: toIso(row.requested_at),
          published_at: toIso(row.published_at),
        }),
      ),
    };
  }

  async createRevision(siteId: string, changeSummary: string | null): Promise<EtareRevision | null> {
    if (!(await this.siteVisible(siteId))) return null;
    await this.client.query(
      `insert into app.etare (tenant_id, site_id) values (app.current_tenant_id(), $1)
       on conflict (site_id) where status = 'active' do nothing`,
      [siteId],
    );
    // The dossier row serializes the numbering of its revisions.
    const etare = await this.client.query<{ id: string }>(
      `select id from app.etare
       where site_id = $1 and tenant_id = app.current_tenant_id() and status = 'active' for update`,
      [siteId],
    );
    const etareId = etare.rows[0]?.id;
    if (!etareId) return null;
    const { rows } = await this.client.query<{ id: string }>(
      `insert into app.etare_revision (tenant_id, site_id, etare_id, revision_no, base_publication_id, change_summary)
       select app.current_tenant_id(), $1, $2,
              coalesce((select max(revision_no) from app.etare_revision where etare_id = $2), 0) + 1,
              (select active_publication_id from app.site where id = $1), $3
       returning id`,
      [siteId, etareId, changeSummary],
    );
    return this.get(rows[0]?.id ?? '');
  }

  async revision(id: string): Promise<RevisionRecord | null> {
    const revision = await this.get(id);
    if (!revision) return null;
    const extra = await this.client.query<{ site_name: string; snapshot: unknown; base_snapshot: unknown }>(
      `select s.name as site_name, r.snapshot,
              (select br.snapshot from app.publication bp join app.etare_revision br on br.id = bp.revision_id
                where bp.id = r.base_publication_id) as base_snapshot
       from app.etare_revision r join app.site s on s.tenant_id = r.tenant_id and s.id = r.site_id
       where r.id = $1`,
      [id],
    );
    const contributors = await this.client.query<{ id: string; name: string }>(
      `select c.user_id as id, coalesce(app.member_name(c.user_id), 'Ancien membre') as name
       from app.etare_revision_contributor c where c.revision_id = $1 order by c.first_contributed_at`,
      [id],
    );
    const row = extra.rows[0];
    return {
      revision,
      siteName: row?.site_name ?? '',
      snapshot: row?.snapshot ?? null,
      baseSnapshot: row?.base_snapshot ?? null,
      contributors: contributors.rows,
    };
  }

  async submit(
    id: string,
    expectedVersion: number,
    input: { snapshot: EtareSnapshot; contentHash: string; changeSummary: string },
  ): Promise<EtareRevision | null> {
    if (!(await lockVersion(this.client, 'app.etare_revision', id, expectedVersion))) return null;
    await this.client.query(
      `update app.etare_revision
       set status = 'submitted', snapshot = $2::jsonb, content_hash = $3, change_summary = $4,
           submitted_by = app.current_user_id(), submitted_at = now()
       where id = $1`,
      [id, JSON.stringify(input.snapshot), input.contentHash, input.changeSummary],
    );
    return this.get(id);
  }

  async queue(): Promise<ValidationQueueItem[]> {
    const { rows } = await this.client.query<Omit<ValidationQueueItem, 'submitted_at'> & { submitted_at: Date }>(
      `select r.id as revision_id, r.site_id, s.name as site_name, s.etare_number, r.revision_no, r.change_summary,
              ${person('r.submitted_by')} as submitted_by, r.submitted_at,
              bp.publication_number as base_publication_number
       from app.etare_revision r
       join app.site s on s.tenant_id = r.tenant_id and s.id = r.site_id
       left join app.publication bp on bp.tenant_id = r.tenant_id and bp.id = r.base_publication_id
       where r.tenant_id = app.current_tenant_id() and r.status = 'submitted'
       order by r.submitted_at, r.id`,
    );
    return rows.map((row) => validationQueueItemSchema.parse({ ...row, submitted_at: toIso(row.submitted_at) }));
  }

  async decide(
    id: string,
    input: { decision: 'approved' | 'changes_requested'; comment: string | null; revisionHash: string },
  ): Promise<string> {
    const revision = await this.client.query<{ tenant_id: string; site_id: string }>(
      'select tenant_id, site_id from app.etare_revision where id = $1 for update',
      [id],
    );
    const target = revision.rows[0];
    if (!target) throw new Error('Decided revision is not visible.');
    // Append-only decision bound to the hash; the guard trigger checks the separation of duties.
    const approval = await this.client.query<{ id: string }>(
      `insert into app.approval (tenant_id, site_id, revision_id, revision_hash, decision, comment)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [target.tenant_id, target.site_id, id, input.revisionHash, input.decision, input.comment],
    );
    await this.client.query(`update app.etare_revision set status = $2, decided_at = now() where id = $1`, [
      id,
      input.decision,
    ]);
    const approvalId = approval.rows[0]?.id;
    if (!approvalId) throw new Error('Approval not recorded.');
    return approvalId;
  }

  async publication(id: string): Promise<PublicationRecord | null> {
    const { rows } = await this.client.query<{
      tenant_id: string;
      site_id: string;
      site_name: string;
      etare_number: string | null;
      publication_number: number;
      has_pdf: boolean;
      pdf_storage_key: string | null;
    }>(
      // Names come from the published content itself: OPS profiles never read the working tables.
      `select p.tenant_id, p.site_id, coalesce(p.payload #>> '{data,site,name}', 'site') as site_name,
              p.payload #>> '{data,site,etare_number}' as etare_number, p.publication_number, ${HAS_PDF} as has_pdf,
              p.pdf_storage_key
       from app.publication p
       where p.id = $1 and p.tenant_id = app.current_tenant_id()`,
      [id],
    );
    const row = rows[0];
    return row
      ? {
          id,
          tenantId: row.tenant_id,
          siteId: row.site_id,
          siteName: row.site_name,
          etareNumber: row.etare_number,
          publicationNumber: row.publication_number,
          hasPdf: row.has_pdf,
          pdfStorageKey: row.pdf_storage_key,
        }
      : null;
  }

  async approvalOf(revisionId: string): Promise<string | null> {
    const { rows } = await this.client.query<{ id: string }>(
      `select a.id from app.approval a
       join app.etare_revision r on r.id = a.revision_id and r.content_hash = a.revision_hash
       where a.revision_id = $1 and a.decision = 'approved' order by a.created_at desc limit 1`,
      [revisionId],
    );
    return rows[0]?.id ?? null;
  }

  async requestPublication(revisionId: string, approvalId: string): Promise<string> {
    const { rows } = await this.client.query<{ id: string }>(
      `insert into app.publication (tenant_id, site_id, etare_id, revision_id, approval_id, sensitivity)
       select r.tenant_id, r.site_id, r.etare_id, r.id, $2, s.sensitivity
       from app.etare_revision r join app.site s on s.tenant_id = r.tenant_id and s.id = r.site_id
       where r.id = $1
       returning id`,
      [revisionId, approvalId],
    );
    const publicationId = rows[0]?.id;
    if (!publicationId) throw new Error('Publication not queued.');
    return publicationId;
  }

  private async get(id: string): Promise<EtareRevision | null> {
    const { rows } = await this.client.query<RevisionRow>(`${REVISION_SELECT} and r.id = $1`, [id]);
    return rows[0] ? toRevision(rows[0]) : null;
  }

  private async siteVisible(siteId: string): Promise<boolean> {
    const site = await this.client.query(
      'select 1 from app.site where id = $1 and tenant_id = app.current_tenant_id()',
      [siteId],
    );
    return site.rowCount === 1;
  }
}
