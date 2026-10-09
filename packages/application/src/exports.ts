import type { AssetDownload, ExportPart, ExportRun } from '@etare/contracts';
import { ServiceUnavailable, type RequestContext } from '@etare/domain';
import type { ObjectStorage, ObjectStoreAdmin, SessionFactory } from './ports';
import { found, inTenant } from './use-cases';

/**
 * Reversibility export of a SIS (ADMIN-04, ADR-033). The administration asks for it (second
 * factor); the worker builds it: every table of the SIS as JSON (and CSV for the referentials),
 * every verified file and publication PDF, a manifest with the hash of each file; the parts are
 * ZIP archives of at most EXPORT_PART_BYTES (the object storage caps objects at 50 MiB), a bigger
 * file is copied as a part of its own. Downloads go through short-lived signed URLs, audited.
 */
export const EXPORT_BUILD_JOB = 'export.build';
export const EXPORT_PART_BYTES = 32 * 1024 * 1024;
export const EXPORT_URL_SECONDS = 60;
const PAGE = 1000;

/** Tables exported, in the order of the archive (the database holds the same list and the secrets left out). */
export const EXPORT_TABLES = [
  'tenant',
  'membership',
  'role',
  'role_binding',
  'address',
  'site',
  'building',
  'level',
  'asset',
  'plan',
  'plan_revision',
  'zone',
  'object_type',
  'risk_type',
  'operational_object',
  'risk_occurrence',
  'hazardous_substance',
  'document',
  'document_version',
  'object_photo',
  'etare',
  'etare_revision',
  'etare_revision_contributor',
  'approval',
  'publication',
  'publication_signature',
  'site_classification',
  'contact',
  'external_identifier',
  'site_edit',
  'sector',
  'sector_commune',
  'sector_site',
  'device',
  'device_sector',
  'device_sync_state',
  'device_publication',
  'device_basemap',
  'device_sync_event',
  'basemap_pack',
  'basemap_pack_signature',
  'distribution_generation',
  'field_report',
  'field_report_photo',
  'portal_invitation',
  'portal_invitation_site',
  'contribution',
  'contribution_message',
  'contribution_attachment',
  'notification',
  'sensitive_habilitation',
  'access_event',
  'audit_event',
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

/** Referentials also given as CSV (semicolon, UTF-8 with BOM: opens as is in French spreadsheets). */
export const EXPORT_CSV_TABLES: readonly ExportTable[] = [
  'site',
  'address',
  'building',
  'level',
  'zone',
  'operational_object',
  'risk_occurrence',
  'hazardous_substance',
  'contact',
  'document',
  'membership',
  'device',
  'sector',
];

// ------------------------------------------------------------------ API side

/** Where a part is stored, for the download of the administration (audited by the database). */
export interface ExportPartLocation {
  readonly storageKey: string;
  readonly filename: string;
  readonly mediaType: string;
}

export interface ExportRepository {
  list(): Promise<ExportRun[]>;
  request(): Promise<ExportRun>;
  /** Null when the export or the part does not exist in the SIS. */
  part(exportId: string, index: number): Promise<ExportPartLocation | null>;
}

export interface ExportDependencies {
  readonly sessions: SessionFactory;
  readonly storage: ObjectStorage | null;
}

export function listExports(sessions: SessionFactory, context: RequestContext): Promise<ExportRun[]> {
  return inTenant(sessions, context, 'export:manage', (session) => session.exports.list());
}

export function requestExport(sessions: SessionFactory, context: RequestContext): Promise<ExportRun> {
  return inTenant(sessions, context, 'export:manage', (session) => session.exports.request());
}

export async function downloadExportPart(
  deps: ExportDependencies,
  context: RequestContext,
  exportId: string,
  index: number,
): Promise<AssetDownload> {
  if (!deps.storage) throw new ServiceUnavailable('Le stockage des fichiers n’est pas configuré.');
  const storage = deps.storage;
  const part = await inTenant(deps.sessions, context, 'export:manage', async (session) =>
    found(await session.exports.part(exportId, index), 'Export ou partie introuvable.'),
  );
  const { url, expiresAt } = await storage.createDownloadUrl(part.storageKey, EXPORT_URL_SECONDS);
  return { url, expires_at: expiresAt.toISOString(), filename: part.filename, mime_type: part.mediaType };
}

// ------------------------------------------------------------------ worker side

export interface ExportJob {
  readonly exportId: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly requestedAt: string;
  readonly requestedBy: string;
}

export interface ExportFile {
  readonly kind: 'asset' | 'publication';
  readonly storageKey: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly sizeBytes: number | null;
  readonly sha256: string | null;
}

/** A part as the database keeps it: with the key of its object, never shown to the administration. */
export type StoredExportPart = ExportPart & { readonly storage_key: string };

export interface ExportBuildResult {
  readonly parts: readonly StoredExportPart[];
  readonly totalBytes: number;
  readonly fileCount: number;
  readonly rowCount: number;
}

export interface ExportLease {
  readonly jobId: string;
  readonly attempt: number;
}

/** Worker-side access, fenced by the running job (dedicated database functions). */
export interface ExportBuildStore {
  /** Null when the job no longer carries the export (fence) or the export is over. */
  start(exportId: string, tenantId: string, lease: ExportLease): Promise<ExportJob | null>;
  rows(
    exportId: string,
    tenantId: string,
    table: ExportTable,
    offset: number,
    limit: number,
  ): Promise<Record<string, unknown>[]>;
  files(exportId: string, tenantId: string): Promise<ExportFile[]>;
  /** Records the key before the object is written; false when the export is no longer building. */
  recordObject(exportId: string, tenantId: string, key: string): Promise<boolean>;
  complete(exportId: string, tenantId: string, result: ExportBuildResult): Promise<boolean>;
  fail(exportId: string, tenantId: string, code: string, detail: string): Promise<boolean>;
}

/** A ZIP archive built in memory, one part of the export. */
export interface ArchiveBuilder {
  add(path: string, content: Uint8Array, options?: { compress?: boolean }): void;
  /** Bytes added so far (before compression): the measure used to close a part. */
  readonly bytes: number;
  readonly entries: number;
  build(): Uint8Array;
}

export interface ExportBuildDependencies {
  readonly store: ExportBuildStore;
  readonly objects: Pick<ObjectStoreAdmin, 'download' | 'copy' | 'upload'>;
  readonly archives: () => ArchiveBuilder;
  readonly sha256: (content: Uint8Array) => Promise<string>;
  readonly now: () => Date;
  readonly utf8: (text: string) => Uint8Array;
  /** Size of a part, for tests. */
  readonly partBytes?: number;
}

export type ExportBuildOutcome = 'built' | 'skipped' | 'failed';

export const exportKey = (tenantId: string, exportId: string, name: string) =>
  `tenants/${tenantId}/exports/${exportId}/${name}`;

/** Byte order mark: French spreadsheets then read the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** Media already compressed: stored as is in the archives. */
const STORED_AS_IS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/zip']);

/** A safe file name: ASCII letters, digits, dot, dash and underscore; never empty, never a path. */
export function safeFilename(name: string, fallback = 'fichier'): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 120);
  return cleaned || fallback;
}

