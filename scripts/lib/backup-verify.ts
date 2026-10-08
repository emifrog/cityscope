/**
 * Checks of a restored platform against its backup archive (EXP-02, ADR-031): rows per table, files,
 * and the content the terminals receive (manifest hashes, files by hash, signatures). Pure functions;
 * the database and the files are read by scripts/backup-verify.ts.
 */
import { SIGNATURE_CONTEXTS, canonicalJson, isKeyTrusted, signedText, type Keyset } from '@etare/domain';

/** What scripts/backup-verify.ts needs from manifeste.json (infra/backup/firescape-sauvegarde.sh). */
export interface ArchiveManifest {
  readonly format: 1;
  readonly nom: string;
  readonly migrations: readonly string[];
  readonly tables: Readonly<Record<string, number>>;
  readonly objets: { readonly nombre: number; readonly octets: number; readonly manquants: number };
}

export function parseManifest(text: string): ArchiveManifest {
  const value = JSON.parse(text) as Partial<ArchiveManifest>;
  if (value.format !== 1 || typeof value.nom !== 'string' || !Array.isArray(value.migrations)) {
    throw new Error('manifeste.json : format d’archive inconnu.');
  }
  if (typeof value.tables !== 'object' || value.tables === null || typeof value.objets !== 'object') {
    throw new Error('manifeste.json : tables ou objets absents.');
  }
  return value as ArchiveManifest;
}

export interface ArchivedObject {
  readonly bucket: string;
  readonly name: string;
  /** -1 when the storage did not record it. */
  readonly size: number;
  readonly mimeType: string;
}

/** base/objets.tsv: bucket, name, size, content type (storage.objects when the backup was made). */
export function parseObjectList(tsv: string): ArchivedObject[] {
  return tsv
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [bucket, name, size, mimeType] = line.split('\t');
      if (!bucket || !name || size === undefined || !mimeType) throw new Error(`objets.tsv : ligne invalide.`);
      return { bucket, name, size: Number(size), mimeType };
    });
}

/** objets.sha256: "<sha256>  objets/<bucket>/<name>", as written by sha256sum; keyed "bucket/name". */
export function parseObjectHashes(text: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const match = /^([0-9a-f]{64}) {2}objets\/(.+)$/.exec(line);
    if (!match?.[1] || !match[2]) throw new Error('objets.sha256 : ligne invalide.');
    hashes.set(match[2], match[1]);
  }
  return hashes;
}

/** A table of the manifest ("schema.table"), quoted for SQL; anything else is refused. */
export function quotedTable(name: string): string {
  const match = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/.exec(name);
  if (!match) throw new Error(`table inattendue dans le manifeste : ${name.slice(0, 80)}`);
  return `"${match[1]}"."${match[2]}"`;
}

/** Tables whose restored rows differ from the archive. */
export function countMismatches(
  expected: Readonly<Record<string, number>>,
  actual: Readonly<Record<string, number>>,
): string[] {
  return Object.entries(expected)
    .filter(([table, rows]) => actual[table] !== rows)
    .map(([table, rows]) => `${table} : ${actual[table] ?? 'absente'} ligne(s) au lieu de ${rows}`);
}

export interface StoredSignature {
  readonly algorithm?: string;
  readonly key_id: string;
  readonly signature: string;
}

export type Verify = (publicKey: string, text: string, signature: string) => boolean;

/**
 * Whether the terminals would accept the content: one signature at least by a key of the key set they
 * trust for this purpose. Without key set nothing is checked ('unchecked'); without any signature the
 * content is never distributed ('unsigned').
 */
export function signatureStatus(
  text: string,
  signatures: readonly StoredSignature[],
  keyset: Keyset | null,
  verify: Verify,
): 'valid' | 'invalid' | 'unsigned' | 'unchecked' {
  if (signatures.length === 0) return 'unsigned';
  if (!keyset) return 'unchecked';
  const valid = signatures.some((signature) => {
    const key = keyset.keys.find(
      (candidate) => candidate.purpose === 'publication' && candidate.key_id === signature.key_id,
    );
    return (
      !!key && isKeyTrusted(keyset, 'publication', key.key_id) && verify(key.public_key, text, signature.signature)
    );
  });
  return valid ? 'valid' : 'invalid';
}

export interface AssetToCheck {
  readonly tenantId: string;
  readonly storageKey: string;
  readonly sha256: string;
  readonly thumbnailKey: string | null;
}

/**
 * Verified assets of the SIS against the archive: those whose file is archived with the content their
 * hash announces (by SIS and hash), and the anomalies. An anomaly is never a loss of the restoration (the
 * archive and the restored storage are compared byte for byte): the file was already absent or different
 * in the source, or disappeared while the backup was copying it.
 */
