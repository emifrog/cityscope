import type { EtareSnapshot } from '@etare/contracts';
import { canonicalJson } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { PermanentJobError } from './jobs';
import {
  PDF_FILE,
  buildPublication,
  generateEtarePdf,
  publicationPdfKey,
  type PublicationArtifacts,
  buildPublicationContent,
  type BuildTools,
  type PublicationBuildStore,
  type PublicationToBuild,
} from './publication-build';

/** Deterministic stand-in for SHA-256 (64 hex characters): the runtime provides the real one. */
const fakeHash = (text: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0').repeat(8);
};

const tools: BuildTools = {
  sha256: async (text) => fakeHash(text),
  byteLength: (text) => text.length,
  now: () => new Date('2026-09-30T12:00:00Z'),
};

const fileAsset = (id: string, mime: string) => ({
  id,
  filename: `${id}`,
  mime_type: mime,
  size_bytes: 42,
  sha256: 'b'.repeat(64),
});

const snapshot: EtareSnapshot = {
  schema_version: 1,
  site: {
    id: '06000002-0000-4000-8000-000000000001',
    etare_number: '06-0428',
    name: 'EHPAD Les Oliviers',
    short_name: null,
    site_type: 'health',
    status: 'active',
    sensitivity: 'normal',
    address: null,
    location: { type: 'Point', coordinates: [7.25, 43.7] },
    footprint: null,
  },
  classifications: [],
  buildings: [],
  contacts: [],
  plans: [
    {
      id: '06000006-0000-4000-8000-000000000001',
      title: 'Bâtiment A - RDC',
      plan_type: 'level',
      building_id: null,
      level_id: '06000004-0000-4000-8000-000000000002',
      background: {
        revision_id: '06000007-0000-4000-8000-000000000001',
        revision_no: 1,
        page_number: 1,
        width: 1600,
        height: 1000,
        asset: fileAsset('06000005-0000-4000-8000-000000000001', 'image/png'),
      },
    },
  ],
  zones: [],
  objects: [],
  risks: [],
  catalog: { object_types: [], risk_types: [] },
  documents: (['always', 'on_demand', 'never'] as const).map((policy, index) => ({
    id: `0600000a-0000-4000-8000-00000000000${index}`,
    title: `FDS ${policy}`,
    category: 'fds' as const,
    offline_policy: policy,
    version: {
      id: `0600000b-0000-4000-8000-00000000000${index}`,
      version_no: 1,
      valid_from: null,
      expires_at: null,
      asset: fileAsset(`0600000c-0000-4000-8000-00000000000${index}`, 'application/pdf'),
    },
  })),
};

const toBuild = async (content: unknown = snapshot): Promise<PublicationToBuild> => ({
  id: '0600000f-0000-4000-8000-000000000002',
  tenantId: '06000000-0000-4000-8000-000000000000',
  siteId: snapshot.site.id,
  publicationNumber: 2,
  revisionId: '0600000d-0000-4000-8000-000000000002',
  revisionNo: 2,
  contentHash: await tools.sha256(canonicalJson(snapshot)),
  snapshot: content,
  requestedBy: { id: 'v', name: 'Validateur' },
  submittedBy: { id: 'r', name: 'Rédacteur' },
  submittedAt: new Date('2026-09-30T09:41:00Z'),
  approvedBy: { id: 'v', name: 'Validateur' },
  approvedAt: new Date('2026-09-30T11:00:00Z'),
});

