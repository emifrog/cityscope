import type { Contribution, PortalContribution } from '@etare/contracts';
import { Conflict, InvalidInput, permissionsForRoles, type RequestContext, type Role } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { createPortalContribution, updateContribution } from './contributions';
import type { ContributionRepository, ObjectStorage, RequestSession, SessionFactory } from './ports';
import { stubSession } from './testing';

const TENANT = '06000000-0000-4000-8000-000000000000';
const EHPAD = '06000002-0000-4000-8000-000000000001';
const ID = '0600cccc-0000-4000-8000-000000000001';
const DRAFT = '0600000d-0000-4000-8000-000000000002';
const NOW = '2026-10-01T10:00:00.000Z';

const context: RequestContext = {
  principal: { provider: 'supabase', subject: 'someone', email: null, assurance: 'aal2' },
  tenantId: TENANT,
  traceId: 'trace',
  origin: 'web',
};

const proposal = (overrides: Partial<Contribution> = {}): Contribution => ({
  id: ID,
  site_id: EHPAD,
  site_name: 'EHPAD Les Oliviers',
  etare_number: '06-0428',
  author: { id: 'exploitant', name: 'Direction', email: 'direction@ehpad.test' },
  target_type: 'contact',
  target_id: '06000007-0000-4000-8000-000000000001',
  operation: 'update',
  title: 'Nouveau numéro',
  description: 'Le standard a changé.',
  base_value: { phone: '01 99 00 12 34' },
  proposed_value: { phone: '04 93 00 00 00' },
  current_value: { phone: '01 99 00 12 34' },
  conflict: false,
  publication: { id: '0600000f-0000-4000-8000-000000000001', publication_number: 1 },
  current_publication_number: 1,
  status: 'in_review',
  assigned_to: null,
  decision_comment: null,
  conflict_resolution: null,
  decided_by: null,
  decided_at: null,
  created_at: NOW,
  messages: [],
  attachments: [],
  resolution: null,
  row_version: 2,
  ...overrides,
});

const portalView: PortalContribution = {
  id: ID,
  site_id: EHPAD,
  site_name: 'EHPAD Les Oliviers',
  target_type: 'other',
  target_id: null,
  operation: 'create',
  title: 'Nouveau stockage',
  description: 'Local batteries.',
  base_value: null,
  proposed_value: null,
  status: 'submitted',
  decision_comment: null,
  decided_at: null,
  created_at: NOW,
  publication_number: 1,
  messages: [],
  files: [],
  resolution: null,
};

function setup(roles: Role[], current: Contribution) {
  const contributions = {
    get: vi.fn<ContributionRepository['get']>(async () => current),
    update: vi.fn<ContributionRepository['update']>(async () => current),
    submit: vi.fn<ContributionRepository['submit']>(async () => ID),
    mineOne: vi.fn<ContributionRepository['mineOne']>(async () => portalView),
    files: vi.fn<ContributionRepository['files']>(async () => [
      {
        assetId: 'a1',
        quarantineKey: 'tenants/t/quarantine/a1/v',
        mimeType: 'image/jpeg',
        sha256: 'e'.repeat(64),
        scanStatus: 'pending',
      },
      { assetId: 'a2', quarantineKey: null, mimeType: 'image/jpeg', sha256: 'f'.repeat(64), scanStatus: 'clean' },
    ]),
  };
  const sessions: SessionFactory = {
    run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) =>
      work(
        stubSession(
          { userId: 'user', tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) },
          { contributions },
        ),
      ),
  };
  return { sessions, contributions };
}

describe('instruction of a proposal', () => {
  it('asks the exploitant a question with the message as an information request', async () => {
    const { sessions, contributions } = setup(['PREVISION_EDITOR'], proposal());
    await updateContribution(sessions, context, ID, 2, { status: 'info_requested', message: 'Joignable la nuit ?' });
    expect(contributions.update).toHaveBeenCalledWith(
      ID,
      2,
      { status: 'info_requested' },
      {
        body: 'Joignable la nuit ?',
        kind: 'info_request',
      },
    );
  });

  it('accepts only into a draft revision', async () => {
    const { sessions, contributions } = setup(['PREVISION_EDITOR'], proposal());
    await expect(
      updateContribution(sessions, context, ID, 2, { status: 'accepted', decision_comment: 'Retenu.' }),
    ).rejects.toBeInstanceOf(InvalidInput);
    await updateContribution(sessions, context, ID, 2, {
      status: 'accepted',
      decision_comment: 'Retenu.',
      revision_id: DRAFT,
    });
    expect(contributions.update).toHaveBeenCalledTimes(1);
  });

  it('never accepts a proposal in conflict without an explicit resolution', async () => {
    const { sessions } = setup(
      ['PREVISION_EDITOR'],
      proposal({ conflict: true, current_value: { phone: '01 99 00 99 99' } }),
    );
    await expect(
      updateContribution(sessions, context, ID, 2, {
        status: 'accepted',
        decision_comment: 'Retenu.',
        revision_id: DRAFT,
      }),
    ).rejects.toBeInstanceOf(Conflict);
    await expect(
      updateContribution(sessions, context, ID, 2, {
        status: 'partially_accepted',
        decision_comment: 'Numéro retenu.',
        conflict_resolution: 'Le numéro de l’exploitant remplace celui saisi entre-temps.',
        revision_id: DRAFT,
      }),
    ).resolves.toBeDefined();
  });

  it('keeps a decision final', async () => {
    const { sessions } = setup(['PREVISION_EDITOR'], proposal({ status: 'rejected', decided_at: NOW }));
    await expect(updateContribution(sessions, context, ID, 2, { status: 'in_review' })).rejects.toBeInstanceOf(
      Conflict,
    );
  });

  it('is reserved to the Prévision and the SIS administration', async () => {
    const { sessions } = setup(['EXPLOITANT'], proposal());
    await expect(updateContribution(sessions, context, ID, 2, { status: 'in_review' })).rejects.toThrow();
  });
});

describe('proposal of an exploitant', () => {
  it('issues upload URLs for the files still awaited, after recording the proposal', async () => {
    const { sessions, contributions } = setup(['EXPLOITANT'], proposal());
    const storage: ObjectStorage = {
      createDownloadUrl: vi.fn(),
      createUploadUrl: vi.fn(async (key: string) => ({
        url: `https://storage.test/${key}`,
        headers: { 'content-type': 'image/jpeg' },
        expiresAt: new Date(NOW),
      })),
    };
    const receipt = await createPortalContribution({ sessions, storage }, context, EHPAD, {
      target_type: 'other',
      operation: 'create',
      title: 'Nouveau stockage',
      description: 'Local batteries.',
      files: [{ filename: 'stockage.jpg', mime_type: 'image/jpeg', size_bytes: 10, sha256: 'e'.repeat(64) }],
    });
    expect(contributions.submit).toHaveBeenCalledWith(
      EHPAD,
      TENANT,
      expect.objectContaining({ title: 'Nouveau stockage' }),
    );
    expect(receipt.uploads).toEqual([
      {
        sha256: 'e'.repeat(64),
        upload: expect.objectContaining({
          asset_id: 'a1',
          method: 'PUT',
          url: 'https://storage.test/tenants/t/quarantine/a1/v',
        }),
      },
    ]);
  });
});
