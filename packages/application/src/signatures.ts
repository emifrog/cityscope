import type { Signature } from '@etare/contracts';
import { SIGNATURE_CONTEXTS, canonicalJson, signedText, type Keyset } from '@etare/domain';
import type { IdentifiedSigner } from './ports';

/** Re-signature of the content in force with the active key, after a rotation (SEC-04, ADR-027). */
export const SIGNATURE_RENEWAL_JOB = 'signatures.renew';

export type SignedContentKind = 'publication' | 'basemap';

/** A content in force the active key has not signed yet. */
export interface SignatureCandidate {
  readonly kind: SignedContentKind;
  readonly contentId: string;
  readonly tenantId: string;
  readonly manifest: unknown;
  readonly manifestHash: string;
  /** The signature made at build time, then the re-signatures, oldest first. */
  readonly signatures: readonly Signature[];
}

/** Worker-side access to the signatures (dedicated database functions). */
export interface SignatureRenewalStore {
  candidates(keyId: string, limit: number, exclude: readonly string[]): Promise<SignatureCandidate[]>;
  /** False when the content is no longer in force, or the key already signed it. */
  record(kind: SignedContentKind, contentId: string, signature: Signature): Promise<boolean>;
  /** Queues the renewal of an hour slot for the key (idempotent). */
  schedule(keyId: string, slot: string): Promise<string | null>;
}

export interface SignatureRenewalDependencies {
  readonly store: SignatureRenewalStore;
  readonly signer: IdentifiedSigner;
  /** Key set of the platform: the public keys of the original signatures, whatever their status. */
  readonly keyset: Keyset | null;
  readonly verify: (publicKey: string, text: string, signature: string) => boolean;
  readonly sha256: (text: string) => Promise<string>;
  readonly batchSize?: number;
}

export interface SignatureRenewalReport {
  readonly keyId: string;
  readonly publications: number;
  readonly basemaps: number;
  /** Content whose stored manifest or original signature could not be verified: never re-signed. */
  readonly unverifiable: readonly { kind: SignedContentKind; contentId: string }[];
}

const CONTEXT_OF = { publication: SIGNATURE_CONTEXTS.manifest, basemap: SIGNATURE_CONTEXTS.basemap } as const;

/**
 * Re-signs every content in force that the active key has not signed yet. The
 * worker signs only what it can vouch for: the stored manifest must still match
 * its hash, and one of its signatures must verify with a key of the platform
 * (listed in the key set, even revoked, or the active key itself). The original
 * signature is never replaced: re-signatures are added beside it.
 */
export async function renewSignatures(deps: SignatureRenewalDependencies): Promise<SignatureRenewalReport> {
  const keyId = deps.signer.keyId;
  const publicKeys = new Map<string, string>([[keyId, deps.signer.publicKey]]);
  for (const key of deps.keyset?.keys ?? []) {
    if (key.purpose === 'publication') publicKeys.set(key.key_id, key.public_key);
  }
  const batchSize = deps.batchSize ?? 200;
  const unverifiable: { kind: SignedContentKind; contentId: string }[] = [];
  const seen = new Set<string>();
  let publications = 0;
  let basemaps = 0;
  for (;;) {
    const batch = await deps.store.candidates(
      keyId,
      batchSize,
      unverifiable.map((entry) => entry.contentId),
    );
    // A content offered twice was not recorded (concurrent worker, store refusal): stop there.
    const fresh = batch.filter((candidate) => !seen.has(candidate.contentId));
    if (fresh.length === 0) break;
    for (const candidate of fresh) {
      seen.add(candidate.contentId);
      const content = canonicalJson(candidate.manifest);
      const text = signedText(CONTEXT_OF[candidate.kind], content);
      const vouched =
        (await deps.sha256(content)) === candidate.manifestHash &&
        candidate.signatures.some((signature) => {
          const publicKey = publicKeys.get(signature.key_id);
          return publicKey !== undefined && deps.verify(publicKey, text, signature.signature);
        });
      if (!vouched) {
        unverifiable.push({ kind: candidate.kind, contentId: candidate.contentId });
        continue;
      }
      const signature = await deps.signer.sign(CONTEXT_OF[candidate.kind], content);
      if (await deps.store.record(candidate.kind, candidate.contentId, signature)) {
        if (candidate.kind === 'publication') publications += 1;
        else basemaps += 1;
      }
    }
  }
  return { keyId, publications, basemaps, unverifiable };
}
