import type { FieldReport, FieldReportSubmit } from '@etare/contracts';
import {
  AccessDenied,
  Conflict,
  EMPTY_BODY_SHA256,
  deviceRequestText,
  permissionsForRoles,
  type RequestContext,
  type Role,
} from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import type { DeviceProof, DistributionDependencies } from './distribution';
import { listFieldReports, submitFieldReport, updateFieldReport } from './field-reports';
import type { FieldReportRepository, ObjectStorage, RequestSession, SessionFactory } from './ports';
import { stubSession } from './testing';

const TENANT = '06000000-0000-4000-8000-000000000000';
const DEVICE = '06000010-0000-4000-8000-000000000001';
const REPORT = '0600aaaa-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-01T10:00:00.000Z');
const KEY = 'terminal-key';

const context: RequestContext = {
  principal: { provider: 'supabase', subject: 'ops', email: null, assurance: 'aal1' },
  tenantId: TENANT,
  traceId: 'trace',
  origin: 'mobile',
};

// Stand-ins for the signatures (the API and the adapters test the real Ed25519).
const sign = (text: string) => `${KEY}|${text}`;
const proof = (): DeviceProof => {
  const base = {
    deviceId: DEVICE,
    timestamp: NOW.getTime(),
    method: 'POST',
    path: '/api/v1/sync/reports',
    bodySha256: EMPTY_BODY_SHA256,
    appVersion: '1.0.0',
  };
  return { ...base, signature: sign(deviceRequestText(base)) };
};

const input: FieldReportSubmit = {
  client_report_id: '0600cccc-0000-4000-8000-000000000001',
  site_id: '06000002-0000-4000-8000-000000000001',
  publication_id: '0600000f-0000-4000-8000-000000000002',
  category: 'access',
  severity: 'urgent',
  description: 'Portail secondaire condamné.',
  observed_at: '2026-10-01T09:00:00.000Z',
  item: null,
  plan_position: null,
  photos: [],
};

function setup(roles: Role[] = ['OPS_USER'], overrides: Partial<FieldReportRepository> = {}) {
  const fieldReports = {
    submit: vi.fn<FieldReportRepository['submit']>(async () => ({
      reportId: REPORT,
      created: true,
      contentHash: 'f'.repeat(64),
      receivedAt: NOW.toISOString(),
    })),
    photos: vi.fn<FieldReportRepository['photos']>(async () => [
      {
        assetId: 'a1',
        quarantineKey: 'tenants/t/quarantine/a1/v',
        mimeType: 'image/jpeg',
        sha256: '1'.repeat(64),
        scanStatus: 'pending',
      },
      { assetId: 'a2', quarantineKey: null, mimeType: 'image/png', sha256: '2'.repeat(64), scanStatus: 'clean' },
    ]),
    ...overrides,
  };
  const storage = {
    createUploadUrl: vi.fn(async (key: string, contentType: string) => ({
      url: `https://storage.test/upload/${key}`,
      headers: { 'content-type': contentType },
      expiresAt: new Date(NOW.getTime() + 60_000),
    })),
  } as unknown as ObjectStorage;
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) =>
      work(
        stubSession(
          { userId: 'user', tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) },
          { devices: { syncDevice: async () => ({ status: 'active', publicKey: KEY }) }, fieldReports },
        ),
      ),
  };
  const deps: DistributionDependencies = {
    sessions,
    storage,
    catalogSigner: { keyId: 'catalog', sign: () => ({ algorithm: 'Ed25519', key_id: 'catalog', signature: 's' }) },
    verifier: { verify: (publicKey, text, signature) => signature === `${publicKey}|${text}` },
    sha256: async () => '0'.repeat(64),
    randomBytes: (length) => new Uint8Array(length),
    now: () => NOW,
  };
  return { deps, sessions, fieldReports, storage };
}

const report = (status: FieldReport['status']): FieldReport => ({
  id: REPORT,
  site_id: input.site_id,
  site_name: 'EHPAD Les Oliviers',
  etare_number: '06-0428',
  category: 'access',
  severity: 'urgent',
  description: input.description,
  status,
  observed_at: input.observed_at,
  received_at: NOW.toISOString(),
  reporter: { id: 'user', name: 'Agent' },
  assigned_to: null,
  decision_comment: status === 'resolved' ? 'Corrigé.' : null,
  decided_by: null,
  decided_at: null,
  publication: { id: input.publication_id, publication_number: 2 },
  current_publication_number: 2,
  item: null,
  plan_position: null,
  photos: [],
  resolution: null,
  row_version: 3,
});

describe('field reports sent by a terminal', () => {
  it('acknowledges the report and issues upload URLs for the photos still waiting for their file', async () => {
    const { deps, fieldReports, storage } = setup();
    const receipt = await submitFieldReport(deps, context, proof(), input);
    expect(fieldReports.submit).toHaveBeenCalledWith(DEVICE, TENANT, input);
    expect(receipt).toMatchObject({ report_id: REPORT, created: true, content_hash: 'f'.repeat(64) });
    expect(receipt.uploads).toEqual([
      {
        sha256: '1'.repeat(64),
        upload: expect.objectContaining({ asset_id: 'a1', method: 'PUT', url: expect.stringContaining('/a1/') }),
      },
    ]);
    expect(storage.createUploadUrl).toHaveBeenCalledTimes(1);
  });

  it('refuses a member without field_report:create, even with offline access', async () => {
    const { deps, fieldReports } = setup(['PREVISION_EDITOR']);
    await expect(submitFieldReport(deps, context, proof(), input)).rejects.toBeInstanceOf(AccessDenied);
    expect(fieldReports.submit).not.toHaveBeenCalled();
  });
});

describe('instruction by the Prévision', () => {
  it('is reserved to field_report:review', async () => {
    const { sessions } = setup(['OPS_USER']);
    await expect(listFieldReports(sessions, context, { limit: 50, view: 'open' })).rejects.toBeInstanceOf(AccessDenied);
  });

  it('never changes a decided report', async () => {
    const update = vi.fn<FieldReportRepository['update']>();
    const { sessions } = setup(['PREVISION_EDITOR'], { get: async () => report('resolved'), update });
    await expect(
      updateFieldReport(sessions, context, REPORT, 3, { status: 'rejected', decision_comment: 'Non.' }),
    ).rejects.toBeInstanceOf(Conflict);
    expect(update).not.toHaveBeenCalled();
  });

  it('takes a new report in charge', async () => {
    const update = vi.fn<FieldReportRepository['update']>(async () => report('triaged'));
    const { sessions } = setup(['PREVISION_EDITOR'], { get: async () => report('new'), update });
    await expect(updateFieldReport(sessions, context, REPORT, 3, { status: 'triaged' })).resolves.toMatchObject({
      status: 'triaged',
    });
    expect(update).toHaveBeenCalledWith(REPORT, 3, { status: 'triaged' });
  });
});
