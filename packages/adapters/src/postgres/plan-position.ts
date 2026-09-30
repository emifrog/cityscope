import type { PlanPlacement } from '@etare/contracts';
import type { Assignment } from './versioned';

/**
 * Positions on plans (ADR-011): pixels of one background revision, stored as
 * SRID 0 geometries. The database checks that they lie inside the background
 * and that new positions use the current revision.
 */
export const planPositionColumn = (alias: string) => `
  case when ${alias}.plan_revision_id is null then null else json_build_object(
    'plan_id', ${alias}_pr.plan_id, 'plan_revision_id', ${alias}_pr.id, 'revision_no', ${alias}_pr.revision_no,
    'is_current', ${alias}_pr.is_current, 'geometry', extensions.st_asgeojson(${alias}.local_geom, 1)::json)
  end as plan_position`;

export const planPositionJoin = (alias: string) =>
  `left join app.plan_revision ${alias}_pr on ${alias}_pr.tenant_id = ${alias}.tenant_id and ${alias}_pr.id = ${alias}.plan_revision_id`;

/** GeoJSON in plan pixels (text parameter, null allowed) to a SRID 0 geometry. */
export const localGeometry = (parameter: string) =>
  `case when ${parameter}::text is null then null
   else extensions.st_setsrid(extensions.st_geomfromgeojson(${parameter}::text), 0) end`;

/** Parameters of an insert: revision and geometry (both null when not on a plan). */
export const placementValues = (placement: PlanPlacement | null | undefined): [string | null, string | null] =>
  placement ? [placement.plan_revision_id, JSON.stringify(placement.geometry)] : [null, null];

/** Assignments of an update: a new position, or null to take the item off the plan. */
export function placementAssignments(placement: PlanPlacement | null | undefined): Assignment[] {
  if (placement === undefined) return [];
  const [revision, geometry] = placementValues(placement);
  return [
    { column: 'plan_revision_id', value: revision },
    { column: 'local_geom', value: geometry, expression: localGeometry },
  ];
}
