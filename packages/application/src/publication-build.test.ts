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
  type BuiltPublication,
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
const lease = { jobId: '06000090-0000-4000-8000-000000000002', attempt: 1 };

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
  objects: [
    {
      id: '06000008-0000-4000-8000-000000000001',
      type_code: 'PEI',
      type_name: 'Point d’eau incendie',
      category: 'water',
      name: null,
      label: 'PI 12',
      building_id: null,
      level_id: null,
      zone_id: null,
      geometry: null,
      plan_position: null,
      properties: {},
      instructions: null,
      criticality: 'info',
      status: 'active',
      verified_at: null,
      photos: [
        {
          id: '06000009-0000-4000-8000-000000000001',
          caption: 'Accès au poteau',
          asset: fileAsset('06000009-0000-4000-8000-0000000000a1', 'image/jpeg'),
        },
      ],
    },
  ],
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
      ['photos/06000009-0000-4000-8000-000000000001.jpg', true],
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

  it('signs the canonical manifest when a publication key is given', async () => {
    expect((await buildPublicationContent(await toBuild(), tools)).manifestSignature).toBeNull();
    const sign = vi.fn(() => ({ algorithm: 'Ed25519' as const, key_id: 'publication', signature: 'sig' }));
    const built = await buildPublicationContent(await toBuild(), { ...tools, signer: { keyId: 'publication', sign } });
    expect(built.manifestSignature).toEqual({ algorithm: 'Ed25519', key_id: 'publication', signature: 'sig' });
    expect(sign).toHaveBeenCalledWith('etare.manifest.v1', canonicalJson(built.manifest));
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
      recordOutput: vi.fn().mockResolvedValue(undefined),
      assetFiles: vi.fn(),
    };
    await expect(buildPublication(store, tools, altered.id, altered.tenantId, lease)).rejects.toThrow(
      'SNAPSHOT_INVALID',
    );
    expect(store.fail).toHaveBeenCalledWith(altered.id, 'SNAPSHOT_INVALID', lease);
    expect(await buildPublication(store, tools, altered.id, altered.tenantId, lease)).toBe('already_built');
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
      recordOutput: vi.fn().mockResolvedValue(undefined),
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

  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'checks %s backgrounds and stores an immutable PDF',
    async (mimeType) => {
      const expected = await bytesHash(pngBytes);
      const withHash = {
        ...snapshot,
        plans: snapshot.plans.map((plan) => ({
          ...plan,
          background: {
            ...plan.background,
            asset: { ...plan.background.asset, sha256: expected, mime_type: mimeType },
          },
        })),
      };
      const publication = { ...(await toBuild(withHash)), contentHash: await tools.sha256(canonicalJson(withHash)) };
      const { objects, store, artifacts } = setup(pngBytes);
      const generated = await generateEtarePdf(
        store,
        artifacts,
        publication,
        withHash,
        new Date('2026-09-30T12:00:00Z'),
      );
      expect(generated.file).toMatchObject({
        path: PDF_FILE,
        media_type: 'application/pdf',
        required: true,
        size_bytes: 4,
      });
      expect(objects.upload).toHaveBeenCalledWith(
        publicationPdfKey(publication.tenantId, publication.id, generated.file.sha256),
        expect.any(Uint8Array),
        'application/pdf',
        { upsert: false },
      );
      const input = vi.mocked(artifacts.renderer.render).mock.calls[0]?.[0];
      expect([...(input?.planImages.keys() ?? [])]).toEqual([background?.revision_id]);
      const built = await buildPublicationContent(publication, tools, generated);
      expect(built.pdfStorageKey).toBe(generated.storageKey);
    },
  );

  it('stops when a stored background is not the approved one', async () => {
    const { store, artifacts } = setup(new Uint8Array([1, 2, 3]));
    await expect(generateEtarePdf(store, artifacts, await toBuild(), snapshot, new Date())).rejects.toThrow(
      'PLAN_BACKGROUND_HASH_MISMATCH',
    );
  });

  it('accepts a duplicate upload only when the existing object has the same hash', async () => {
    const noPlans = { ...snapshot, plans: [] };
    const publication = await toBuild(noPlans);
    const { store, artifacts, objects } = setup(new Uint8Array([37, 80, 68, 70]));
    objects.upload.mockRejectedValue(new Error('OBJECT_EXISTS'));
    await expect(generateEtarePdf(store, artifacts, publication, noPlans, new Date())).resolves.toHaveProperty(
      'storageKey',
    );
    objects.download.mockResolvedValue(new Uint8Array([0]));
    await expect(generateEtarePdf(store, artifacts, publication, noPlans, new Date())).rejects.toThrow('OBJECT_EXISTS');
  });

  it('keeps the published PDF intact when an older attempt finishes after its replacement', async () => {
    const noPlans = { ...snapshot, plans: [] };
    const publication = { ...(await toBuild(noPlans)), contentHash: await tools.sha256(canonicalJson(noPlans)) };
    const stored = new Map<string, Uint8Array>();
    let currentAttempt = 1;
    let winner: BuiltPublication | undefined;
    const store: PublicationBuildStore = {
      start: async () => publication,
      assetFiles: async () => [],
      fail: vi.fn(),
      recordOutput: vi.fn().mockResolvedValue(undefined),
      complete: async (_id, built, token) => {
        if (token.attempt !== currentAttempt || winner) return null;
        winner = built;
        return 'published';
      },
    };
    const deferred = () => {
      let resolve = () => {};
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const started = deferred();
    const resume = deferred();
    const artifacts: PublicationArtifacts = {
      sha256Bytes: bytesHash,
      objects: {
        download: async (key) => stored.get(key) ?? null,
        upload: async (key, bytes, _mime, options) => {
          if (stored.has(key) && !options?.upsert) throw new Error('OBJECT_EXISTS');
          stored.set(key, bytes);
        },
        copy: vi.fn(),
        remove: vi.fn(),
      },
      renderer: {
        templateVersion: 'test',
        render: async () => {
          const attempt = currentAttempt;
          if (attempt === 1) {
            started.resolve();
            await resume.promise;
          }
          return new Uint8Array([37, 80, 68, 70, attempt]);
        },
      },
    };
    const late = buildPublication(store, tools, publication.id, publication.tenantId, lease, artifacts);
    await started.promise;
    currentAttempt = 2;
    expect(
      await buildPublication(store, tools, publication.id, publication.tenantId, { ...lease, attempt: 2 }, artifacts),
    ).toBe('published');
    resume.resolve();
    expect(await late).toBe('already_built');
    const file = (winner?.manifest['files'] as { path: string; sha256: string }[]).find(
      (entry) => entry.path === PDF_FILE,
    );
    // The object named by the published manifest is the winner's PDF, untouched by the late attempt.
    const pdf = stored.get(winner?.pdfStorageKey ?? '') ?? new Uint8Array();
    expect(pdf.byteLength).toBeGreaterThan(0);
    expect(await bytesHash(pdf)).toBe(file?.sha256);
    expect(stored.size).toBe(2);
  });
});
