import type { SiteRepository } from '@etare/application';
import {
  mapSitesResponseSchema,
  siteDetailSchema,
  siteSummarySchema,
  type AddressInput,
  type MapSitesQuery,
  type MapSitesResponse,
  type SiteCreate,
  type SiteDetail,
  type SiteListQuery,
  type SiteListResponse,
  type SiteSummary,
  type SiteUpdate,
} from '@etare/contracts';
import { parseBbox } from '@etare/schemas';
import { decodeCursor, encodeCursor } from './cursor';
import type { PoolClient } from './pool';
import { applyAssignments, assignments, geoJsonPoint, lockVersion } from './versioned';

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
  address_street: string | null;
  address_insee_code: string | null;
  footprint: unknown;
  last_verified_at: Date | null;
  building_count: number;
  row_version: number;
  publication_id: string | null;
  publication_number: number | null;
  published_at: Date | null;
}

const SITE_COLUMNS = `
  s.id, s.tenant_id, s.name, s.short_name, s.status, s.site_type, s.sensitivity, s.etare_number, s.updated_at,
  a.label as address_label, a.city as address_city, a.postal_code as address_postal_code,
  extensions.st_asgeojson(s.geom, 7)::json as location`;

const SITE_JOINS = `
  from app.site s
  left join app.address a on a.tenant_id = s.tenant_id and a.id = s.address_id`;

/** Escapes LIKE wildcards so that user text is matched literally. */
const likeLiteral = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

/** Filters shared by the map ($1 status, $2 text, $3 type); same semantics as the site list. */
const MAP_FILTERS = `s.tenant_id = app.current_tenant_id()
  and ($1::text is null and s.status <> 'archived' or s.status = $1::text)
  and ($2::text is null or s.name ilike $2 or a.label ilike $2 or s.etare_number ilike $2)
  and ($3::text is null or s.site_type = $3::text)`;

interface MapRow {
  id: string;
  name: string;
  site_type: string;
  status: string;
  etare_number: string | null;
  city: string | null;
  lon: number;
  lat: number;
  publication_number: number | null;
  verified_recently: boolean;
}

interface MapTotalsRow {
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
  unlocated: number;
}

function addressLabel(address: AddressInput): string {
  const locality = [address.postal_code, address.city].filter(Boolean).join(' ');
  return [address.street, locality].filter(Boolean).join(', ');
}

// Every query also filters on the current tenant explicitly: it duplicates the RLS policy on purpose.
export class PostgresSiteRepository implements SiteRepository {
  constructor(private readonly client: PoolClient) {}

