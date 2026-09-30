import type { OperationalObjectRepository } from '@etare/application';
import {
  mapFeaturesResponseSchema,
  objectTypeSchema,
  operationalObjectSchema,
  type MapFeaturesQuery,
  type MapFeaturesResponse,
  type ObjectType,
  type OperationalObject,
  type OperationalObjectCreate,
  type OperationalObjectUpdate,
} from '@etare/contracts';
import { parseBbox } from '@etare/schemas';
import type { PoolClient } from './pool';
import { applyAssignments, asGeoJsonText, assignments, lockVersion, toIso } from './versioned';

/** Most details a map view receives per layer; beyond, the answer says "zoom in". */
const MAP_DETAIL_LIMIT = 2000;

const TYPE_COLUMNS = 't.id, t.code, t.name, t.category, t.geometry_kind, t.icon_key, t.properties_schema';

/** Distances in metres on the ellipsoid (geography), never in degrees. */
const OBJECT_SELECT = `
  select o.id, o.site_id, o.building_id, o.object_type_id, t.code as type_code, t.name as type_name, t.category,
         o.name, o.label, extensions.st_asgeojson(o.geom, 7)::json as geometry, o.properties, o.instructions,
         o.criticality, o.status, o.verified_at, o.row_version,
         case when o.geom is not null and s.geom is not null
              then round(extensions.st_distance(o.geom::extensions.geography, s.geom::extensions.geography))::float8
         end as distance_m
  from app.operational_object o
  join app.object_type t on t.id = o.object_type_id
  join app.site s on s.tenant_id = o.tenant_id and s.id = o.site_id
  where o.tenant_id = app.current_tenant_id()`;

/** GeoJSON (WGS 84) parameter to a PostGIS geometry of any kind. */
const geoJsonGeometry = (parameter: string) =>
  `extensions.st_setsrid(extensions.st_geomfromgeojson(${parameter}::text), 4326)`;

interface ObjectRow extends Omit<OperationalObject, 'verified_at'> {
  verified_at: Date | null;
}

const toObject = (row: ObjectRow): OperationalObject =>
  operationalObjectSchema.parse({ ...row, verified_at: toIso(row.verified_at) });

export class PostgresOperationalObjectRepository implements OperationalObjectRepository {
  constructor(private readonly client: PoolClient) {}

  async types(): Promise<ObjectType[]> {
    const { rows } = await this.client.query<ObjectType>(
      `select ${TYPE_COLUMNS} from app.object_type t where t.status = 'active' order by t.category, t.name`,
    );
    return rows.map((row) => objectTypeSchema.parse(row));
  }

  async type(id: string): Promise<ObjectType | null> {
    const { rows } = await this.client.query<ObjectType>(
      `select ${TYPE_COLUMNS} from app.object_type t where t.id = $1 and t.status = 'active'`,
      [id],
    );
    return rows[0] ? objectTypeSchema.parse(rows[0]) : null;
  }

