import { generateKeyPairSync } from 'node:crypto';
import { signedText } from '@etare/domain';
import { describe, expect, it } from 'vitest';
import { Ed25519Signer, keyIdOf, verifyEd25519 } from './ed25519';

describe('Ed25519 signatures', () => {
  it('signs the context line and the content, verifiable with the raw public key', () => {
    const { signer, privateKey } = Ed25519Signer.generate();
    const envelope = signer.sign('etare.manifest.v1', '{"a":1}');
    expect(envelope).toMatchObject({ algorithm: 'Ed25519', key_id: keyIdOf(signer.publicKey) });
    expect(signer.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(verifyEd25519(signer.publicKey, signedText('etare.manifest.v1', '{"a":1}'), envelope.signature)).toBe(true);
    // Same key reloaded from its stored form, same deterministic signature.
    const reloaded = Ed25519Signer.fromPkcs8(privateKey);
    expect(reloaded.keyId).toBe(signer.keyId);
    expect(reloaded.sign('etare.manifest.v1', '{"a":1}')).toEqual(envelope);
  });

  it('refuses another content, another context or another key', () => {
    const { signer } = Ed25519Signer.generate();
    const { signer: other } = Ed25519Signer.generate();
    const { signature } = signer.sign('etare.manifest.v1', '{"a":1}');
    expect(verifyEd25519(signer.publicKey, signedText('etare.manifest.v1', '{"a":2}'), signature)).toBe(false);
    expect(verifyEd25519(signer.publicKey, signedText('etare.catalog.v1', '{"a":1}'), signature)).toBe(false);
    expect(verifyEd25519(other.publicKey, signedText('etare.manifest.v1', '{"a":1}'), signature)).toBe(false);
    expect(verifyEd25519('not a key', 'x', signature)).toBe(false);
    expect(verifyEd25519(signer.publicKey, 'x', 'not a signature')).toBe(false);
  });

  it('only loads Ed25519 private keys', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(() =>
      Ed25519Signer.fromPkcs8(privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')),
    ).toThrow(/Ed25519/);
    expect(() => Ed25519Signer.fromPkcs8('garbage')).toThrow(/PKCS#8/);
  });
});
