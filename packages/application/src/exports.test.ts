import { describe, expect, it, vi } from 'vitest';
import {
  EXPORT_TABLES,
  buildExport,
  csvOf,
  safeFilename,
  type ArchiveBuilder,
  type ExportBuildStore,
  type ExportFile,
} from './exports';

const TENANT = '06000000-0000-4000-8000-000000000000';
const EXPORT = '0600000d-0000-4000-8000-000000000001';
const LEASE = { jobId: 'job-1', attempt: 1 };
// No node or DOM library here: a deterministic fake hash, and UTF-16 code units as bytes.
const sha256 = async (content: Uint8Array) => {
  let hash = 0x811c9dc5;
  for (const byte of content) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0').repeat(8);
};
const utf8 = (text: string) => {
  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    bytes[index * 2] = unit >> 8;
    bytes[index * 2 + 1] = unit & 0xff;
  }
  return bytes;
};
const bytesOf = (size: number, fill = 7) => new Uint8Array(size).fill(fill);

/** An archive that remembers its entries: the test reads them back instead of unzipping. */
class FakeArchive implements ArchiveBuilder {
  static built: { paths: string[]; content: Map<string, Uint8Array> }[] = [];
  readonly content = new Map<string, Uint8Array>();
  bytes = 0;
  add(path: string, content: Uint8Array): void {
    this.content.set(path, content);
    this.bytes += content.byteLength;
  }
  get entries(): number {
    return this.content.size;
  }
  build(): Uint8Array {
    FakeArchive.built.push({ paths: [...this.content.keys()], content: this.content });
    return utf8(`zip:${[...this.content.keys()].join(',')}`);
  }
}

const file = (key: string, filename: string, mediaType: string, size: number, kind: ExportFile['kind'] = 'asset') => ({
  kind,
  storageKey: key,
  filename,
  mediaType,
  sizeBytes: size,
  sha256: null,
});

function harness(options: { files?: ExportFile[]; started?: boolean; missing?: string[] } = {}) {
  FakeArchive.built = [];
  const objectsWritten = new Map<string, Uint8Array>();
  const recorded: string[] = [];
  const store: ExportBuildStore = {
    start: vi.fn(async () =>
      options.started === false
        ? null
        : {
            exportId: EXPORT,
            tenantId: TENANT,
            tenantSlug: 'sdis-demo-06',
            tenantName: 'SDIS DEMO 06',
            requestedAt: '2026-10-09T10:00:00Z',
            requestedBy: 'Admin',
          },
    ),
    rows: vi.fn(async (_e, _t, table: string, offset: number) =>
      table === 'site' && offset === 0
        ? [
            { id: 's1', name: 'EHPAD; Les Oliviers', geom: { type: 'Point', coordinates: [7.25, 43.7] } },
            { id: 's2', name: 'Lycée "Nord"', etare_number: '06-0001', geom: null },
          ]
        : [],
    ),
    files: vi.fn(async () => options.files ?? []),
    recordObject: vi.fn(async (_e, _t, key: string) => {
      recorded.push(key);
      return true;
    }),
    complete: vi.fn(async () => true),
    fail: vi.fn(async () => true),
  };
  const sizes = new Map((options.files ?? []).map((item) => [item.storageKey, item.sizeBytes ?? 0]));
  const objects = {
    download: vi.fn(async (key: string) =>
      options.missing?.includes(key) ? null : bytesOf(sizes.get(key) ?? 0, key.length % 250),
    ),
    copy: vi.fn(async (_from: string, to: string) => {
      objectsWritten.set(to, utf8('copy'));
    }),
    upload: vi.fn(async (key: string, content: Uint8Array) => {
      objectsWritten.set(key, content);
    }),
  };
  const deps = {
    store,
    objects,
    archives: () => new FakeArchive(),
    sha256,
    now: () => new Date('2026-10-09T10:05:00Z'),
    utf8,
    partBytes: 1000,
  };
  return { deps, store, objects, objectsWritten, recorded };
}

