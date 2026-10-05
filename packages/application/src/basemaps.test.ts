import { basemapManifestSchema, type Signature } from '@etare/contracts';
import {
  AccessDenied,
  BASEMAP_TILES_FILE,
  Conflict,
  ServiceUnavailable,
  canonicalJson,
  permissionsForRoles,
  zxyToTileId,
  type RequestContext,
  type Role,
  type SignatureContext,
} from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  basemapPlanningSlot,
  buildBasemap,
  getBasemapOverview,
  planBasemaps,
  requestBasemapBuild,
  type BasemapArchiveHeader,
  type BasemapArchiveWriter,
  type BasemapBuildDependencies,
  type BasemapBuildStore,
  type BasemapJob,
  type BasemapRepository,
  type BasemapSourceInfo,
  type BasemapTileSource,
} from './basemaps';
import type { ObjectStoreAdmin, RequestSession, SessionFactory } from './ports';
import { stubSession } from './testing';

const TENANT = '06000000-0000-4000-8000-000000000000';
const PACK = '0600000b-0000-4000-8000-000000000001';
const SECTOR = '06000005-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-05T10:00:00.000Z');
const NICE = [7.2518, 43.7079] as const;
/** ASCII bytes of a text (no runtime encoder in this package). */
const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0) & 0xff);

const fakeHash = (content: Uint8Array | string) => {
  const text =
    typeof content === 'string' ? content : Array.from(content, (byte) => String.fromCharCode(byte)).join('');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1)
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0').repeat(8);
};

const approved: BasemapSourceInfo = {
  id: 'synthetic',
  product: 'Fond d’essai',
  attribution: 'Essai — aucune donnée IGN',
  licenceName: 'Essai',
  licenceUrl: 'https://example.org/licence',
  synthetic: true,
  rights: 'approved',
  rightsReference: 'généré',
};
const unverified: BasemapSourceInfo = { ...approved, id: 'ign-plan-vector', synthetic: false, rights: 'unverified' };

const job: BasemapJob = {
  packId: PACK,
  tenantId: TENANT,
  sectorId: SECTOR,
  sectorName: 'CIS Nice Centre',
  version: 3,
  sourceId: 'synthetic',
  siteCount: 1,
  coverage: { extent: [NICE[0], NICE[1], NICE[0], NICE[1]], detail: [NICE] },
};

function source(
  info: BasemapSourceInfo,
  tile?: BasemapTileSource['tile'],
): BasemapTileSource & {
  tile: ReturnType<typeof vi.fn>;
} {
  return {
    info,
    tile: vi.fn(tile ?? (async (z: number, x: number, y: number) => ascii(`${z}/${x}/${y}`))),
    styleFiles: async () => ({
      style: { version: 8, sources: {} },
      files: [{ path: 'sprite.json', content: ascii('{}'), mediaType: 'application/json' }],
    }),
  };
}

/** In-memory archive: the bytes are the ids of the tiles, read back in parts. */
function archives() {
  const added: number[] = [];
  const disposed = { count: 0 };
  let finished: BasemapArchiveHeader | null = null;
  const writer: BasemapArchiveWriter = {
    get dataBytes() {
      return added.length * 10;
    },
    add: async (tileId) => {
      added.push(tileId);
    },
    finish: async (header) => {
      finished = header;
      const bytes = ascii(added.join(','));
      return {
        sizeBytes: bytes.byteLength,
        sha256: fakeHash(bytes),
        tileCount: added.length,
        async *parts(partBytes: number) {
          for (let at = 0; at < bytes.byteLength; at += partBytes) yield bytes.slice(at, at + partBytes);
        },
      };
    },
    dispose: async () => {
      disposed.count++;
    },
  };
  return { factory: { create: async () => writer }, added, disposed, header: () => finished };
}

function store(start: BasemapJob | null = job) {
  const order: string[] = [];
  const fake = {
    schedule: vi.fn<BasemapBuildStore['schedule']>(async () => undefined),
    plan: vi.fn<BasemapBuildStore['plan']>(async () => 2),
    start: vi.fn<BasemapBuildStore['start']>(async () => start),
    recordObject: vi.fn<BasemapBuildStore['recordObject']>(async (_pack, _tenant, key) => {
      order.push(`record ${key}`);
      return true;
    }),
    complete: vi.fn<BasemapBuildStore['complete']>(async () => true),
    fail: vi.fn<BasemapBuildStore['fail']>(async () => true),
    objectsToRemove: vi.fn<BasemapBuildStore['objectsToRemove']>(async () => [
      { packId: PACK, tenantId: TENANT, keys: ['a', 'b'] },
    ]),
    markRemoved: vi.fn<BasemapBuildStore['markRemoved']>(async () => true),
  } satisfies BasemapBuildStore;
  return { fake, order };
}

function objects(order: string[] = []) {
  return {
    download: vi.fn(),
    copy: vi.fn(),
    remove: vi.fn<ObjectStoreAdmin['remove']>(async () => undefined),
    upload: vi.fn<ObjectStoreAdmin['upload']>(async (key) => {
      order.push(`upload ${key}`);
    }),
  } satisfies ObjectStoreAdmin;
}

