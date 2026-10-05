import type { Signature } from '@etare/contracts';
import { canonicalJson, signedText, type Keyset, type SignatureContext } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import type { IdentifiedSigner } from './ports';
import { renewSignatures, type SignatureCandidate, type SignatureRenewalStore } from './signatures';

/** A "signature" binds a key and a text: only that key verifies it. */
const fakeSign = (keyId: string, text: string) => `${keyId}|${text}`;
const verify = (publicKey: string, text: string, signature: string) => signature === fakeSign(publicKey, text);
const sha256 = async (text: string) => `hash:${text}`;

const signer: IdentifiedSigner = {
  keyId: 'pub-new',
  publicKey: 'pub-new',
  sign: async (context: SignatureContext, content: string): Promise<Signature> => ({
    algorithm: 'Ed25519',
    key_id: 'pub-new',
    signature: fakeSign('pub-new', signedText(context, content)),
  }),
};

const keyset: Keyset = {
  keyset_version: 1,
  sequence: 4,
  issued_at: '2026-10-28T08:00:00.000Z',
  keys: [
    { purpose: 'publication', key_id: 'pub-new', public_key: 'pub-new', status: 'active' },
    { purpose: 'publication', key_id: 'pub-lost', public_key: 'pub-lost', status: 'revoked' },
    { purpose: 'catalog', key_id: 'cat', public_key: 'cat', status: 'active' },
  ],
};

function candidate(
  id: string,
  kind: 'publication' | 'basemap',
  options: { keyId?: string; tampered?: boolean } = {},
): SignatureCandidate {
  const manifest = { id };
  const content = canonicalJson(manifest);
  const context = kind === 'publication' ? 'etare.manifest.v1' : 'etare.basemap.v1';
  return {
    kind,
    contentId: id,
    tenantId: 't',
    manifest,
    manifestHash: options.tampered ? 'hash:other' : `hash:${content}`,
    signatures: [
      {
        algorithm: 'Ed25519',
        key_id: options.keyId ?? 'pub-lost',
        signature: fakeSign(options.keyId ?? 'pub-lost', signedText(context, content)),
      },
    ],
  };
}

/** The database side: offers what the key has not signed, minus the exclusions. */
function store(contents: SignatureCandidate[]) {
  const signed = new Map<string, Signature>();
  const fake: SignatureRenewalStore = {
    candidates: vi.fn(async (_key: string, limit: number, exclude: readonly string[]) =>
      contents.filter((entry) => !signed.has(entry.contentId) && !exclude.includes(entry.contentId)).slice(0, limit),
    ),
    record: vi.fn(async (_kind, id: string, signature: Signature) => {
      signed.set(id, signature);
      return true;
    }),
    schedule: vi.fn(async () => null),
  };
  return { fake, signed };
}

describe('re-signature after a key rotation (SEC-04)', () => {
  it('re-signs, with the active key, the content signed by a key of the key set, even revoked', async () => {
    const { fake, signed } = store([candidate('p1', 'publication'), candidate('b1', 'basemap')]);
    const report = await renewSignatures({ store: fake, signer, keyset, verify, sha256 });
    expect(report).toEqual({ keyId: 'pub-new', publications: 1, basemaps: 1, unverifiable: [] });
    expect(signed.get('p1')).toEqual({
      algorithm: 'Ed25519',
      key_id: 'pub-new',
      signature: fakeSign('pub-new', signedText('etare.manifest.v1', '{"id":"p1"}')),
    });
    expect(signed.get('b1')?.signature).toBe(fakeSign('pub-new', signedText('etare.basemap.v1', '{"id":"b1"}')));
  });

  it('never re-signs a manifest that no longer matches its hash, or whose signature no known key verifies', async () => {
    const { fake, signed } = store([
      candidate('tampered', 'publication', { tampered: true }),
      candidate('unknown', 'publication', { keyId: 'never-listed' }),
      candidate('fine', 'publication'),
    ]);
    const report = await renewSignatures({ store: fake, signer, keyset, verify, sha256, batchSize: 2 });
    expect(report.publications).toBe(1);
    expect(report.unverifiable).toEqual([
      { kind: 'publication', contentId: 'tampered' },
      { kind: 'publication', contentId: 'unknown' },
    ]);
    expect([...signed.keys()]).toEqual(['fine']);
    // The excluded contents are left out of the next batches: the run ends.
    expect(fake.candidates).toHaveBeenLastCalledWith('pub-new', 2, ['tampered', 'unknown']);
  });

  it('without a key set, vouches only for what its own key signed', async () => {
    const { fake } = store([candidate('p1', 'publication')]);
    const report = await renewSignatures({ store: fake, signer, keyset: null, verify, sha256 });
    expect(report.unverifiable).toEqual([{ kind: 'publication', contentId: 'p1' }]);
  });

  it('stops when the store offers again what it did not record (concurrent worker)', async () => {
    const same = candidate('p1', 'publication');
    const fake: SignatureRenewalStore = {
      candidates: vi.fn(async () => [same]),
      record: vi.fn(async () => false),
      schedule: vi.fn(async () => null),
    };
    const report = await renewSignatures({ store: fake, signer, keyset, verify, sha256 });
    expect(report.publications).toBe(0);
    expect(fake.candidates).toHaveBeenCalledTimes(2);
  });
});
