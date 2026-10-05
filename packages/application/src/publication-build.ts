import { etareSnapshotSchema, type EtareSnapshot, type Signature } from '@etare/contracts';
import { SIGNATURE_CONTEXTS, canonicalJson, photoAnnex, visibleSections } from '@etare/domain';
import { PermanentJobError } from './jobs';
import { ImageUnreadable, type ImageResizer } from './file-lifecycle';
import type { ContentSigner, ObjectStoreAdmin } from './ports';

export const PUBLICATION_BUILD_JOB = 'publication.build';
export const MANIFEST_VERSION = 1;
export const PUBLICATION_SCHEMA_VERSION = 1;
export const MIN_READER_VERSION = '1.0.0';
export const DATA_FILE = 'data/site.json';
export const PDF_FILE = 'etare.pdf';

/** Storage key of the ETARE PDF of a publication (produced by the worker, served by signed URL). */
export const publicationPdfKey = (tenantId: string, publicationId: string, sha256?: string) =>
  `tenants/${tenantId}/publications/${publicationId}/etare${sha256 ? `-${sha256}` : ''}.pdf`;

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
  readonly pdfStorageKey: string | null;
  /** Ed25519 signature of the canonical manifest; null without a publication key (not distributable). */
  readonly manifestSignature: Signature | null;
}

/** Monotonic attempt number of the running queue job: stale workers cannot commit. */
export interface PublicationBuildLease {
  readonly jobId: string;
  readonly attempt: number;
}

export interface PublicationBuildStore {
  /** queued -> building; null when the publication is unknown, of another SIS or already built. */
  start(publicationId: string, tenantId: string, lease: PublicationBuildLease): Promise<PublicationToBuild | null>;
  /** building -> ready -> published (or superseded when a newer one exists). */
  complete(
    publicationId: string,
    built: BuiltPublication,
    lease: PublicationBuildLease,
  ): Promise<'published' | 'superseded' | null>;
  fail(publicationId: string, failureCode: string, lease: PublicationBuildLease): Promise<boolean>;
  /** Records a file about to be written by this attempt: if the attempt loses, the maintenance removes it. */
  recordOutput(publicationId: string, tenantId: string, storageKey: string): Promise<void>;
  /** Checked files of the SIS referenced by the snapshot (plan backgrounds), with their storage keys. */
  assetFiles(
    tenantId: string,
    assetIds: readonly string[],
  ): Promise<{ id: string; storageKey: string; sha256: string; mimeType: string }[]>;
}

