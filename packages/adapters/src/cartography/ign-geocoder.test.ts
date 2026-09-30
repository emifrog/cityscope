import { ServiceUnavailable } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { IgnGeocoder } from './ign-geocoder';

/** Shape of a Géoplateforme geocoder answer (BAN). */
const ANSWER = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [7.2518, 43.7079] },
      properties: {
        label: '12 Avenue des Mimosas 06000 Nice',
        score: 0.93,
        housenumber: '12',
        name: '12 Avenue des Mimosas',
        street: 'Avenue des Mimosas',
        postcode: '06000',
        city: 'Nice',
        citycode: '06088',
        type: 'housenumber',
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [7.26, 43.71] },
      properties: { label: 'Nice', score: 0.5, name: 'Nice', city: 'Nice', citycode: '06088', type: 'municipality' },
    },
    { type: 'Feature', geometry: null, properties: { label: 'incomplet' } },
  ],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('IgnGeocoder', () => {
  it('maps BAN answers to address candidates and ignores malformed ones', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(ANSWER));
    const candidates = await new IgnGeocoder(fetchImpl).search('12 avenue des mimosas nice', 5);
    expect(candidates).toEqual([
      {
        label: '12 Avenue des Mimosas 06000 Nice',
        street: '12 Avenue des Mimosas',
        postal_code: '06000',
        city: 'Nice',
        insee_code: '06088',
        location: { type: 'Point', coordinates: [7.2518, 43.7079] },
        kind: 'housenumber',
        score: 0.93,
      },
      expect.objectContaining({ kind: 'municipality', street: null, postal_code: null }),
    ]);
    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/geocodage/search');
    expect(url.searchParams.get('q')).toBe('12 avenue des mimosas nice');
    expect(url.searchParams.get('index')).toBe('address');
  });

  it('retries once after a network error', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(json(ANSWER));
    await expect(new IgnGeocoder(fetchImpl).reverse(7.2518, 43.7079)).resolves.toMatchObject({ city: 'Nice' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports throttling and outages as a temporary unavailability', async () => {
    await expect(new IgnGeocoder(async () => json({}, 429)).search('nice', 5)).rejects.toBeInstanceOf(
      ServiceUnavailable,
    );
    const failing = vi.fn<typeof fetch>(async () => json({}, 503));
    await expect(new IgnGeocoder(failing).search('nice', 5)).rejects.toBeInstanceOf(ServiceUnavailable);
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
