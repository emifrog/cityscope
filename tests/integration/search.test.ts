/**
 * Sprint 8 — search through the real stack (MET-01): sites filtered by the
 * active risks of their working data (type, minimal severity) in the list and
 * on the map, combined with the other filters; ETARE dossiers paginated by
 * name, filtered by state and text, with exact counts over the whole SIS.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, TENANT_83, signIn } from './helpers';

const app = createApiApp(createApiDependencies(process.env));

type Call = (method: string, path: string, body?: unknown, ifMatch?: number) => Promise<Response>;
const as =
  (token: string, tenant: string): Call =>
  async (method, path, body, ifMatch) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'x-tenant-id': tenant,
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

const stamp = Date.now().toString(36);
const city = `Risqueville ${stamp}`;
let editor: Call;
let editor83: Call;
let gasType = '';
let withGas = '';
let withoutRisk = '';

const createSite = async (name: string, lon: number) => {
  const response = await editor('POST', '/sites', {
    name,
    site_type: 'industrial',
    status: 'active',
    address: { city, postal_code: '06200' },
    location: { type: 'Point', coordinates: [lon, 43.69] },
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
};

const listIds = async (query: string) =>
  endpoints.listSites.response
    .parse(await (await editor('GET', `/sites?${query}`)).json())
    .items.map((site) => site.id);

beforeAll(async () => {
  const [token, token83] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('redacteur83@demo.etare.test'),
  ]);
  editor = as(token, TENANT_06);
  editor83 = as(token83, TENANT_83);
  const types = endpoints.listRiskTypes.response.parse(await (await editor('GET', '/risk-types')).json()).items;
  const gas = types.find((type) => type.code === 'GAZ') ?? types[0];
  gasType = gas?.id ?? '';
  withGas = await createSite(`Dépôt gaz ${stamp}`, 7.21);
  withoutRisk = await createSite(`Entrepôt sans risque ${stamp}`, 7.22);
  const risk = await editor('POST', `/sites/${withGas}/risks`, { risk_type_id: gasType, severity: 4, label: 'Cuve' });
  expect(risk.status).toBe(201);
});

describe('search by risk', () => {
  it('finds the sites holding a type of risk, from a minimal severity, with the other filters', async () => {
    const inCity = `city=${encodeURIComponent(city)}`;
    expect(await listIds(inCity)).toEqual(expect.arrayContaining([withGas, withoutRisk]));
    expect(await listIds(`${inCity}&risk_type_id=${gasType}`)).toEqual([withGas]);
    expect(await listIds(`${inCity}&min_severity=4`)).toEqual([withGas]);
    expect(await listIds(`${inCity}&risk_type_id=${gasType}&min_severity=5`)).toEqual([]);
    expect(await listIds(`q=${encodeURIComponent(`gaz ${stamp}`)}&risk_type_id=${gasType}`)).toEqual([withGas]);
    // Another SIS never finds them, whatever the filter.
    const other = endpoints.listSites.response.parse(
      await (await editor83('GET', `/sites?${inCity}&risk_type_id=${gasType}`)).json(),
    );
    expect(other.items).toEqual([]);
  });

  it('applies the same filters on the map, commune included', async () => {
    const map = async (query: string) =>
      endpoints.listMapSites.response
        .parse(await (await editor('GET', `/map/sites?city=${encodeURIComponent(city)}${query}`)).json())
        .features.map((feature) => feature.id);
    expect(await map('')).toEqual(expect.arrayContaining([withGas, withoutRisk]));
    expect(await map(`&risk_type_id=${gasType}&min_severity=3`)).toEqual([withGas]);
  });

  it('ignores archived risks', async () => {
    const risks = endpoints.listSiteRisks.response.parse(
      await (await editor('GET', `/sites/${withGas}/risks`)).json(),
    ).items;
    const risk = risks[0];
    const archived = await editor('PATCH', `/risks/${risk?.id}`, { status: 'archived' }, risk?.row_version);
    expect(archived.status).toBe(200);
    expect(await listIds(`city=${encodeURIComponent(city)}&risk_type_id=${gasType}`)).toEqual([]);
  });
});

describe('ETARE dossiers', () => {
  it('are paginated by name with exact counts over the whole SIS', async () => {
    const first = endpoints.listEtareDossiers.response.parse(await (await editor('GET', '/etare?limit=1')).json());
    expect(first.items).toHaveLength(1);
    expect(first.next_cursor).not.toBeNull();
    const { counts } = first;
    expect(counts.published + counts.unpublished).toBe(counts.sites);
    expect(counts.sites).toBeGreaterThanOrEqual(2);
    const second = endpoints.listEtareDossiers.response.parse(
      await (await editor('GET', `/etare?limit=1&cursor=${encodeURIComponent(first.next_cursor ?? '')}`)).json(),
    );
    expect(second.items[0]?.site_id).not.toBe(first.items[0]?.site_id);
    expect(second.items[0]?.site_name.localeCompare(first.items[0]?.site_name ?? '')).toBeGreaterThanOrEqual(0);
  });

  it('are filtered by state and text', async () => {
    const unpublished = endpoints.listEtareDossiers.response.parse(
      await (await editor('GET', `/etare?state=unpublished&q=${encodeURIComponent(stamp)}`)).json(),
    );
    expect(unpublished.items.map((dossier) => dossier.site_id).sort()).toEqual([withGas, withoutRisk].sort());
    const published = endpoints.listEtareDossiers.response.parse(
      await (await editor('GET', `/etare?state=published&q=${encodeURIComponent(stamp)}`)).json(),
    );
    expect(published.items).toEqual([]);
    expect((await editor('GET', '/etare?state=everything')).status).toBe(400);
  });
});