export interface PlanImage {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/** What the ETARE PDF is drawn from: the frozen snapshot and the stamp of the publication (ETARE-02). */
export interface EtarePdfInput {
  readonly publication: {
    readonly id: string;
    readonly number: number;
    readonly revisionNo: number;
    readonly contentHash: string;
    readonly submittedBy: string;
    readonly submittedAt: Date;
    readonly approvedBy: string;
    readonly approvedAt: Date;
    readonly createdAt: Date;
  };
  readonly snapshot: EtareSnapshot;
  /** Plan backgrounds by background revision id (PNG, JPEG or WebP), checked against their original hash. */
  readonly planImages: ReadonlyMap<string, PlanImage>;
  /**
   * Photos of the annex by photo id: reduced JPEG of the original checked against its approved hash;
   * null when the checked original cannot be decoded (drawn as such, the publication goes on).
   */
  readonly photoImages: ReadonlyMap<string, PlanImage | null>;
}

export interface EtarePdfRenderer {
  readonly templateVersion: string;
  render(input: EtarePdfInput): Promise<Uint8Array>;
}

/** Optional outputs of a build: the ETARE PDF, stored next to the publication. */
export interface PublicationArtifacts {
  readonly renderer: EtarePdfRenderer;
  readonly objects: ObjectStoreAdmin;
  readonly sha256Bytes: (content: Uint8Array) => Promise<string>;
  /** Reduces the photos of the annex (never the thumbnails of the back-office, ADR-026). */
  readonly images: Pick<ImageResizer, 'documentImage'>;
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
 * Files of the publication, by hash: the data file, the plan backgrounds, the
 * photos of objects and the documents meant for offline use ("always"
 * required, "on demand" optional). Paths are relative, without traversal (architecture §10).
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
    ...snapshot.objects.flatMap((object) =>
      (object.photos ?? []).map((photo) => ({
        path: `photos/${photo.id}.${extension(photo.asset.mime_type)}`,
        sha256: photo.asset.sha256,
        size_bytes: photo.asset.size_bytes,
        media_type: photo.asset.mime_type,
        required: true,
      })),
    ),
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

/** Runtime tools: SHA-256 (hex) and size of the UTF-8 bytes of a text, clock, publication key. */
export interface BuildTools {
  readonly sha256: (text: string) => Promise<string>;
  readonly byteLength: (text: string) => number;
  readonly now: () => Date;
  /** Signs manifests for offline distribution (ADR-015); without it, publications stay off the terminals. */
  readonly signer?: ContentSigner | null;
}

/** The snapshot must still be the one that was approved (schema and SHA-256). */
export async function verifiedSnapshot(publication: PublicationToBuild, tools: BuildTools): Promise<EtareSnapshot> {
  const parsed = etareSnapshotSchema.safeParse(publication.snapshot);
  if (!parsed.success) throw new PermanentJobError('SNAPSHOT_INVALID');
  if ((await tools.sha256(canonicalJson(publication.snapshot))) !== publication.contentHash) {
    throw new PermanentJobError('SNAPSHOT_HASH_MISMATCH');
  }
  return parsed.data;
}

export interface GeneratedFile {
  readonly file: ManifestFile;
  readonly templateVersion: string;
  readonly storageKey: string;
}

/**
 * Builds the payload and the manifest of a publication from its frozen
 * snapshot only. The manifest lists every file by hash (the generated PDF
 * included), is serialized canonically, hashed and signed with the
 * publication key: terminals check that signature before installing it.
 */
export async function buildPublicationContent(
  publication: PublicationToBuild,
  tools: BuildTools,
  generated: GeneratedFile | null = null,
  createdAt = tools.now().toISOString(),
): Promise<BuiltPublication> {
  const snapshot = await verifiedSnapshot(publication, tools);

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
    files: [
      ...publicationFiles(snapshot, { sha256: await tools.sha256(dataText), sizeBytes: tools.byteLength(dataText) }),
      ...(generated ? [generated.file] : []),
    ],
  };
  const manifestText = canonicalJson(manifest);
  return {
    payload,
    manifest,
    manifestHash: await tools.sha256(manifestText),
    templateVersion: generated?.templateVersion ?? null,
    pdfStorageKey: generated?.storageKey ?? null,
    manifestSignature: tools.signer ? await tools.signer.sign(SIGNATURE_CONTEXTS.manifest, manifestText) : null,
  };
}

/**
 * Renders the ETARE PDF from the snapshot and stores it. The plan backgrounds
 * and the photos of the annex are read from storage and checked against the
 * hash the snapshot approved: a mismatch stops the publication. Photos are
 * reduced one at a time from that original (ADR-026).
 */
export async function generateEtarePdf(
  store: PublicationBuildStore,
  artifacts: PublicationArtifacts,
  publication: PublicationToBuild,
  snapshot: EtareSnapshot,
  createdAt: Date,
): Promise<GeneratedFile> {
  const sections = visibleSections(snapshot.layout);
  const backgrounds = sections.includes('plans') ? snapshot.plans.map((plan) => plan.background) : [];
  const annex = photoAnnex(snapshot.objects, sections)?.entries ?? [];
  const files = new Map(
    (
      await store.assetFiles(publication.tenantId, [
        ...backgrounds.map((background) => background.asset.id),
        ...annex.map((entry) => entry.photo.asset.id),
      ])
    ).map((file) => [file.id, file]),
  );
  const planImages = new Map<string, PlanImage>();
  for (const background of backgrounds) {
    const file = files.get(background.asset.id);
    const bytes = file ? await artifacts.objects.download(file.storageKey) : null;
    if (!file || !bytes) throw new Error('PLAN_BACKGROUND_UNAVAILABLE');
    if ((await artifacts.sha256Bytes(bytes)) !== background.asset.sha256) {
      throw new PermanentJobError('PLAN_BACKGROUND_HASH_MISMATCH');
    }
    planImages.set(background.revision_id, { bytes, mimeType: background.asset.mime_type });
  }
  const photoImages = new Map<string, PlanImage | null>();
  for (const { photo } of annex) {
    const file = files.get(photo.asset.id);
    const bytes = file ? await artifacts.objects.download(file.storageKey) : null;
    if (!file || !bytes) throw new Error('PHOTO_UNAVAILABLE');
    if ((await artifacts.sha256Bytes(bytes)) !== photo.asset.sha256) throw new PermanentJobError('PHOTO_HASH_MISMATCH');
    try {
      photoImages.set(photo.id, { bytes: await artifacts.images.documentImage(bytes), mimeType: 'image/jpeg' });
    } catch (error) {
      // A checked file that no decoder reads: said in the annex rather than blocking the publication.
      if (!(error instanceof ImageUnreadable)) throw error;
      photoImages.set(photo.id, null);
    }
  }

  const pdf = await artifacts.renderer.render({
    publication: {
      id: publication.id,
      number: publication.publicationNumber,
      revisionNo: publication.revisionNo,
      contentHash: publication.contentHash,
      submittedBy: publication.submittedBy.name,
      submittedAt: publication.submittedAt,
      approvedBy: publication.approvedBy.name,
      approvedAt: publication.approvedAt,
      createdAt,
    },
    snapshot,
    planImages,
    photoImages,
  });
  const sha256 = await artifacts.sha256Bytes(pdf);
  const storageKey = publicationPdfKey(publication.tenantId, publication.id, sha256);
  await store.recordOutput(publication.id, publication.tenantId, storageKey);
  try {
    // Never overwrite: another attempt may already have published a different PDF.
    await artifacts.objects.upload(storageKey, pdf, 'application/pdf', { upsert: false });
  } catch (error) {
    // A retry producing identical bytes is safe, including an upload whose acknowledgement was lost.
    const existing = await artifacts.objects.download(storageKey);
    if (!existing || (await artifacts.sha256Bytes(existing)) !== sha256) throw error;
  }
  return {
    storageKey,
    file: {
      path: PDF_FILE,
      sha256,
      size_bytes: pdf.byteLength,
      media_type: 'application/pdf',
      required: true,
    },
    templateVersion: artifacts.renderer.templateVersion,
  };
}

export type PublicationBuildOutcome = 'published' | 'superseded' | 'already_built';

/** Job handler logic: idempotent (a built publication is left untouched); a permanent error marks it failed. */
export async function buildPublication(
  store: PublicationBuildStore,
  tools: BuildTools,
  publicationId: string,
  tenantId: string,
  lease: PublicationBuildLease,
  artifacts: PublicationArtifacts | null = null,
  signal?: { throwIfAborted(): void },
): Promise<PublicationBuildOutcome> {
  signal?.throwIfAborted();
  const publication = await store.start(publicationId, tenantId, lease);
  if (!publication) return 'already_built';
  try {
    const createdAt = tools.now();
    const snapshot = await verifiedSnapshot(publication, tools);
    const generated = artifacts ? await generateEtarePdf(store, artifacts, publication, snapshot, createdAt) : null;
    signal?.throwIfAborted();
    const built = await buildPublicationContent(publication, tools, generated, createdAt.toISOString());
    return (await store.complete(publicationId, built, lease)) ?? 'already_built';
  } catch (error) {
    if (error instanceof PermanentJobError) await store.fail(publicationId, error.code, lease);
    throw error;
  }
}
