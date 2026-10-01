/**
 * Sprint 7 — proposals of an exploitant through the real stack (POR-03,
 * POR-04, ADR-019): the exploitant of the demo proposes a new number for a
 * published contact, with a photo checked by the worker; the Prévision asks a
 * question, sees the working value change in the meantime (conflict), integrates
 * the proposal into a draft revision and accepts it with an explicit
 * resolution; an independent validator then publishes, and the exploitant
 * follows the outcome up to the published version.
 */
import { createHash } from 'node:crypto';
import {
  PostgresAssetVerificationStore,
  PostgresJobQueue,
  PostgresPublicationBuildStore,
  SupabaseObjectStorage,
  createLogger,
  createPool,
} from '@etare/adapters';
import { createApiApp, createApiDependencies } from '@etare/api';
import { antivirusNotConfigured } from '@etare/application';
import { API_BASE_PATH, endpoints, type EtareRevision } from '@etare/contracts';
import { HandlerRegistry, assetVerificationHandler, createWorker, publicationBuildHandler } from '@etare/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_06, authApi, requireEnv, signIn, withSecondFactor } from './helpers';

const app = createApiApp(createApiDependencies(process.env));
const workerPool = createPool({
  connectionString: requireEnv('WORKER_DATABASE_URL'),
  applicationName: 'integration-contributions',
});
const sha256 = async (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const objects = SupabaseObjectStorage.fromSecretKey(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SECRET_KEY'));
const worker = createWorker({
  queue: new PostgresJobQueue(workerPool, 'integration-contributions'),
  registry: new HandlerRegistry([
    assetVerificationHandler({
      store: new PostgresAssetVerificationStore(workerPool),
      objects,
      scanner: antivirusNotConfigured,
      sha256,
    }),
    publicationBuildHandler({
      store: new PostgresPublicationBuildStore(workerPool),
      tools: { sha256, byteLength: (text) => Buffer.byteLength(text, 'utf8'), now: () => new Date() },
    }),
  ]),
  logger: createLogger({}, { write: () => undefined }),
  concurrency: 2,
  leaseSeconds: 30,
  pollIntervalMs: 100,
});

type Call = (method: string, path: string, body?: unknown, ifMatch?: number) => Promise<Response>;
const as =
  (token: string, tenant: string | null): Call =>
  async (method, path, body, ifMatch) =>
    app.request(`${API_BASE_PATH}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(tenant ? { 'x-tenant-id': tenant } : {}),
        'x-client-platform': 'web',
        'content-type': 'application/json',
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

const codeOf = async (response: Response) => ((await response.json()) as { error: { code: string } }).error.code;

const factors: { token: string; factorId: string }[] = [];
const strong = async (token: string) => {
  const factor = await withSecondFactor(token);
  factors.push(factor);
  return factor.token;
};

const WAREHOUSE = '06000002-0000-4000-8000-000000000002';
const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode(`standard ${Date.now()}`)]);
let editor: Call;
let validator: Call;
let exploitantAal1: Call;
let exploitant: Call;
let siteId = '';
let contactId = '';
let invitationId = '';
let contributionId = '';

const publish = async (summary: string) => {
  const draft = endpoints.getSiteEtare.response
    .parse(await (await editor('GET', `/sites/${siteId}/etare`)).json())
    .revisions.find((revision) => revision.status === 'draft');
  const open =
    draft ??
    endpoints.createRevision.response.parse(
      await (await editor('POST', `/sites/${siteId}/etare/revisions`, { change_summary: summary })).json(),
    );
  const submitted: EtareRevision = endpoints.submitRevision.response.parse(
    await (
      await editor('POST', `/etare-revisions/${open.id}/submit`, { change_summary: summary }, open.row_version)
    ).json(),
  );
  const decided = await validator('POST', `/etare-revisions/${open.id}/decision`, {
    decision: 'approved',
    revision_hash: submitted.content_hash,
    publish: true,
  });
  expect(decided.status).toBe(200);
  await worker.runOnce();
};

beforeAll(async () => {
  const [editorToken, validatorToken, exploitantToken] = await Promise.all([
    signIn('redacteur06@demo.etare.test'),
    signIn('validateur06@demo.etare.test'),
    signIn('exploitant.oliviers@demo.etare.test'),
  ]);
  editor = as(await strong(editorToken), TENANT_06);
  validator = as(await strong(validatorToken), TENANT_06);

  // A site published for the test, with the contact the exploitant will correct.
  const created = await editor('POST', '/sites', {
    name: `Site contributions ${Date.now()}`,
    site_type: 'erp',
    status: 'active',
    address: { street: '2 rue du Port', city: 'Nice', postal_code: '06300' },
    location: { type: 'Point', coordinates: [7.29, 43.7] },
  });
  siteId = ((await created.json()) as { id: string }).id;
  const contact = await editor('POST', `/sites/${siteId}/contacts`, {
    name: 'Standard',
    phone: '+33493000010',
    visibility: 'ops',
  });
  contactId = ((await contact.json()) as { id: string }).id;
  await publish('Première version');

  const invited = endpoints.createPortalInvitation.response.parse(
    await (
      await editor('POST', '/portal-invitations', {
        email: 'exploitant.oliviers@demo.etare.test',
        site_ids: [siteId],
      })
    ).json(),
  );
  invitationId = invited.invitation.id;
  expect((await as(exploitantToken, null)('POST', `/me/portal-invitations/${invitationId}/acceptance`)).status).toBe(
    200,
  );
  exploitantAal1 = as(exploitantToken, TENANT_06);
  exploitant = as(await strong(exploitantToken), TENANT_06);
});

afterAll(async () => {
  if (invitationId) {
    const current = endpoints.listPortalInvitations.response
      .parse(await (await editor('GET', '/portal-invitations')).json())
      .items.find((item) => item.id === invitationId);
    await editor(
      'POST',
      `/portal-invitations/${invitationId}/revocation`,
      { reason: 'Fin du test' },
      current?.row_version,
    );
  }
  for (const factor of factors) await authApi(`/factors/${factor.factorId}`, { method: 'DELETE', token: factor.token });
  await workerPool.end();
});

describe('proposals of an exploitant', () => {
  const proposal = {
    target_type: 'contact',
    operation: 'update',
    target_id: '',
    title: 'Nouveau numéro du standard',
    description: 'Le standard a changé de numéro le 1er octobre.',
    proposed_value: { phone: '+33493000099' },
    files: [] as unknown[],
  };

  it('lets the exploitant propose a change with a photo, on their sites only', async () => {
    const body = {
      ...proposal,
      target_id: contactId,
      files: [
        {
          filename: 'standard.jpg',
          mime_type: 'image/jpeg',
          size_bytes: photo.byteLength,
          sha256: await sha256(photo),
        },
      ],
    };
    expect(await codeOf(await exploitantAal1('POST', `/portal/sites/${siteId}/contributions`, body))).toBe('FORBIDDEN');
    expect(await codeOf(await exploitant('POST', `/portal/sites/${WAREHOUSE}/contributions`, body))).toBe('FORBIDDEN');
    expect(
      await codeOf(
        await exploitant('POST', `/portal/sites/${siteId}/contributions`, {
          ...body,
          proposed_value: { access_code: '1234' },
        }),
      ),
    ).toBe('VALIDATION_FAILED');

    const response = await exploitant('POST', `/portal/sites/${siteId}/contributions`, body);
    expect(response.status).toBe(201);
    const receipt = endpoints.createPortalContribution.response.parse(await response.json());
    contributionId = receipt.contribution.id;
    expect(receipt.contribution).toMatchObject({
      status: 'submitted',
      base_value: expect.objectContaining({ phone: '+33493000010' }),
      publication_number: 1,
    });
    expect(receipt.uploads).toHaveLength(1);
    const ticket = receipt.uploads[0]?.upload;
    if (!ticket) throw new Error('Upload ticket expected.');
    await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: photo });
    const confirmed = endpoints.confirmPortalContributionUploads.response.parse(
      await (await exploitant('POST', `/portal/contributions/${contributionId}/uploaded`)).json(),
    );
    expect(confirmed.verifications).toBe(1);
    await worker.runOnce();
  });

  it('lets the Prévision see the proposal, its photo, and ask a question', async () => {
    const list = endpoints.listContributions.response.parse(await (await editor('GET', '/contributions')).json());
    expect(list.items.some((item) => item.id === contributionId)).toBe(true);
    expect(list.open_count).toBeGreaterThan(0);
    const detail = endpoints.getContribution.response.parse(
      await (await editor('GET', `/contributions/${contributionId}`)).json(),
    );
    expect(detail).toMatchObject({ conflict: false, author: { email: 'exploitant.oliviers@demo.etare.test' } });
    expect(detail.attachments.map((asset) => asset.scan_status)).toEqual(['clean']);

    const asked = await editor(
      'PATCH',
      `/contributions/${contributionId}`,
      { status: 'info_requested', message: 'Le numéro est-il joignable la nuit ?' },
      detail.row_version,
    );
    expect(asked.status).toBe(200);
    const replied = endpoints.replyPortalContribution.response.parse(
      await (
        await exploitant('POST', `/portal/contributions/${contributionId}/messages`, { body: 'Oui, 24 h sur 24.' })
      ).json(),
    );
    expect(replied.status).toBe('in_review');
    expect(replied.messages.map((message) => message.side)).toEqual(['sis', 'exploitant']);
  });

  it('requires a draft revision and an explicit resolution of a conflict to accept', async () => {
    // The working value changes in the meantime.
    const contacts = endpoints.listContacts.response.parse(
      await (await editor('GET', `/sites/${siteId}/contacts`)).json(),
    );
    const contact = contacts.items.find((item) => item.id === contactId);
    expect(
      (await editor('PATCH', `/contacts/${contactId}`, { phone: '+33493000020' }, contact?.row_version)).status,
    ).toBe(200);
    let current = endpoints.getContribution.response.parse(
      await (await editor('GET', `/contributions/${contributionId}`)).json(),
    );
    expect(current.conflict).toBe(true);
    expect(
      (
        await editor(
          'PATCH',
          `/contributions/${contributionId}`,
          { status: 'accepted', decision_comment: 'Retenu.' },
          current.row_version,
        )
      ).status,
    ).toBe(400);

    // The Prévision opens the working revision that will carry the change.
    const draft = endpoints.createRevision.response.parse(
      await (
        await editor('POST', `/sites/${siteId}/etare/revisions`, { change_summary: 'Contribution de l’exploitant' })
      ).json(),
    );
    current = endpoints.updateContribution.response.parse(
      await (
        await editor('PATCH', `/contributions/${contributionId}`, { revision_id: draft.id }, current.row_version)
      ).json(),
    );
    expect(current.resolution?.revision_id).toBe(draft.id);
    expect(
      await codeOf(
        await editor(
          'PATCH',
          `/contributions/${contributionId}`,
          { status: 'accepted', decision_comment: 'Retenu.' },
          current.row_version,
        ),
      ),
    ).toBe('CONFLICT');
    const accepted = await editor(
      'PATCH',
      `/contributions/${contributionId}`,
      {
        status: 'accepted',
        decision_comment: 'Numéro du standard mis à jour.',
        conflict_resolution: 'Le numéro de l’exploitant remplace celui saisi entre-temps.',
      },
      current.row_version,
    );
    expect(accepted.status).toBe(200);
    // Applied in the working data by the Prévision, then validated by someone else.
    const after = endpoints.listContacts.response
      .parse(await (await editor('GET', `/sites/${siteId}/contacts`)).json())
      .items.find((item) => item.id === contactId);
    await editor('PATCH', `/contacts/${contactId}`, { phone: '+33493000099' }, after?.row_version);
    expect(
      (
        await editor(
          'PATCH',
          `/contributions/${contributionId}`,
          { status: 'rejected', decision_comment: 'Finalement non.' },
          endpoints.getContribution.response.parse(
            await (await editor('GET', `/contributions/${contributionId}`)).json(),
          ).row_version,
        )
      ).status,
    ).toBe(409);
  });

  it('lets the exploitant follow the outcome up to the published version', async () => {
    await publish('Mise à jour proposée par l’exploitant');
    const mine = endpoints.listPortalContributions.response.parse(
      await (await exploitant('GET', `/portal/contributions?site_id=${siteId}`)).json(),
    );
    const outcome = mine.items.find((item) => item.id === contributionId);
    expect(outcome).toMatchObject({ status: 'accepted', resolution: { publication_number: 2 } });
    const site = endpoints.getPortalSite.response.parse(
      await (await exploitant('GET', `/portal/sites/${siteId}`)).json(),
    );
    expect(site.contacts.find((item) => item.id === contactId)?.phone).toBe('+33493000099');
  });

  it('lets the exploitant withdraw a proposal not decided yet', async () => {
    const created = endpoints.createPortalContribution.response.parse(
      await (
        await exploitant('POST', `/portal/sites/${siteId}/contributions`, {
          target_type: 'other',
          operation: 'create',
          title: 'Nouveau stockage',
          description: 'Local de charge des batteries au sous-sol.',
          files: [],
        })
      ).json(),
    );
    const withdrawn = endpoints.withdrawPortalContribution.response.parse(
      await (await exploitant('POST', `/portal/contributions/${created.contribution.id}/withdrawal`)).json(),
    );
    expect(withdrawn.status).toBe('withdrawn');
    expect((await exploitant('POST', `/portal/contributions/${created.contribution.id}/withdrawal`)).status).toBe(409);
    // The working data stay out of reach of the exploitant.
    expect((await exploitant('GET', '/contributions')).status).toBe(403);
  });
});
