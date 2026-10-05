import { generateKeyPairSync } from 'node:crypto';
import { signedText } from '@etare/domain';
import { describe, expect, it } from 'vitest';
import { Ed25519Signer, keyIdOf, verifyEd25519 } from './ed25519';

describe('Ed25519 signatures', () => {
  it('signs the context line and the content, verifiable with the raw public key', async () => {
    const { signer, privateKey, privateKeyPem } = Ed25519Signer.generate();
    const envelope = await signer.sign('etare.manifest.v1', '{"a":1}');
    expect(envelope).toMatchObject({ algorithm: 'Ed25519', key_id: keyIdOf(signer.publicKey) });
    expect(signer.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(verifyEd25519(signer.publicKey, signedText('etare.manifest.v1', '{"a":1}'), envelope.signature)).toBe(true);
    // Same key reloaded from its stored forms (environment, secret file), same deterministic signature.
    for (const reloaded of [Ed25519Signer.fromPkcs8(privateKey), Ed25519Signer.fromSecret(`${privateKeyPem}\n`)]) {
      expect(reloaded.keyId).toBe(signer.keyId);
      expect(await reloaded.sign('etare.manifest.v1', '{"a":1}')).toEqual(envelope);
    }
    expect(Ed25519Signer.fromSecret(` ${privateKey}\n`).keyId).toBe(signer.keyId);
  });

  it('refuses another content, another context or another key', async () => {
    const { signer } = Ed25519Signer.generate();
    const { signer: other } = Ed25519Signer.generate();
    const { signature } = await signer.sign('etare.manifest.v1', '{"a":1}');
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
    expect(() => Ed25519Signer.fromSecret(privateKey.export({ format: 'pem', type: 'pkcs8' }).toString())).toThrow(
      /Ed25519/,
    );
    expect(() => Ed25519Signer.fromPkcs8('garbage')).toThrow(/PKCS#8/);
    expect(() => Ed25519Signer.fromSecret('-----BEGIN PRIVATE KEY-----\ngarbage\n-----END PRIVATE KEY-----')).toThrow(
      /PEM/,
    );
  });
});
