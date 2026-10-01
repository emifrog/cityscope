import { PreconditionFailed } from '@etare/domain';
import type { PoolClient } from './pool';

/** Tables whose rows carry a row_version (optimistic concurrency). Never built from user input. */
export type VersionedTable =
  | 'app.site'
  | 'app.building'
  | 'app.level'
  | 'app.site_classification'
  | 'app.contact'
  | 'app.document'
  | 'app.operational_object'
  | 'app.object_photo'
  | 'app.plan'
  | 'app.zone'
  | 'app.risk_occurrence'
  | 'app.risk_type'
  | 'app.etare_revision'
  | 'app.field_report'
  | 'app.contribution';

/**
 * Locks the row (SELECT … FOR UPDATE, under RLS) and checks the version the
 * caller based its change on. Returns null when the row is not visible;
 * throws PreconditionFailed when someone else changed it in the meantime.
 */
export async function lockVersion<R extends { row_version: number }>(
  client: PoolClient,
  table: VersionedTable,
  id: string,
  expectedVersion: number,
  columns = 'row_version',
): Promise<R | null> {
  const result = await client.query<R>(`select ${columns} from ${table} where id = $1 for update`, [id]);
  const row = result.rows[0];
  if (!row) return null;
  if (row.row_version !== expectedVersion) throw new PreconditionFailed();
  return row;
}

/** A column assignment: value bound as a parameter, optionally wrapped in an SQL expression. */
export interface Assignment {
  readonly column: string;
  readonly value?: unknown;
  readonly expression?: (parameter: string) => string;
  /** Server-side SQL value without parameter (e.g. now()). */
  readonly raw?: string;
}

/**
 * Builds assignments from a partial update: only fields present in the patch
 * (null included, it clears the value) are written. Column names come from
 * the mapping, never from the request.
 */
export function assignments<P extends object>(
  patch: P,
  mapping: { readonly [K in keyof P]?: string | { column: string; expression: (parameter: string) => string } },
): Assignment[] {
  const result: Assignment[] = [];
  for (const [key, target] of Object.entries(mapping) as [keyof P & string, string | Assignment][]) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === undefined || target === undefined) continue;
    result.push(typeof target === 'string' ? { column: target, value } : { ...target, value });
  }
  return result;
}

export async function applyAssignments(
  client: PoolClient,
  table: VersionedTable,
  id: string,
  values: readonly Assignment[],
): Promise<void> {
  if (values.length === 0) return;
  const parameters: unknown[] = [id];
  const sets = values.map(({ column, value, expression, raw }) => {
    if (raw !== undefined) return `${column} = ${raw}`;
    parameters.push(value);
    const placeholder = `$${parameters.length}`;
    return `${column} = ${expression ? expression(placeholder) : placeholder}`;
  });
  await client.query(`update ${table} set ${sets.join(', ')} where id = $1`, parameters);
}

/** GeoJSON (WGS 84) parameter to PostGIS geometry. */
export const geoJsonPoint = (parameter: string) =>
  `case when ${parameter}::text is null then null else extensions.st_setsrid(extensions.st_geomfromgeojson(${parameter}::text), 4326) end`;

export const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/** GeoJSON Polygon or MultiPolygon (WGS 84) parameter to a PostGIS MultiPolygon. */
export const geoJsonSurface = (parameter: string) =>
  `case when ${parameter}::text is null then null
   else extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(${parameter}::text), 4326)) end`;

/** Geometry values travel as GeoJSON text (null clears the column). */
export const asGeoJsonText = (assignment: Assignment): Assignment =>
  assignment.value === null || assignment.value === undefined
    ? assignment
    : { ...assignment, value: JSON.stringify(assignment.value) };