const signer = {
  keyId: 'publication-test',
  sign: (context: SignatureContext, content: string): Signature => ({
    algorithm: 'Ed25519',
    key_id: 'publication-test',
    signature: fakeHash(`${context}\n${content}`),
  }),
};

function deps(overrides: Partial<BasemapBuildDependencies> = {}) {
  const built = store();
  const archive = archives();
  const storage = objects(built.order);
  const tiles = source(approved);
  const value: BasemapBuildDependencies = {
    store: built.fake,
    source: tiles,
    archives: archive.factory,
    objects: storage,
    signer,
    sha256: async (content) => fakeHash(content),
    utf8: (text) => ascii(text),
    now: () => NOW,
    ...overrides,
  };
  return { deps: value, store: built.fake, order: built.order, archive, storage, tiles };
}

const signal = { aborted: false, throwIfAborted: () => undefined };

describe('preparation of a base map', () => {
  it('writes the tiles in order, uploads the parts and the style, then signs the manifest', async () => {
    const { deps: d, store: s, archive, storage, order, tiles } = deps();
    await expect(buildBasemap(d, PACK, TENANT, signal)).resolves.toBe('built');

    expect(archive.added).toEqual([...archive.added].sort((a, b) => a - b));
    expect(archive.added[0]).toBe(zxyToTileId(0, 0, 0));
    expect(tiles.tile).toHaveBeenCalledTimes(archive.added.length);
    expect(archive.header()).toMatchObject({ minZoom: 0, maxZoom: 18 });
    // Each object is recorded before it is written (cleanup of an interrupted preparation).
    for (const [index, entry] of order.entries()) {
      if (entry.startsWith('upload ')) expect(order[index - 1]).toBe(`record ${entry.slice(7)}`);
    }
    const keys = storage.upload.mock.calls.map(([key]) => key);
    expect(keys[0]).toBe(`tenants/${TENANT}/basemaps/${PACK}/${BASEMAP_TILES_FILE}.000`);
    expect(keys).toContain(`tenants/${TENANT}/basemaps/${PACK}/style.json`);
    expect(keys).toContain(`tenants/${TENANT}/basemaps/${PACK}/sprite.json`);

    const result = s.complete.mock.calls[0]?.[2];
    expect(result).toBeDefined();
    if (!result) return;
    const manifest = basemapManifestSchema.parse(result.manifest);
    expect(manifest).toMatchObject({
      pack_id: PACK,
      sector_name: 'CIS Nice Centre',
      version: 3,
      source: { id: 'synthetic', synthetic: true },
      tile_count: archive.added.length,
      built_at: NOW.toISOString(),
      renew_after: '2027-04-05T10:00:00.000Z',
      coverage: { general_max_zoom: 14, detail_max_zoom: 18, detail_points: [[NICE[0], NICE[1]]] },
    });
    expect(manifest.files.map((file) => file.path)).toEqual([BASEMAP_TILES_FILE, 'style.json', 'sprite.json']);
    expect(manifest.total_bytes).toBe(manifest.files.reduce((sum, file) => sum + file.size_bytes, 0));
    const text = canonicalJson(manifest);
    expect(result.manifestHash).toBe(fakeHash(text));
    expect(result.signature.signature).toBe(fakeHash(`etare.basemap.v1\n${text}`));
    expect(result.files.length).toBe(storage.upload.mock.calls.length);
    expect(result.renewAfter.toISOString()).toBe('2027-04-05T10:00:00.000Z');
    expect(archive.disposed.count).toBe(1);
  });

  it('never calls a source whose offline rights are not approved', async () => {
    const tiles = source({ ...unverified });
    const { deps: d, store: s } = deps({ source: tiles });
    await expect(buildBasemap(d, PACK, TENANT, signal)).resolves.toBe('failed');
    expect(s.fail).toHaveBeenCalledWith(PACK, TENANT, 'SOURCE_UNAVAILABLE', expect.any(String));
    const sameId = source({ ...unverified, id: 'synthetic' });
    const second = deps({ source: sameId });
    await buildBasemap(second.deps, PACK, TENANT, signal);
    expect(second.store.fail).toHaveBeenCalledWith(
      PACK,
      TENANT,
      'BASEMAP_RIGHTS',
      expect.stringMatching(/fiche de droits/),
    );
    expect(sameId.tile).not.toHaveBeenCalled();
  });

  it('refuses an oversized or empty sector, without the signing key, visibly', async () => {
    const big = deps({ limits: { maxTiles: 10, maxBytes: 1_000_000 } });
    await buildBasemap(big.deps, PACK, TENANT, signal);
    expect(big.store.fail).toHaveBeenCalledWith(PACK, TENANT, 'TOO_MANY_TILES', expect.stringMatching(/Découpez/));

    const heavy = deps({ limits: { maxTiles: 10_000, maxBytes: 100 } });
    await buildBasemap(heavy.deps, PACK, TENANT, signal);
    expect(heavy.store.fail).toHaveBeenCalledWith(PACK, TENANT, 'TOO_LARGE', expect.any(String));
    expect(heavy.archive.disposed.count).toBe(1);

    const empty = deps({ store: store({ ...job, coverage: { extent: null, detail: [] } }).fake });
    await expect(buildBasemap(empty.deps, PACK, TENANT, signal)).resolves.toBe('failed');

    const unsigned = deps({ signer: null });
    await buildBasemap(unsigned.deps, PACK, TENANT, signal);
    expect(unsigned.store.fail).toHaveBeenCalledWith(PACK, TENANT, 'SIGNING_KEY_MISSING', expect.any(String));
  });

  it('lets a transient error of the source go up (job retried), the temporary files removed', async () => {
    const failing = source(approved, async (z) => {
      if (z === 12) throw new Error('network');
      return new Uint8Array([1]);
    });
    const { deps: d, store: s, archive } = deps({ source: failing });
    await expect(buildBasemap(d, PACK, TENANT, signal)).rejects.toThrow('network');
    expect(s.fail).not.toHaveBeenCalled();
    expect(s.complete).not.toHaveBeenCalled();
    expect(archive.disposed.count).toBe(1);
  });

  it('skips a preparation that is no longer to do, and leaves out empty tiles', async () => {
    const skipped = deps({ store: store(null).fake });
    await expect(buildBasemap(skipped.deps, PACK, TENANT, signal)).resolves.toBe('skipped');

    const sparse = deps({ source: source(approved, async (z) => (z > 10 ? null : new Uint8Array([1]))) });
    await buildBasemap(sparse.deps, PACK, TENANT, signal);
    expect(sparse.archive.added.length).toBeGreaterThan(0);
    expect(sparse.archive.added.every((id) => id < zxyToTileId(11, 0, 0))).toBe(true);
  });
});

