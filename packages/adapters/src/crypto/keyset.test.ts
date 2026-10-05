import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { KeysetDocument } from '@etare/contracts';
import { SIGNATURE_CONTEXTS, canonicalJson, signedText } from '@etare/domain';
import { describe, expect, it, vi } from 'vitest';
import { Ed25519Signer, verifyEd25519 } from './ed25519';
import { isKeysetSignedBy, parseRootKeys, parseSignedKeyset, signKeyset } from './keyset';
import { lazySigner, loadKeyset, openSigner } from './signing';
import { TransitSigner, transitKeyVersions } from './transit';

const root = Ed25519Signer.generate().signer;
const publication = Ed25519Signer.generate();
const catalog = Ed25519Signer.generate();
const rootLine = `root:${root.keyId}:${root.publicKey}`;

function draft(sequence: number, keys: KeysetDocument['keys']): KeysetDocument {
  return { keyset_version: 1, sequence, issued_at: '2026-10-06T08:00:00.000Z', keys };
}

const keyOf = (
  signer: Ed25519Signer,
  purpose: 'publication' | 'catalog',
  status: 'active' | 'retired' | 'revoked',
) => ({
  purpose,
  key_id: signer.keyId,
  public_key: signer.publicKey,
  status,
});

const keyset = draft(1, [
  keyOf(publication.signer, 'publication', 'active'),
  keyOf(catalog.signer, 'catalog', 'active'),
]);

describe('key set of the platform (SEC-04)', () => {
  it('is signed by the root key on its canonical JSON, and read back', () => {
    const signed = signKeyset(keyset, root);
    expect(signed.keyset).toBe(canonicalJson(keyset));
    expect(
      verifyEd25519(root.publicKey, signedText(SIGNATURE_CONTEXTS.keyset, signed.keyset), signed.signature.signature),
    ).toBe(true);
    const parsed = parseSignedKeyset(JSON.stringify(signed));
    expect(parsed.keyset.sequence).toBe(1);
    expect(isKeysetSignedBy(parsed.signed, parseRootKeys(rootLine))).toBe(true);
    expect(
      isKeysetSignedBy(
        parsed.signed,
        parseRootKeys(`root:${publication.signer.keyId}:${publication.signer.publicKey}`),
      ),
    ).toBe(false);
  });

  it('refuses a key whose identifier is not derived from its public key, or a broken rule', () => {
    const forged = draft(2, [
      { ...keyOf(publication.signer, 'publication', 'active'), key_id: 'ed25519-0000000000000000' },
      keyOf(catalog.signer, 'catalog', 'active'),
    ]);
    expect(() => signKeyset(forged, root)).toThrow(/identifiant/);
    const shared = draft(2, [
      keyOf(publication.signer, 'publication', 'active'),
      keyOf(publication.signer, 'catalog', 'active'),
    ]);
    expect(() => signKeyset(shared, root)).toThrow();
    // Not canonical: the terminals verify the exact bytes, so the server refuses it too.
    const signed = signKeyset(keyset, root);
    const spaced = { ...signed, keyset: JSON.stringify(keyset, null, 1) };
    expect(() => parseSignedKeyset(JSON.stringify(spaced))).toThrow(/canonical/);
  });

  it('reads root keys only with their derived identifier', () => {
    expect(parseRootKeys(` ${rootLine} ; `)).toEqual([{ keyId: root.keyId, publicKey: root.publicKey }]);
    expect(() => parseRootKeys(`root:ed25519-0000000000000000:${root.publicKey}`)).toThrow(/does not match/);
    expect(() => parseRootKeys(`publication:${root.keyId}:${root.publicKey}`)).toThrow(/root:/);
  });

  it('is loaded from a file and checked against the configured root keys', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'etare-keyset-'));
    const file = join(dir, 'keyset.json');
    writeFileSync(file, `${JSON.stringify(signKeyset(keyset, root))}\n`);
    expect((await loadKeyset({ source: { kind: 'file', path: file }, rootKeys: rootLine }))?.keyset.sequence).toBe(1);
    const other = Ed25519Signer.generate().signer;
    await expect(
      loadKeyset({ source: { kind: 'file', path: file }, rootKeys: `root:${other.keyId}:${other.publicKey}` }),
    ).rejects.toThrow(/not signed by a configured root key/);
    expect(await loadKeyset(null)).toBeNull();
  });
});