  async listBySite(siteId: string): Promise<OperationalObject[] | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const { rows } = await this.client.query<ObjectRow>(
      `${OBJECT_SELECT} and o.site_id = $1
       order by o.status = 'archived', t.category, o.label nulls last, o.name nulls last, o.id`,
      [siteId],
    );
    return rows.map(toObject);
  }

  async get(id: string): Promise<OperationalObject | null> {
    const { rows } = await this.client.query<ObjectRow>(`${OBJECT_SELECT} and o.id = $1`, [id]);
    return rows[0] ? toObject(rows[0]) : null;
  }

  async create(siteId: string, input: OperationalObjectCreate): Promise<OperationalObject | null> {
    if (!(await this.siteVisible(siteId))) return null;
    const { rows } = await this.client.query<{ id: string }>(
      `insert into app.operational_object
         (tenant_id, site_id, building_id, object_type_id, name, label, geom, properties, instructions, criticality, status)
       values (app.current_tenant_id(), $1, $2, $3, $4, $5, ${geoJsonGeometry('$6')}, $7::jsonb, $8, $9, $10)
       returning id`,
      [
        siteId,
        input.building_id ?? null,
        input.object_type_id,
        input.name ?? null,
        input.label ?? null,
        JSON.stringify(input.geometry),
        JSON.stringify(input.properties),
        input.instructions ?? null,
        input.criticality,
        input.status,
      ],
    );
    return this.get(rows[0]?.id ?? '');
  }

  async update(id: string, expectedVersion: number, patch: OperationalObjectUpdate): Promise<OperationalObject | null> {
    if (!(await lockVersion(this.client, 'app.operational_object', id, expectedVersion))) return null;
    const values = assignments(patch, {
      building_id: 'building_id',
      name: 'name',
      label: 'label',
      instructions: 'instructions',
      criticality: 'criticality',
      status: 'status',
      geometry: { column: 'geom', expression: geoJsonGeometry },
      properties: { column: 'properties', expression: (parameter) => `${parameter}::jsonb` },
    }).map((assignment) =>
      assignment.column === 'geom' || assignment.column === 'properties' ? asGeoJsonText(assignment) : assignment,
    );
    if (patch.verified) values.push({ column: 'verified_at', raw: 'now()' });
    await applyAssignments(this.client, 'app.operational_object', id, values);
    return this.get(id);
  }

  async mapFeatures(query: MapFeaturesQuery): Promise<MapFeaturesResponse> {
    const bbox = parseBbox(query.bbox);
    if (!bbox) throw new Error('Invalid bbox reached the repository.');
    const envelope = 'extensions.st_makeenvelope($1, $2, $3, $4, 4326)';
    const buildings = await this.client.query<{ id: string; site_id: string; name: string; geometry: unknown }>(
      `select b.id, b.site_id, b.name, extensions.st_asgeojson(b.geom, 7)::json as geometry
       from app.building b
       join app.site s on s.tenant_id = b.tenant_id and s.id = b.site_id and s.status <> 'archived'
       where b.tenant_id = app.current_tenant_id() and b.status = 'active' and b.geom is not null
         and extensions.st_intersects(b.geom, ${envelope})
       limit $5`,
      [...bbox, MAP_DETAIL_LIMIT + 1],
    );
    const objects = await this.client.query<{
      id: string;
      site_id: string;
      site_name: string;
      type_code: string;
      type_name: string;
      category: string;
      name: string | null;
      label: string | null;
      criticality: string;
      status: string;
      geometry: unknown;
    }>(
      `select o.id, o.site_id, s.name as site_name, t.code as type_code, t.name as type_name, t.category,
              o.name, o.label, o.criticality, o.status, extensions.st_asgeojson(o.geom, 7)::json as geometry
       from app.operational_object o
       join app.object_type t on t.id = o.object_type_id
       join app.site s on s.tenant_id = o.tenant_id and s.id = o.site_id and s.status <> 'archived'
       where o.tenant_id = app.current_tenant_id() and o.status <> 'archived' and o.geom is not null
         and extensions.st_intersects(o.geom, ${envelope})
       order by o.criticality = 'critical' desc, o.id
       limit $5`,
      [...bbox, MAP_DETAIL_LIMIT + 1],
    );
    return mapFeaturesResponseSchema.parse({
      buildings: {
        type: 'FeatureCollection',
        features: buildings.rows.slice(0, MAP_DETAIL_LIMIT).map(({ id, geometry, ...properties }) => ({
          type: 'Feature',
          id,
          geometry,
          properties,
        })),
      },
      objects: {
        type: 'FeatureCollection',
        features: objects.rows.slice(0, MAP_DETAIL_LIMIT).map(({ id, geometry, ...properties }) => ({
          type: 'Feature',
          id,
          geometry,
          properties,
        })),
      },
      truncated: buildings.rows.length > MAP_DETAIL_LIMIT || objects.rows.length > MAP_DETAIL_LIMIT,
    });
  }

  private async siteVisible(siteId: string): Promise<boolean> {
    const site = await this.client.query(
      'select 1 from app.site where id = $1 and tenant_id = app.current_tenant_id()',
      [siteId],
    );
    return site.rowCount === 1;
  }
}