describe('planning of the base maps', () => {
  it('plans only with approved rights, and removes the files of superseded preparations', async () => {
    const { fake } = store();
    const storage = objects();
    await expect(planBasemaps({ store: fake, objects: storage, source: unverified })).resolves.toEqual({
      planned: 0,
      removed: 1,
    });
    expect(fake.plan).not.toHaveBeenCalled();
    expect(storage.remove.mock.calls.map(([key]) => key)).toEqual(['a', 'b']);
    await expect(planBasemaps({ store: fake, objects: null, source: approved })).resolves.toEqual({
      planned: 2,
      removed: 0,
    });
    expect(fake.plan).toHaveBeenCalledWith('synthetic');
  });

  it('uses quarter-hour slots', () => {
    expect(basemapPlanningSlot(new Date('2026-10-05T10:14:59Z'))).toBe('2026-10-05T10:00');
    expect(basemapPlanningSlot(new Date('2026-10-05T10:15:00Z'))).toBe('2026-10-05T10:15');
  });
});

describe('administration of the base maps', () => {
  const context: RequestContext = {
    principal: { provider: 'supabase', subject: 'admin', email: null, assurance: 'aal2' },
    tenantId: TENANT,
    traceId: 'trace',
    origin: 'web',
  };

  function admin(roles: Role[] = ['SIS_ADMIN']) {
    const basemaps = {
      overview: vi.fn<BasemapRepository['overview']>(async () => []),
      requestBuild: vi.fn<BasemapRepository['requestBuild']>(async () => PACK),
    };
    const sessions: SessionFactory = {
      run: async <T>(ctx: RequestContext, work: (session: RequestSession) => Promise<T>) =>
        work(
          stubSession({ userId: 'u', tenantId: ctx.tenantId, permissions: permissionsForRoles(roles) }, { basemaps }),
        ),
    };
    return { sessions, basemaps };
  }

  it('shows the source, its rights and the budget of a tablet', async () => {
    const { sessions } = admin();
    const overview = await getBasemapOverview({ sessions, source: unverified }, context);
    expect(overview.source).toMatchObject({ id: 'ign-plan-vector', rights: 'unverified', usable: false });
    expect(overview.device_budget_bytes).toBe(2 * 1024 ** 3);
    expect((await getBasemapOverview({ sessions, source: null }, context)).source).toBeNull();
  });

  it('prepares on request only with approved rights', async () => {
    const { sessions, basemaps } = admin();
    await expect(requestBasemapBuild({ sessions, source: unverified }, context, SECTOR)).rejects.toBeInstanceOf(
      Conflict,
    );
    await expect(requestBasemapBuild({ sessions, source: null }, context, SECTOR)).rejects.toBeInstanceOf(
      ServiceUnavailable,
    );
    expect(basemaps.requestBuild).not.toHaveBeenCalled();
    await requestBasemapBuild({ sessions, source: approved }, context, SECTOR);
    expect(basemaps.requestBuild).toHaveBeenCalledWith(SECTOR, 'synthetic');
  });

  it('is reserved to the administration of the terminals', async () => {
    const { sessions } = admin(['OPS_USER']);
    await expect(getBasemapOverview({ sessions, source: approved }, context)).rejects.toBeInstanceOf(AccessDenied);
  });
});
