/**
 * Sprint 8 — risks located on the map through the real stack (MET-02): a
 * risk drawn as a point or a surface outside the buildings, with its scope,
 * served on the map details, frozen in the snapshot, and removed from the map
 * on demand; a line is refused.
 */
import { createApiApp, createApiDependencies } from '@etare/api';
import { API_BASE_PATH, endpoints } from '@etare/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, signIn } from './helpers';

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

const zone = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [7.3001, 43.6001],
      [7.3005, 43.6001],
      [7.3005, 43.6004],
      [7.3001, 43.6001],
    ],
  ],
};
let editor: Call;
let siteId = '';
let gasType = '';
let riskId = '';

beforeAll(async () => {
  editor = as(await signIn('redacteur06@demo.etare.test'), TENANT_06);
  const created = await editor('POST', '/sites', {
    name: `Dépôt extérieur ${Date.now()}`,
    site_type: 'industrial',
    status: 'active',
    address: { city: 'Nice', postal_code: '06300' },
    location: { type: 'Point', coordinates: [7.3003, 43.6002] },
  });
  siteId = ((await created.json()) as { id: string }).id;
  const types = endpoints.listRiskTypes.response.parse(await (await editor('GET', '/risk-types')).json()).items;
  gasType = (types.find((type) => type.code === 'GAZ') ?? types[0])?.id ?? '';
});

describe('risks located on the map', () => {
  it('are drawn as a surface outside the buildings, with their scope', async () => {
    const line = await editor('POST', `/sites/${siteId}/risks`, {
      risk_type_id: gasType,
      geometry: {
        type: 'LineString',
        coordinates: [
          [7.3, 43.6],
          [7.301, 43.601],
        ],
      },
    });
    expect(line.status).toBe(400);
    const response = await editor('POST', `/sites/${siteId}/risks`, {
      risk_type_id: gasType,
      severity: 5,
      label: 'Cuve GPL',
      geometry: zone,
    });
    expect(response.status).toBe(201);
    const risk = endpoints.createSiteRisk.response.parse(await response.json());
    riskId = risk.id;
    expect(risk.geometry).toEqual(zone);
    expect(risk.building_id).toBeNull();
  });

  it('appear on the map details and in the snapshot', async () => {
    const details = endpoints.listMapFeatures.response.parse(
      await (await editor('GET', '/map/features?bbox=7.29,43.59,7.31,43.61')).json(),
    );
    expect(details.risks.features.find((feature) => feature.id === riskId)?.properties).toMatchObject({
      severity: 5,
      label: 'Cuve GPL',
      site_id: siteId,
    });
    const preview = endpoints.previewSiteEtare.response.parse(
      await (await editor('GET', `/sites/${siteId}/etare/preview`)).json(),
    );
    expect(preview.snapshot.risks.find((item) => item.id === riskId)?.geometry).toEqual(zone);
  });

  it('are removed from the map on demand, the risk itself kept', async () => {
    const current = endpoints.listSiteRisks.response
      .parse(await (await editor('GET', `/sites/${siteId}/risks`)).json())
      .items.find((item) => item.id === riskId);
    const removed = await editor('PATCH', `/risks/${riskId}`, { geometry: null }, current?.row_version);
    expect(removed.status).toBe(200);
    expect(endpoints.updateRisk.response.parse(await removed.json())).toMatchObject({
      geometry: null,
      status: 'active',
    });
    const details = endpoints.listMapFeatures.response.parse(
      await (await editor('GET', '/map/features?bbox=7.29,43.59,7.31,43.61')).json(),
    );
    expect(details.risks.features.some((feature) => feature.id === riskId)).toBe(false);
  });
});
