import { etareSnapshotSchema, type EtareSnapshot } from '@etare/contracts';
import { canonicalJson } from '@etare/domain';
import { PermanentJobError } from './jobs';

export const PUBLICATION_BUILD_JOB = 'publication.build';
export const MANIFEST_VERSION = 1;
export const PUBLICATION_SCHEMA_VERSION = 1;
export const MIN_READER_VERSION = '1.0.0';
export const DATA_FILE = 'data/site.json';

export interface PersonStamp {
  readonly id: string | null;
  readonly name: string;
}

/** What the worker reads to build a publication: the frozen revision, never the working tables. */
export interface PublicationToBuild {
  readonly id: string;
  readonly tenantId: string;
  readonly siteId: string;
  readonly publicationNumber: number;
  readonly revisionId: string;
  readonly revisionNo: number;
  readonly contentHash: string;
  readonly snapshot: unknown;
  readonly requestedBy: PersonStamp;
  readonly submittedBy: PersonStamp;
  readonly submittedAt: Date;
  readonly approvedBy: PersonStamp;
  readonly approvedAt: Date;
}

export interface BuiltPublication {
  readonly payload: Record<string, unknown>;
  readonly manifest: Record<string, unknown>;
  readonly manifestHash: string;
  readonly templateVersion: string | null;
}

export interface PublicationBuildStore {
  /** queued -> building; null when the publication is unknown, of another SIS or already built. */
  start(publicationId: string, tenantId: string): Promise<PublicationToBuild | null>;
  /** building -> ready -> published (or superseded when a newer one exists). */
  complete(publicationId: string, built: BuiltPublication): Promise<'published' | 'superseded' | null>;
  fail(publicationId: string, failureCode: string): Promise<boolean>;
}

export interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly size_bytes: number;
  readonly media_type: string;
  readonly required: boolean;
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const extension = (mimeType: string) => EXTENSIONS[mimeType] ?? 'bin';

/**
 * Files of the publication, by hash: the data file, the plan backgrounds and
 * the documents meant for offline use ("always" required, "on demand"
 * optional). Paths are relative, without traversal (architecture §10).
 */
export function publicationFiles(snapshot: EtareSnapshot, data: { sha256: string; sizeBytes: number }): ManifestFile[] {
  return [
    {
      path: DATA_FILE,
      sha256: data.sha256,
      size_bytes: data.sizeBytes,
      media_type: 'application/json',
      required: true,
    },
    ...snapshot.plans.map((plan) => ({
      path: `plans/${plan.background.revision_id}.${extension(plan.background.asset.mime_type)}`,
      sha256: plan.background.asset.sha256,
      size_bytes: plan.background.asset.size_bytes,
      media_type: plan.background.asset.mime_type,
      required: true,
    })),
    ...snapshot.documents
      .filter((document) => document.offline_policy !== 'never')
      .map((document) => ({
        path: `documents/${document.version.id}.${extension(document.version.asset.mime_type)}`,
        sha256: document.version.asset.sha256,
        size_bytes: document.version.asset.size_bytes,
        media_type: document.version.asset.mime_type,
        required: document.offline_policy === 'always',
      })),
  ];
}

/** Runtime tools: SHA-256 (hex) and size of the UTF-8 bytes of a text, clock. */
export interface BuildTools {
  readonly sha256: (text: string) => Promise<string>;
  readonly byteLength: (text: string) => number;
  readonly now: () => Date;
}

/**
 * Builds the payload and the manifest of a publication from its frozen
 * snapshot only, after checking that the snapshot is still the one that was
 * approved (schema and SHA-256). The manifest is serialized canonically and
 * hashed; its Ed25519 signature comes with the offline packages.
 */
export async function buildPublicationContent(
  publication: PublicationToBuild,
  tools: BuildTools,
): Promise<BuiltPublication> {
  const parsed = etareSnapshotSchema.safeParse(publication.snapshot);
  if (!parsed.success) throw new PermanentJobError('SNAPSHOT_INVALID');
  if ((await tools.sha256(canonicalJson(publication.snapshot))) !== publication.contentHash) {
    throw new PermanentJobError('SNAPSHOT_HASH_MISMATCH');
  }
  const snapshot = parsed.data;
  const createdAt = tools.now().toISOString();

  const payload = {
    schema_version: PUBLICATION_SCHEMA_VERSION,
    publication: {
      id: publication.id,
      publication_number: publication.publicationNumber,
      site_id: publication.siteId,
      revision_id: publication.revisionId,
      revision_no: publication.revisionNo,
      content_hash: publication.contentHash,
      submitted_by: publication.submittedBy.name,
      submitted_at: publication.submittedAt.toISOString(),
      approved_by: publication.approvedBy.name,
      approved_at: publication.approvedAt.toISOString(),
      created_at: createdAt,
    },
    data: snapshot,
  };
  const dataText = canonicalJson(payload);
  const manifest = {
    manifest_version: MANIFEST_VERSION,
    tenant_id: publication.tenantId,
    publication_id: publication.id,
    site_id: publication.siteId,
    publication_number: publication.publicationNumber,
    revision_id: publication.revisionId,
    content_hash: publication.contentHash,
    created_at: createdAt,
    schema_version: PUBLICATION_SCHEMA_VERSION,
    min_reader_version: MIN_READER_VERSION,
    data_file: DATA_FILE,
    files: publicationFiles(snapshot, { sha256: await tools.sha256(dataText), sizeBytes: tools.byteLength(dataText) }),
  };
  return {
    payload,
    manifest,
    manifestHash: await tools.sha256(canonicalJson(manifest)),
    templateVersion: null,
  };
}

export type PublicationBuildOutcome = 'published' | 'superseded' | 'already_built';

/** Job handler logic: idempotent (a built publication is left untouched); a permanent error marks it failed. */
export async function buildPublication(
  store: PublicationBuildStore,
  tools: BuildTools,
  publicationId: string,
  tenantId: string,
): Promise<PublicationBuildOutcome> {
  const publication = await store.start(publicationId, tenantId);
  if (!publication) return 'already_built';
  try {
    const built = await buildPublicationContent(publication, tools);
    return (await store.complete(publicationId, built)) ?? 'already_built';
  } catch (error) {
    if (error instanceof PermanentJobError) await store.fail(publicationId, error.code);
    throw error;
  }
}