  async list(query: SiteListQuery): Promise<SiteListResponse> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const result = await this.client.query<SiteRow>(
      `select ${SITE_COLUMNS} ${SITE_JOINS}
       where s.tenant_id = app.current_tenant_id()
         and ($4::text is null and s.status <> 'archived' or s.status = $4::text)
         and ($5::text is null or s.name ilike $5 or a.label ilike $5 or s.etare_number ilike $5)
         and ($6::text is null or s.site_type = $6::text)
         and ($7::text is null or lower(a.city) = lower($7::text))
         and ($1::text is null or (s.name, s.id) > ($1::text, $2::uuid))
       order by s.name, s.id
       limit $3`,
      [
        after?.name ?? null,
        after?.id ?? null,
        query.limit + 1,
        query.status ?? null,
        query.q ? likeLiteral(query.q) : null,
        query.site_type ?? null,
        query.city ?? null,
      ],
    );
    const rows = result.rows.slice(0, query.limit);
    const last = rows.at(-1);
    return {
      items: rows.map(toSummary),
      next_cursor: result.rows.length > query.limit && last ? encodeCursor(last.name, last.id) : null,
    };
  }

  async mapFeatures(query: MapSitesQuery): Promise<MapSitesResponse> {
    const filters = [query.status ?? null, query.q ? likeLiteral(query.q) : null, query.site_type ?? null];
    const bbox = query.bbox ? parseBbox(query.bbox) : null;
    const features = await this.client.query<MapRow>(
      `select s.id, s.name, s.site_type, s.status, s.etare_number, a.city,
              extensions.st_x(s.geom) as lon, extensions.st_y(s.geom) as lat,
              p.publication_number,
              coalesce(s.last_verified_at > now() - interval '12 months', false) as verified_recently
       ${SITE_JOINS}
       left join app.publication p on p.tenant_id = s.tenant_id and p.id = s.active_publication_id
       where ${MAP_FILTERS}
         and s.geom is not null
         and ($4::float8 is null
              or extensions.st_intersects(s.geom, extensions.st_makeenvelope($4, $5, $6, $7, 4326)))
       order by s.name, s.id
       limit $8`,
      [...filters, ...(bbox ?? [null, null, null, null]), query.limit + 1],
    );
    const totals = await this.client.query<MapTotalsRow>(
      `select extensions.st_xmin(e) as west, extensions.st_ymin(e) as south,
              extensions.st_xmax(e) as east, extensions.st_ymax(e) as north, unlocated
       from (
         select extensions.st_extent(s.geom)::extensions.box3d as e,
                count(*) filter (where s.geom is null)::int as unlocated
         ${SITE_JOINS}
         where ${MAP_FILTERS}
       ) matching`,
      filters,
    );
    const extent = totals.rows[0];
    return mapSitesResponseSchema.parse({
      type: 'FeatureCollection',
      features: features.rows.slice(0, query.limit).map((row) => ({
        type: 'Feature',
        id: row.id,
        geometry: { type: 'Point', coordinates: [row.lon, row.lat] },
        properties: {
          name: row.name,
          site_type: row.site_type,
          status: row.status,
          etare_number: row.etare_number,
          city: row.city,
          published: row.publication_number !== null,
          publication_number: row.publication_number,
          verified_recently: row.verified_recently,
        },
      })),
      truncated: features.rows.length > query.limit,
      extent:
        extent && extent.west !== null && extent.south !== null && extent.east !== null && extent.north !== null
          ? [extent.west, extent.south, extent.east, extent.north]
          : null,
      unlocated: extent?.unlocated ?? 0,
    });
  }

  async get(id: string): Promise<SiteDetail | null> {
    const result = await this.client.query<SiteDetailRow>(
      `select ${SITE_COLUMNS},
         a.street as address_street, a.insee_code as address_insee_code,
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
    const summary = toSummary(row);
    return siteDetailSchema.parse({
      ...summary,
      address: summary.address
        ? { ...summary.address, street: row.address_street, insee_code: row.address_insee_code }
        : null,
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

  async create(input: SiteCreate): Promise<SiteDetail> {
    const addressId = input.address ? await this.insertAddress(input.address) : null;
    const result = await this.client.query<{ id: string }>(
      `insert into app.site (tenant_id, name, short_name, site_type, status, sensitivity, etare_number, address_id, geom)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, ${geoJsonPoint('$8')})
       returning id`,
      [
        input.name,
        input.short_name ?? null,
        input.site_type,
        input.status,
        input.sensitivity,
        input.etare_number ?? null,
        addressId,
        input.location ? JSON.stringify(input.location) : null,
      ],
    );
    const created = await this.get(result.rows[0]?.id ?? '');
    if (!created) throw new Error('Created site is not readable.');
    return created;
  }

  async update(id: string, expectedVersion: number, patch: SiteUpdate): Promise<SiteDetail | null> {
    const current = await lockVersion<{ row_version: number; address_id: string | null }>(
      this.client,
      'app.site',
      id,
      expectedVersion,
      'row_version, address_id',
    );
    if (!current) return null;

    const values = assignments(patch, {
      name: 'name',
      short_name: 'short_name',
      site_type: 'site_type',
      status: 'status',
      sensitivity: 'sensitivity',
      etare_number: 'etare_number',
      location: { column: 'geom', expression: geoJsonPoint },
    }).map((assignment) =>
      assignment.column === 'geom' && assignment.value !== null
        ? { ...assignment, value: JSON.stringify(assignment.value) }
        : assignment,
    );

    if (patch.address !== undefined) {
      let addressId: string | null = null;
      if (patch.address && current.address_id) {
        await this.updateAddress(current.address_id, patch.address);
        addressId = current.address_id;
      } else if (patch.address) {
        addressId = await this.insertAddress(patch.address);
      }
      values.push({ column: 'address_id', value: addressId });
    }
    if (patch.verified) values.push({ column: 'last_verified_at', raw: 'now()' });

    await applyAssignments(this.client, 'app.site', id, values);
    return this.get(id);
  }

  private async insertAddress(address: AddressInput): Promise<string> {
    const result = await this.client.query<{ id: string }>(
      `insert into app.address (tenant_id, label, street, postal_code, city, insee_code)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5)
       returning id`,
      [
        addressLabel(address),
        address.street ?? null,
        address.postal_code ?? null,
        address.city,
        address.insee_code ?? null,
      ],
    );
    return result.rows[0]?.id ?? '';
  }

  private async updateAddress(id: string, address: AddressInput): Promise<void> {
    await this.client.query(
      `update app.address set label = $2, street = $3, postal_code = $4, city = $5, insee_code = $6
       where id = $1 and tenant_id = app.current_tenant_id()`,
      [
        id,
        addressLabel(address),
        address.street ?? null,
        address.postal_code ?? null,
        address.city,
        address.insee_code ?? null,
      ],
    );
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