export function assetFindings(
  assets: readonly AssetToCheck[],
  listedAtBackup: ReadonlySet<string>,
  archived: ReadonlyMap<string, string>,
): { verified: Map<string, string>; conforming: number; findings: string[] } {
  const verified = new Map<string, string>();
  const findings: string[] = [];
  let conforming = 0;
  for (const asset of assets) {
    const hash = archived.get(asset.storageKey);
    if (hash === asset.sha256) {
      conforming += 1;
      verified.set(`${asset.tenantId}:${asset.sha256}`, asset.storageKey);
    } else if (hash) {
      findings.push(`fichier ${asset.storageKey} : contenu différent de son empreinte`);
    } else {
      findings.push(
        `fichier ${asset.storageKey} : ${listedAtBackup.has(asset.storageKey) ? 'disparu pendant la sauvegarde' : 'absent du stockage à la sauvegarde'}`,
      );
    }
    if (asset.thumbnailKey && !archived.has(asset.thumbnailKey)) {
      findings.push(`miniature ${asset.thumbnailKey} : absente`);
    }
  }
  return { verified, conforming, findings };
}

/** Anomalies found after the restoration but not in the source (added), and the reverse (removed). */
export function findingsDifference(
  reference: readonly string[],
  actual: readonly string[],
): { added: string[]; removed: string[] } {
  const before = new Set(reference);
  const after = new Set(actual);
  return {
    added: actual.filter((finding) => !before.has(finding)),
    removed: reference.filter((finding) => !after.has(finding)),
  };
}

/** Files of the restored platform: verified assets and archived objects. */
export interface FileIndex {
  /** Storage key of a clean asset of the SIS with this content. */
  assetKey(tenantId: string, sha256: string): string | undefined;
  /** SHA-256 of the archived object at this storage key, whatever its bucket. */
  objectHash(storageKey: string): string | undefined;
}

export interface PublicationToCheck {
  readonly id: string;
  readonly tenantId: string;
  readonly manifest: unknown;
  readonly manifestHash: string;
  readonly payload: unknown;
  readonly pdfStorageKey: string | null;
  /** The signature made at build time, then the re-signatures. */
  readonly signatures: readonly StoredSignature[];
}

interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
}

const manifestFiles = (manifest: unknown): ManifestFile[] => {
  const files = (manifest as { files?: unknown } | null)?.files;
  return Array.isArray(files)
    ? files.filter(
        (file): file is ManifestFile =>
          typeof file === 'object' &&
          file !== null &&
          typeof (file as ManifestFile).path === 'string' &&
          typeof (file as ManifestFile).sha256 === 'string',
      )
    : [];
};

/**
 * What a terminal would refuse in a restored publication: a manifest that no longer matches its hash,
 * a data file that no longer matches the manifest, a file listed by the manifest that cannot be found
 * with its content (asset of the SIS, or the generated PDF).
 */
export function publicationProblems(
  publication: PublicationToCheck,
  sha256: (text: string) => string,
  files: FileIndex,
): string[] {
  const problems: string[] = [];
  const label = `publication ${publication.id}`;
  if (sha256(canonicalJson(publication.manifest)) !== publication.manifestHash) {
    return [`${label} : manifeste différent de son empreinte`];
  }
  const dataFile = (publication.manifest as { data_file?: unknown }).data_file;
  for (const file of manifestFiles(publication.manifest)) {
    if (file.path === dataFile) {
      if (sha256(canonicalJson(publication.payload)) !== file.sha256) problems.push(`${label} : données différentes`);
      continue;
    }
    const key =
      files.assetKey(publication.tenantId, file.sha256) ??
      (file.path === 'etare.pdf' ? (publication.pdfStorageKey ?? undefined) : undefined);
    const stored = key ? files.objectHash(key) : undefined;
    if (stored !== file.sha256) problems.push(`${label} : fichier ${file.path} ${stored ? 'altéré' : 'absent'}`);
  }
  return problems;
}

export interface BasemapToCheck {
  readonly id: string;
  readonly manifest: unknown;
  readonly manifestHash: string;
  /** Every part of every file: [{ sha256, size_bytes, storage_key }]. */
  readonly files: unknown;
}

/** Base map in force: manifest matching its hash, every part present with its content. */
export function basemapProblems(basemap: BasemapToCheck, sha256: (text: string) => string, files: FileIndex): string[] {
  const label = `fond de carte ${basemap.id}`;
  if (sha256(canonicalJson(basemap.manifest)) !== basemap.manifestHash) {
    return [`${label} : manifeste différent de son empreinte`];
  }
  const parts = Array.isArray(basemap.files) ? (basemap.files as { sha256?: unknown; storage_key?: unknown }[]) : [];
  return parts
    .filter((part) => typeof part.storage_key !== 'string' || files.objectHash(part.storage_key) !== part.sha256)
    .map((part) => `${label} : partie ${String(part.storage_key).split('/').pop()} absente ou altérée`);
}

/** Text a manifest signature covers, by kind of content. */
export const signedManifest = (kind: 'publication' | 'basemap', manifest: unknown): string =>
  signedText(
    kind === 'publication' ? SIGNATURE_CONTEXTS.manifest : SIGNATURE_CONTEXTS.basemap,
    canonicalJson(manifest),
  );