/**
 * CSV of rows (RFC 4180 quoting, semicolon separator, CRLF, UTF-8 with BOM): the columns are those
 * of the rows in the order of their first appearance; nested values are written as JSON.
 */
export function csvOf(rows: readonly Record<string, unknown>[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map(cell).join(';'),
    ...rows.map((row) => columns.map((column) => cell(row[column])).join(';')),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

interface PackedFile {
  readonly kind: ExportFile['kind'];
  readonly storage_key: string;
  readonly filename: string;
  readonly media_type: string;
  readonly size_bytes: number;
  readonly sha256: string;
  /** Where the content is: a path in a ZIP part, or a part of its own. */
  readonly part: string;
  readonly path: string | null;
  /** The content differs from the hash the database holds: said, never hidden. */
  readonly hash_mismatch?: true;
}

/**
 * Builds the export: files first (ZIP parts, or a copy for a file too big), then the data part
 * with the manifest naming every part and every file with its hash. Each object is recorded
 * before it is written, so an interrupted build is purged like a finished one. Returns
 * 'skipped' when the job no longer carries the export, 'failed' after a definitive error (recorded
 * on the export), and throws on a transient storage error, which the queue retries.
 */
export async function buildExport(
  deps: ExportBuildDependencies,
  exportId: string,
  tenantId: string,
  lease: ExportLease,
  signal?: { readonly aborted: boolean },
): Promise<ExportBuildOutcome> {
  const job = await deps.store.start(exportId, tenantId, lease);
  if (!job) return 'skipped';
  const partBytes = deps.partBytes ?? EXPORT_PART_BYTES;
  const utf8 = deps.utf8;
  const parts: StoredExportPart[] = [];
  const written = (name: string) => exportKey(tenantId, exportId, name);
  const checkAbort = () => {
    if (signal?.aborted) throw new Error('EXPORT_ABORTED');
  };
  const upload = async (filename: string, bytes: Uint8Array, mediaType: string, kind: ExportPart['kind']) => {
    checkAbort();
    const key = written(filename);
    if (!(await deps.store.recordObject(exportId, tenantId, key))) throw new Error('EXPORT_NOT_BUILDING');
    await deps.objects.upload(key, bytes, mediaType, { upsert: true });
    parts.push({
      index: parts.length,
      kind,
      filename,
      storage_key: key,
      media_type: mediaType,
      size_bytes: bytes.byteLength,
      sha256: await deps.sha256(bytes),
    });
    return key;
  };

  try {
    // 1. Files: verified assets and publication PDFs, packed by parts.
    const files = await deps.store.files(exportId, tenantId);
    const packed: PackedFile[] = [];
    const missing: { storage_key: string; filename: string }[] = [];
    let archive = deps.archives();
    let archiveNumber = 0;
    // Entries of the archive being filled: named after it once it is written.
    let pending: number[] = [];
    const flush = async () => {
      if (archive.entries === 0) return;
      archiveNumber += 1;
      const filename = `fichiers-${String(archiveNumber).padStart(3, '0')}.zip`;
      for (const i of pending) packed[i] = { ...(packed[i] as PackedFile), part: filename };
      pending = [];
      await upload(filename, archive.build(), 'application/zip', 'files');
      archive = deps.archives();
    };
    for (const file of files) {
      checkAbort();
      const bytes = await deps.objects.download(file.storageKey);
      if (!bytes) {
        missing.push({ storage_key: file.storageKey, filename: file.filename });
        continue;
      }
      const sha256 = await deps.sha256(bytes);
      const mismatch = file.sha256 !== null && file.sha256 !== sha256;
      const basename = safeFilename(file.filename);
      const folder = file.kind === 'asset' ? 'fichiers' : 'publications';
      const id = file.storageKey.split('/').slice(-2).join('-');
      if (bytes.byteLength > partBytes) {
        // Too big for a ZIP part: the object is copied as a part of its own, as it is.
        checkAbort();
        const filename = `${folder}-${safeFilename(id)}-${basename}`;
        const key = written(filename);
        if (!(await deps.store.recordObject(exportId, tenantId, key))) throw new Error('EXPORT_NOT_BUILDING');
        await deps.objects.copy(file.storageKey, key);
        parts.push({
          index: parts.length,
          kind: 'file',
          filename,
          storage_key: key,
          media_type: file.mediaType,
          size_bytes: bytes.byteLength,
          sha256,
        });
        packed.push({
          kind: file.kind,
          storage_key: file.storageKey,
          filename: file.filename,
          media_type: file.mediaType,
          size_bytes: bytes.byteLength,
          sha256,
          part: filename,
          path: null,
          ...(mismatch ? { hash_mismatch: true as const } : {}),
        });
        continue;
      }
      if (archive.entries > 0 && archive.bytes + bytes.byteLength > partBytes) await flush();
      const path = `${folder}/${safeFilename(id)}/${basename}`;
      archive.add(path, bytes, { compress: !STORED_AS_IS.has(file.mediaType) });
      pending.push(packed.length);
      packed.push({
        kind: file.kind,
        storage_key: file.storageKey,
        filename: file.filename,
        media_type: file.mediaType,
        size_bytes: bytes.byteLength,
        sha256,
        part: '',
        path,
        ...(mismatch ? { hash_mismatch: true as const } : {}),
      });
    }
    await flush();

    // 2. Data: every table as JSON, the referentials as CSV too.
    const data = deps.archives();
    const tables: Record<string, number> = {};
    let rowCount = 0;
    for (const table of EXPORT_TABLES) {
      const rows: Record<string, unknown>[] = [];
      for (let offset = 0; ; offset += PAGE) {
        checkAbort();
        const page = await deps.store.rows(exportId, tenantId, table, offset, PAGE);
        rows.push(...page);
        if (page.length < PAGE) break;
      }
      tables[table] = rows.length;
      rowCount += rows.length;
      data.add(`donnees/${table}.json`, utf8(JSON.stringify(rows, null, 1)), { compress: true });
      if (EXPORT_CSV_TABLES.includes(table)) data.add(`donnees/${table}.csv`, utf8(csvOf(rows)), { compress: true });
    }
    const manifest = {
      format: 1,
      export_id: exportId,
      sis: { id: tenantId, slug: job.tenantSlug, name: job.tenantName },
      requested_at: job.requestedAt,
      requested_by: job.requestedBy,
      generated_at: deps.now().toISOString(),
      tables,
      files: packed,
      missing_files: missing,
      parts: parts.map(({ storage_key: _key, ...part }) => ({ ...part, index: part.index + 1 })),
    };
    data.add('manifeste.json', utf8(JSON.stringify(manifest, null, 1)), { compress: true });
    data.add('LISEZMOI.md', utf8(readme(job, tables, packed.length, missing.length)), { compress: true });
    await upload('donnees.zip', data.build(), 'application/zip', 'data');

    // The data part first, then the files in the order they were written.
    const ordered = [parts[parts.length - 1] as StoredExportPart, ...parts.slice(0, -1)].map((part, index) => ({
      ...part,
      index,
    }));
    const result: ExportBuildResult = {
      parts: ordered,
      totalBytes: ordered.reduce((sum, part) => sum + part.size_bytes, 0),
      fileCount: packed.length,
      rowCount,
    };
    return (await deps.store.complete(exportId, tenantId, result)) ? 'built' : 'skipped';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Transient storage trouble or a lost lease: the queue retries; anything else is definitive.
    if (message.includes('STORAGE_UNAVAILABLE') || message === 'EXPORT_ABORTED') throw error;
    if (message === 'EXPORT_NOT_BUILDING') return 'skipped';
    await deps.store.fail(exportId, tenantId, codeOf(message), message.slice(0, 500));
    return 'failed';
  }
}

const codeOf = (message: string) => {
  const code = message
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return code || 'EXPORT_FAILED';
};

function readme(job: ExportJob, tables: Record<string, number>, files: number, missing: number): string {
  const rows = Object.entries(tables)
    .map(([table, count]) => `- \`${table}\` : ${count} ligne${count > 1 ? 's' : ''}`)
    .join('\n');
  return `# Export de réversibilité — ${job.tenantName}

Demandé par ${job.requestedBy} le ${job.requestedAt}. Format 1 (FireScape, ADR-033).

## Contenu

- \`donnees/<table>.json\` : chaque table du SIS, une ligne par enregistrement, telle qu'en base
  (identifiants, dates ISO 8601, géométries en GeoJSON, contenus JSON). Les tables de référence
  nationales (\`role\`, \`object_type\`, \`risk_type\`) comprennent les entrées nationales utilisées.
- \`donnees/<table>.csv\` : les référentiels en tableur (séparateur « ; », UTF-8 avec BOM).
- \`manifeste.json\` : les tables et leur nombre de lignes, chaque fichier avec son empreinte SHA-256,
  l'archive ou la partie qui le contient, et la liste des parties de l'export.
- Parties \`fichiers-NNN.zip\` : documents, plans, photos (\`fichiers/<fichier>/<nom>\`) et PDF des
  versions publiées (\`publications/<nom>\`). Un fichier trop volumineux pour une archive est une
  partie à lui seul.
- Les secrets de la plateforme (empreintes des codes d'enrôlement, jetons) ne sont pas exportés.

## Tables

${rows}

Fichiers exportés : ${files}. Fichiers référencés mais absents du stockage : ${missing}.

## Vérification

Pour chaque fichier, l'empreinte SHA-256 de \`manifeste.json\` doit correspondre au contenu extrait.
Les publications portent en plus leur propre empreinte (\`manifest_hash\`) et leur signature.
`;
}
