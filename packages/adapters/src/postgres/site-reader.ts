import type { SiteReader } from '@etare/application';
import {
  siteDetailSchema,
  siteSummarySchema,
  type SiteDetail,
  type SiteListQuery,
  type SiteListResponse,
  type SiteSummary,
} from '@etare/contracts';
import { decodeCursor, encodeCursor } from './cursor';
import type { PoolClient } from './pool';

interface SiteRow {
  id: string;
  tenant_id: string;
  name: string;
  short_name: string | null;
  status: string;
  site_type: string;
  sensitivity: string;
  etare_number: string | null;
  updated_at: Date;
  address_label: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  location: unknown;
}

interface SiteDetailRow extends SiteRow {
  footprint: unknown;
  last_verified_at: Date | null;
  building_count: number;
  row_version: number;
  publication_id: string | null;
  publication_number: number | null;
  published_at: Date | null;
}

// The explicit tenant filter duplicates the RLS policy on purpose (defence in depth).
const SITE_COLUMNS = `
  s.id, s.tenant_id, s.name, s.short_name, s.status, s.site_type, s.sensitivity, s.etare_number, s.updated_at,
  a.label as address_label, a.city as address_city, a.postal_code as address_postal_code,
  extensions.st_asgeojson(s.geom, 7)::json as location`;

const SITE_JOINS = `
  from app.site s
  left join app.address a on a.tenant_id = s.tenant_id and a.id = s.address_id`;

export class PostgresSiteReader implements SiteReader {
  constructor(private readonly client: PoolClient) {}

  async list(query: SiteListQuery): Promise<SiteListResponse> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const result = await this.client.query<SiteRow>(
      `select ${SITE_COLUMNS} ${SITE_JOINS}
       where s.tenant_id = app.current_tenant_id()
         and s.status <> 'archived'
         and ($1::text is null or (s.name, s.id) > ($1::text, $2::uuid))
       order by s.name, s.id
       limit $3`,
      [after?.name ?? null, after?.id ?? null, query.limit + 1],
    );
    const rows = result.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return {
      items: rows.map(toSummary),
      next_cursor: result.rows.length > query.limit && last ? encodeCursor(last.name, last.id) : null,
    };
  }

  async get(id: string): Promise<SiteDetail | null> {
    const result = await this.client.query<SiteDetailRow>(
      `select ${SITE_COLUMNS},
         extensions.st_asgeojson(s.footprint, 7)::json as footprint,
         s.last_verified_at, s.row_version,
         (select count(*)::int from app.building b where b.site_id = s.id and b.status = 'active') as building_count,
         p.id as publication_id, p.publication_number, p.published_at
       ${SITE_JOINS}
       left join app.publication p on p.tenant_id = s.tenant_id and p.id = s.active_publication_id
       where s.tenant_id = app.current_tenant_id()
         and s.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    return siteDetailSchema.parse({
      ...toSummary(row),
      footprint: row.footprint ?? null,
      last_verified_at: row.last_verified_at?.toISOString() ?? null,
      building_count: row.building_count,
      row_version: row.row_version,
      active_publication:
        row.publication_id && row.publication_number && row.published_at
          ? {
              id: row.publication_id,
              publication_number: row.publication_number,
              published_at: row.published_at.toISOString(),
            }
          : null,
    });
  }
}

function toSummary(row: SiteRow): SiteSummary {
  return siteSummarySchema.parse({
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    short_name: row.short_name,
    status: row.status,
    site_type: row.site_type,
    sensitivity: row.sensitivity,
    etare_number: row.etare_number,
    address:
      row.address_label && row.address_city
        ? { label: row.address_label, city: row.address_city, postal_code: row.address_postal_code }
        : null,
    location: row.location ?? null,
    updated_at: row.updated_at.toISOString(),
  });
}
