import type { OperationalObject } from '@etare/contracts';

/** Nearest water point in service placed on the map (hydrant, reserve, riser inlet), as on the site card. */
export function nearestWaterPoint(objects: readonly OperationalObject[]): OperationalObject | null {
  return (
    objects
      .filter((object) => object.category === 'water' && object.status === 'active' && object.distance_m !== null)
      .sort((left, right) => (left.distance_m ?? 0) - (right.distance_m ?? 0))[0] ?? null
  );
}

/** "PEI 1 · 91 m · 120 m³/h" */
export function describeWaterPoint(object: OperationalObject): string {
  const flow = object.properties['debit_m3h'];
  const capacity = object.properties['capacite_m3'];
  return [
    object.label ?? object.name ?? object.type_name,
    object.distance_m !== null ? `${Math.round(object.distance_m)} m` : null,
    typeof flow === 'number' ? `${flow.toLocaleString('fr-FR')} m³/h` : null,
    typeof capacity === 'number' ? `${capacity.toLocaleString('fr-FR')} m³` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
