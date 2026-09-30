import type { AddressCandidates, AddressSearchQuery, ReverseGeocodingQuery } from '@etare/contracts';
import type { RequestContext } from '@etare/domain';
import type { Geocoder, SessionFactory } from './ports';
import { inTenant } from './use-cases';

export interface GeocodingDependencies {
  readonly sessions: SessionFactory;
  readonly geocoder: Geocoder;
}

/** Only members who work on sites may use the geocoder; the remote call happens after the check, outside the transaction. */
async function authorize(deps: GeocodingDependencies, context: RequestContext): Promise<void> {
  await inTenant(deps.sessions, context, 'site:read', async () => undefined);
}

export async function searchAddresses(
  deps: GeocodingDependencies,
  context: RequestContext,
  query: AddressSearchQuery,
): Promise<AddressCandidates> {
  await authorize(deps, context);
  return { items: await deps.geocoder.search(query.q, query.limit), attribution: deps.geocoder.attribution() };
}

export async function reverseGeocode(
  deps: GeocodingDependencies,
  context: RequestContext,
  query: ReverseGeocodingQuery,
): Promise<AddressCandidates> {
  await authorize(deps, context);
  const nearest = await deps.geocoder.reverse(query.lon, query.lat);
  return { items: nearest ? [nearest] : [], attribution: deps.geocoder.attribution() };
}
