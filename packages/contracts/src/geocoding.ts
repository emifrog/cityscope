import { pointSchema } from '@etare/schemas';
import { z } from 'zod';

export const addressSearchQuerySchema = z.object({
  /** Address typed by the user (sent to the IGN geocoder by the server, never logged). */
  q: z.string().trim().min(3).max(200),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type AddressSearchQuery = z.infer<typeof addressSearchQuerySchema>;

export const reverseGeocodingQuerySchema = z.object({
  lon: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
});
export type ReverseGeocodingQuery = z.infer<typeof reverseGeocodingQuerySchema>;

export const addressCandidateSchema = z
  .object({
    label: z.string(),
    /** Number and street ("12 Avenue des Mimosas"), or the street / locality name. */
    street: z.string().nullable(),
    postal_code: z.string().nullable(),
    city: z.string(),
    insee_code: z.string().nullable(),
    location: pointSchema,
    /** Precision of the match: a house number, a street, a locality or a whole municipality. */
    kind: z.enum(['housenumber', 'street', 'locality', 'municipality']),
    score: z.number().min(0).max(1),
  })
  .meta({ id: 'AddressCandidate' });
export type AddressCandidate = z.infer<typeof addressCandidateSchema>;

export const addressCandidatesSchema = z
  .object({ items: z.array(addressCandidateSchema), attribution: z.string() })
  .meta({ id: 'AddressCandidates' });
export type AddressCandidates = z.infer<typeof addressCandidatesSchema>;