const decode = (bytes: Uint8Array) => {
  let text = '';
  for (let index = 0; index < bytes.length; index += 2) {
    text += String.fromCharCode(((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0));
  }
  return text;
};

describe('reversibility export (ADMIN-04)', () => {
  it('writes every table as JSON (CSV for the referentials), then the manifest and the readme', async () => {
    const { deps, store, objectsWritten } = harness();
    await expect(buildExport(deps, EXPORT, TENANT, LEASE)).resolves.toBe('built');
    const data = FakeArchive.built[0];
    expect(data?.paths).toEqual(
      expect.arrayContaining([
        'donnees/site.json',
        'donnees/site.csv',
        'donnees/audit_event.json',
        'manifeste.json',
        'LISEZMOI.md',
      ]),
    );
    expect(data?.paths.filter((path) => path.endsWith('.json')).length).toBe(EXPORT_TABLES.length + 1);
    const manifest = JSON.parse(decode(data?.content.get('manifeste.json') ?? new Uint8Array())) as {
      tables: Record<string, number>;
      sis: { slug: string };
      parts: unknown[];
    };
    expect(manifest.sis.slug).toBe('sdis-demo-06');
    expect(manifest.tables['site']).toBe(2);
    expect(manifest.tables['tenant']).toBe(0);
    expect(decode(data?.content.get('donnees/site.csv') ?? new Uint8Array())).toBe(
      '﻿id;name;geom;etare_number\r\n' +
        's1;"EHPAD; Les Oliviers";"{""type"":""Point"",""coordinates"":[7.25,43.7]}";\r\n' +
        's2;"Lycée ""Nord""";;06-0001\r\n',
    );
    // One part, the data, written under the export prefix after being recorded.
    expect([...objectsWritten.keys()]).toEqual([`tenants/${TENANT}/exports/${EXPORT}/donnees.zip`]);
    expect(store.complete).toHaveBeenCalledWith(
      EXPORT,
      TENANT,
      expect.objectContaining({
        fileCount: 0,
        rowCount: 2,
        parts: [expect.objectContaining({ index: 0, kind: 'data' })],
      }),
    );
  });

  it('packs the files by parts, copies a file too big, lists the missing ones, data part first', async () => {
    const asset = (n: number, size: number) =>
      file(`tenants/${TENANT}/assets/a${n}/v${n}`, `plan ${n}.png`, 'image/png', size);
    const { deps, store, objects, recorded } = harness({
      files: [
        asset(1, 600),
        asset(2, 600),
        asset(3, 100),
        asset(4, 5000),
        file(
          `tenants/${TENANT}/publications/p1/etare-abc.pdf`,
          'ETARE-06-0428-v2.pdf',
          'application/pdf',
          300,
          'publication',
        ),
        asset(5, 10),
      ],
      missing: [`tenants/${TENANT}/assets/a5/v5`],
    });
    await expect(buildExport(deps, EXPORT, TENANT, LEASE)).resolves.toBe('built');
    // Parts: 600 alone (600+600 > 1000); then 600+100, which the PDF (300) still fits after the big
    // one (5000) was copied as a part of its own.
    const result = vi.mocked(store.complete).mock.calls[0]?.[2];
    expect(result?.parts.map((part) => [part.index, part.kind, part.filename])).toEqual([
      [0, 'data', 'donnees.zip'],
      [1, 'files', 'fichiers-001.zip'],
      [2, 'file', 'fichiers-a4-v4-plan_4.png'],
      [3, 'files', 'fichiers-002.zip'],
    ]);
    expect(result?.fileCount).toBe(5);
    expect(objects.copy).toHaveBeenCalledWith(
      `tenants/${TENANT}/assets/a4/v4`,
      `tenants/${TENANT}/exports/${EXPORT}/fichiers-a4-v4-plan_4.png`,
    );
    // Every object is recorded before it is written.
    expect(recorded).toHaveLength(4);
    const data = FakeArchive.built.at(-1);
    const manifest = JSON.parse(decode(data?.content.get('manifeste.json') ?? new Uint8Array())) as {
      files: { path: string | null; part: string; filename: string }[];
      missing_files: { filename: string }[];
    };
    expect(manifest.files.map((item) => item.part)).toEqual([
      'fichiers-001.zip',
      'fichiers-002.zip',
      'fichiers-002.zip',
      'fichiers-a4-v4-plan_4.png',
      'fichiers-002.zip',
    ]);
    expect(manifest.files[4]?.path).toBe('publications/p1-etare-abc.pdf/ETARE-06-0428-v2.pdf');
    expect(manifest.missing_files).toEqual([{ filename: 'plan 5.png' }].map((item) => expect.objectContaining(item)));
  });

  it('skips when the job no longer carries the export, fails definitively, retries on storage trouble', async () => {
    const idle = harness({ started: false });
    await expect(buildExport(idle.deps, EXPORT, TENANT, LEASE)).resolves.toBe('skipped');
    expect(idle.store.complete).not.toHaveBeenCalled();

    const broken = harness();
    vi.mocked(broken.store.rows).mockRejectedValueOnce(new Error('EXPORT_TABLE_UNKNOWN: site'));
    await expect(buildExport(broken.deps, EXPORT, TENANT, LEASE)).resolves.toBe('failed');
    expect(broken.store.fail).toHaveBeenCalledWith(EXPORT, TENANT, 'EXPORT_TABLE_UNKNOWN_SITE', expect.any(String));

    const transient = harness();
    transient.objects.upload.mockRejectedValueOnce(new Error('STORAGE_UNAVAILABLE'));
    await expect(buildExport(transient.deps, EXPORT, TENANT, LEASE)).rejects.toThrow('STORAGE_UNAVAILABLE');
    expect(transient.store.fail).not.toHaveBeenCalled();

    const fenced = harness();
    vi.mocked(fenced.store.recordObject).mockResolvedValueOnce(false);
    await expect(buildExport(fenced.deps, EXPORT, TENANT, LEASE)).resolves.toBe('skipped');
  });

  it('keeps file names safe and CSV cells quoted', () => {
    expect(safeFilename('Plan RDC — bâtiment A.pdf')).toBe('Plan_RDC_batiment_A.pdf');
    expect(safeFilename('../../etc/passwd')).toBe('etc_passwd');
    expect(safeFilename('   ')).toBe('fichier');
    expect(csvOf([])).toBe('﻿\r\n');
  });
});
