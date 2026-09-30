import type { Building, SiteDetail } from '@etare/contracts';

export type Position = [number, number];
export type MultiPolygon = NonNullable<SiteDetail['footprint']>;
export interface Polygon {
  readonly type: 'Polygon';
  readonly coordinates: Position[][];
}

/** About 1 cm: enough for footprints, and keeps requests small. */
const round = (value: number) => Math.round(value * 1e7) / 1e7;
export const roundPosition = ([longitude, latitude]: readonly number[]): Position => [
  round(longitude ?? 0),
  round(latitude ?? 0),
];

/** A stored MultiPolygon becomes one editable polygon per part. */
export function toPolygons(surface: MultiPolygon | null | undefined): Polygon[] {
  return (surface?.coordinates ?? []).map((rings) => ({
    type: 'Polygon',
    coordinates: rings.map((ring) => ring.map(roundPosition)),
  }));
}

/** Drawn polygons become the MultiPolygon sent to the API; none means "no footprint". */
export function toMultiPolygon(polygons: readonly { coordinates: readonly (readonly (readonly number[])[])[] }[]) {
  if (polygons.length === 0) return null;
  return {
    type: 'MultiPolygon' as const,
    coordinates: polygons.map((polygon) => polygon.coordinates.map((ring) => ring.map(roundPosition))),
  };
}

/** [west, south, east, north] covering the site point, its footprint and its buildings; null when nothing is placed. */
export function siteExtent(
  site: Pick<SiteDetail, 'location' | 'footprint'>,
  buildings: readonly Pick<Building, 'footprint'>[],
): [number, number, number, number] | null {
  const positions: readonly number[][] = [
    ...(site.location ? [site.location.coordinates] : []),
    ...(site.footprint?.coordinates.flat(2) ?? []),
    ...buildings.flatMap((building) => building.footprint?.coordinates.flat(2) ?? []),
  ];
  if (positions.length === 0) return null;
  const longitudes = positions.map((position) => position[0] ?? 0);
  const latitudes = positions.map((position) => position[1] ?? 0);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}