describe('signing keys of the processes (SEC-04)', () => {
  it('open from a secret file, and only when the key set lists them as active', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'etare-key-'));
    const file = join(dir, 'publication.pem');
    writeFileSync(file, publication.privateKeyPem);
    const signer = await openSigner({ kind: 'file', path: file }, 'publication', keyset);
    expect(signer.keyId).toBe(publication.signer.keyId);
    // Retired: it may no longer sign. Wrong purpose: never.
    const retired = draft(2, [
      keyOf(publication.signer, 'publication', 'retired'),
      keyOf(Ed25519Signer.generate().signer, 'publication', 'active'),
      keyOf(catalog.signer, 'catalog', 'active'),
    ]);
    await expect(openSigner({ kind: 'file', path: file }, 'publication', retired)).rejects.toThrow(/not active/);
    await expect(openSigner({ kind: 'file', path: file }, 'catalog', keyset)).rejects.toThrow(/not active/);
    expect((await openSigner({ kind: 'environment', value: catalog.privateKey }, 'catalog', null)).keyId).toBe(
      catalog.signer.keyId,
    );
  });

  it('opens lazily, and again after a failed opening', async () => {
    const open = vi
      .fn<() => Promise<Ed25519Signer>>()
      .mockRejectedValueOnce(new Error('vault down'))
      .mockResolvedValue(catalog.signer);
    const signer = lazySigner(open);
    await expect(signer.sign('etare.catalog.v1', '{}')).rejects.toThrow('vault down');
    expect((await signer.sign('etare.catalog.v1', '{}')).key_id).toBe(catalog.signer.keyId);
    await signer.sign('etare.catalog.v1', '{}');
    expect(open).toHaveBeenCalledTimes(2);
  });
});

/** A Transit engine in memory: versions of an Ed25519 key, signing what it is given. */
function fakeTransit(versions: Ed25519Signer[], options: { forge?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'etare-bao-'));
  const tokenFile = join(dir, 'token');
  writeFileSync(tokenFile, 'test-token\n');
  const requests: { url: string; token: string | null; body: unknown }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as { input: string; key_version: number }) : null;
    requests.push({ url, token: headers.get('x-vault-token'), body });
    if (url.endsWith('/v1/transit/keys/etare-catalog')) {
      const keys = Object.fromEntries(
        versions.map((signer, index) => [String(index + 1), { public_key: signer.publicKey, creation_time: 'x' }]),
      );
      return Response.json({ data: { type: 'ed25519', keys, latest_version: versions.length } });
    }
    if (url.endsWith('/v1/transit/sign/etare-catalog') && body) {
      const signer = versions[body.key_version - 1];
      if (!signer) return new Response('{}', { status: 400 });
      const text = Buffer.from(body.input, 'base64').toString('utf8');
      const [context, ...rest] = text.split('\n');
      // A forging engine signs something else than what it was given.
      const content = options.forge ? `${rest.join('\n')} ` : rest.join('\n');
      const signature = signer.signNow(context as 'etare.catalog.v1', content).signature;
      return Response.json({ data: { signature: `vault:v${body.key_version}:${signature}` } });
    }
    return new Response('{}', { status: 404 });
  });
  const settings = { url: 'http://bao.test:8200/', mount: 'transit', key: 'etare-catalog', tokenFile, fetch };
  return { settings, requests };
}

describe('Transit engine (OpenBao, Vault)', () => {
  const v1 = Ed25519Signer.generate().signer;
  const v2 = Ed25519Signer.generate().signer;

  it('lists the versions of a key with the identifiers of the key set', async () => {
    const { settings } = fakeTransit([v1, v2]);
    expect(await transitKeyVersions(settings)).toEqual([
      { version: 1, publicKey: v1.publicKey, keyId: v1.keyId, createdAt: 'x' },
      { version: 2, publicKey: v2.publicKey, keyId: v2.keyId, createdAt: 'x' },
    ]);
  });

  it('signs with the newest version active in the key set, the token read from its file', async () => {
    const { settings, requests } = fakeTransit([v1, v2]);
    const announced = draft(3, [keyOf(publication.signer, 'publication', 'active'), keyOf(v1, 'catalog', 'active')]);
    // Version 2 exists (rotation done in the vault) but is not announced yet: version 1 still signs.
    const signer = await TransitSigner.connect(settings, 'catalog', announced);
    expect(signer.keyId).toBe(v1.keyId);
    const signature = await signer.sign('etare.catalog.v1', '{"a":1}');
    expect(signature.key_id).toBe(v1.keyId);
    expect(verifyEd25519(v1.publicKey, signedText('etare.catalog.v1', '{"a":1}'), signature.signature)).toBe(true);
    expect(requests.at(-1)).toMatchObject({ token: 'test-token', body: { key_version: 1 } });
    const next = draft(4, [
      keyOf(publication.signer, 'publication', 'active'),
      keyOf(v1, 'catalog', 'retired'),
      keyOf(v2, 'catalog', 'active'),
    ]);
    expect((await TransitSigner.connect(settings, 'catalog', next)).keyId).toBe(v2.keyId);
    // Without a key set (development): the latest version.
    expect((await TransitSigner.connect(settings, 'catalog', null)).keyId).toBe(v2.keyId);
    const unknown = draft(5, [
      keyOf(publication.signer, 'publication', 'active'),
      keyOf(catalog.signer, 'catalog', 'active'),
    ]);
    await expect(TransitSigner.connect(settings, 'catalog', unknown)).rejects.toThrow(/no version is active/);
  });

  it('never hands out a signature that does not verify, and says when the vault is unreachable', async () => {
    const forged = fakeTransit([v1], { forge: true });
    const signer = await TransitSigner.connect(forged.settings, 'catalog', null);
    await expect(signer.sign('etare.catalog.v1', '{}')).rejects.toThrow(/signature invalide/);
    const down = {
      ...forged.settings,
      fetch: vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    };
    await expect(transitKeyVersions(down)).rejects.toThrow(/injoignable/);
  });
});