describe('publication content', () => {
  it('lists every file by hash, with a canonical manifest hash', async () => {
    const built = await buildPublicationContent(await toBuild(), tools);
    const files = built.manifest['files'] as { path: string; required: boolean; sha256: string }[];
    expect(files.map((file) => [file.path, file.required])).toEqual([
      ['data/site.json', true],
      ['plans/06000007-0000-4000-8000-000000000001.png', true],
      ['documents/0600000b-0000-4000-8000-000000000000.pdf', true],
      ['documents/0600000b-0000-4000-8000-000000000001.pdf', false],
    ]);
    expect(files[0]?.sha256).toBe(await tools.sha256(canonicalJson(built.payload)));
    expect(built.manifestHash).toBe(await tools.sha256(canonicalJson(built.manifest)));
    expect(built.payload).toMatchObject({
      publication: { publication_number: 2, approved_by: 'Validateur' },
      data: snapshot,
    });
  });

  it('refuses a snapshot that is not the approved one', async () => {
    const altered = { ...snapshot, site: { ...snapshot.site, name: 'Autre nom' } };
    await expect(buildPublicationContent(await toBuild(altered), tools)).rejects.toThrow(PermanentJobError);
  });
});

describe('publication job', () => {
  it('marks the publication failed on a permanent error and leaves built ones alone', async () => {
    const altered = await toBuild({ ...snapshot, contacts: [{}] });
    const store: PublicationBuildStore = {
      start: vi.fn().mockResolvedValueOnce(altered).mockResolvedValueOnce(null),
      complete: vi.fn(),
      fail: vi.fn().mockResolvedValue(true),
      assetFiles: vi.fn(),
    };
    await expect(buildPublication(store, tools, altered.id, altered.tenantId)).rejects.toThrow('SNAPSHOT_INVALID');
    expect(store.fail).toHaveBeenCalledWith(altered.id, 'SNAPSHOT_INVALID');
    expect(await buildPublication(store, tools, altered.id, altered.tenantId)).toBe('already_built');
    expect(store.complete).not.toHaveBeenCalled();
  });
});

describe('ETARE PDF', () => {
  const background = snapshot.plans[0]?.background;
  const pngBytes = new Uint8Array([137, 80, 78, 71]);
  const bytesHash = async (content: Uint8Array) => fakeHash(String.fromCharCode(...content));

  const setup = (stored: Uint8Array) => {
    const objects = { download: vi.fn().mockResolvedValue(stored), upload: vi.fn(), copy: vi.fn(), remove: vi.fn() };
    const store: PublicationBuildStore = {
      start: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
      assetFiles: vi
        .fn()
        .mockResolvedValue([
          { id: background?.asset.id, storageKey: 'tenants/t/assets/a/b', sha256: 'x', mimeType: 'image/png' },
        ]),
    };
    const artifacts: PublicationArtifacts = {
      renderer: {
        templateVersion: 'etare-pdf/test',
        render: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
      },
      objects,
      sha256Bytes: bytesHash,
    };
    return { objects, store, artifacts };
  };

  it('draws the checked plan backgrounds, stores the PDF and lists it in the manifest', async () => {
    const expected = await bytesHash(pngBytes);
    const withHash = {
      ...snapshot,
      plans: snapshot.plans.map((plan) => ({
        ...plan,
        background: { ...plan.background, asset: { ...plan.background.asset, sha256: expected } },
      })),
    };
    const publication = { ...(await toBuild(withHash)), contentHash: await tools.sha256(canonicalJson(withHash)) };
    const { objects, store, artifacts } = setup(pngBytes);
    const generated = await generateEtarePdf(store, artifacts, publication, withHash, new Date('2026-09-30T12:00:00Z'));
    expect(generated.file).toMatchObject({
      path: PDF_FILE,
      media_type: 'application/pdf',
      required: true,
      size_bytes: 4,
    });
    expect(objects.upload).toHaveBeenCalledWith(
      publicationPdfKey(publication.tenantId, publication.id),
      expect.any(Uint8Array),
      'application/pdf',
      { upsert: true },
    );
    const input = vi.mocked(artifacts.renderer.render).mock.calls[0]?.[0];
    expect([...(input?.planImages.keys() ?? [])]).toEqual([background?.revision_id]);
  });

  it('stops when a stored background is not the approved one', async () => {
    const { store, artifacts } = setup(new Uint8Array([1, 2, 3]));
    await expect(generateEtarePdf(store, artifacts, await toBuild(), snapshot, new Date())).rejects.toThrow(
      'PLAN_BACKGROUND_HASH_MISMATCH',
    );
  });
});
