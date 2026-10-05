import type { SignatureCandidate, SignatureRenewalStore, SignedContentKind } from '@etare/application';
import { signatureSchema, type Signature } from '@etare/contracts';
import type { Pool } from './pool';

interface CandidateRow {
  kind: SignedContentKind;
  content_id: string;
  tenant_id: string;
  manifest: unknown;
  manifest_hash: string;
  signatures: unknown;
}

/** Worker side of the re-signatures after a key rotation (SEC-04), through app.worker_* functions only. */
export class PostgresSignatureRenewalStore implements SignatureRenewalStore {
  constructor(private readonly pool: Pool) {}

  async candidates(keyId: string, limit: number, exclude: readonly string[]): Promise<SignatureCandidate[]> {
    const { rows } = await this.pool.query<CandidateRow>(
      `select kind, content_id, tenant_id, manifest, manifest_hash, signatures
       from app.worker_signature_candidates($1, $2, $3::uuid[])`,
      [keyId, limit, exclude],
    );
    return rows.map((row) => ({
      kind: row.kind,
      contentId: row.content_id,
      tenantId: row.tenant_id,
      manifest: row.manifest,
      manifestHash: row.manifest_hash,
      signatures: signatureSchema.array().parse(row.signatures),
    }));
  }

  async record(kind: SignedContentKind, contentId: string, signature: Signature): Promise<boolean> {
    const { rows } = await this.pool.query<{ recorded: boolean }>(
      'select app.worker_record_signature($1, $2, $3) as recorded',
      [kind, contentId, signature],
    );
    return rows[0]?.recorded ?? false;
  }

  async schedule(keyId: string, slot: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string | null }>(
      'select app.worker_schedule_signature_renewal($1, $2) as id',
      [keyId, slot],
    );
    return rows[0]?.id ?? null;
  }
}
