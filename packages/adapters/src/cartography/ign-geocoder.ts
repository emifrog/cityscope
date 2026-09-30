import type { Geocoder } from '@etare/application';
import type { AddressCandidate } from '@etare/contracts';
import { ServiceUnavailable } from '@etare/domain';
import { z } from 'zod';

const GEOCODER_URL = 'https://data.geopf.fr/geocodage';
export const IGN_GEOCODER_ATTRIBUTION = 'Adresses : Base Adresse Nationale via la Géoplateforme IGN';

const featureSchema = z.object({
  geometry: z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.object({
    label: z.string(),
    type: z.enum(['housenumber', 'street', 'locality', 'municipality']),
    score: z.number().optional(),
    name: z.string().optional(),
    housenumber: z.string().optional(),
    street: z.string().optional(),
    postcode: z.string().optional(),
    city: z.string(),
    citycode: z.string().optional(),
  }),
});

function toCandidate(raw: unknown): AddressCandidate | null {
  const parsed = featureSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { geometry, properties } = parsed.data;
  const street =
    properties.type === 'housenumber'
      ? [properties.housenumber, properties.street].filter(Boolean).join(' ') || null
      : properties.type === 'municipality'
        ? null
        : (properties.name ?? null);
  return {
    label: properties.label,
    street,
    postal_code: properties.postcode ?? null,
    city: properties.city,
    insee_code: properties.citycode ?? null,
    location: { type: 'Point', coordinates: geometry.coordinates },
    kind: properties.type,
    score: Math.min(1, Math.max(0, properties.score ?? 1)),
  };
}

/**
 * IGN Géoplateforme geocoder (Base Adresse Nationale), called by the server:
 * users' addresses reach IGN, never their network address. Timeout, one retry
 * on network or server errors, and a clear message when the service throttles
 * (429) or fails: the rest of the application keeps working (architecture §14).
 */
export class IgnGeocoder implements Geocoder {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 5000,
  ) {}

  search(text: string, limit: number): Promise<AddressCandidate[]> {
    const query = new URLSearchParams({ q: text, limit: String(limit), autocomplete: '1', index: 'address' });
    return this.request(`${GEOCODER_URL}/search?${query}`);
  }

  async reverse(lon: number, lat: number): Promise<AddressCandidate | null> {
    const query = new URLSearchParams({ lon: String(lon), lat: String(lat), limit: '1', index: 'address' });
    return (await this.request(`${GEOCODER_URL}/reverse?${query}`))[0] ?? null;
  }

  attribution(): string {
    return IGN_GEOCODER_ATTRIBUTION;
  }

  private async request(url: string): Promise<AddressCandidate[]> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch {
        if (attempt < 2) continue;
        throw new ServiceUnavailable('Le service d’adresses de l’IGN ne répond pas. Réessayez dans un instant.');
      }
      if (response.status === 429) {
        throw new ServiceUnavailable('Le service d’adresses de l’IGN est momentanément saturé. Réessayez.');
      }
      if (response.status >= 500 && attempt < 2) continue;
      if (!response.ok) throw new ServiceUnavailable('Le service d’adresses de l’IGN est indisponible.');
      const body = (await response.json()) as { features?: unknown[] };
      return (body.features ?? []).map(toCandidate).filter((candidate) => candidate !== null);
    }
    throw new ServiceUnavailable('Le service d’adresses de l’IGN est indisponible.');
  }
}
