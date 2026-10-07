import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyDeviceSignature } from './device-signature';

const text = 'etare.device-request.v1\nGET\n/api/v1/sync/catalog\n1\nabc';

describe('proofs of the terminals', () => {
  it('checks an ECDSA P-256 signature as the Android Keystore makes it (SHA256withECDSA, DER)', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
    const signature = sign('sha256', Buffer.from(text), { key: privateKey, dsaEncoding: 'der' }).toString('base64');
    expect(verifyDeviceSignature('ecdsa-p256', spki, text, signature)).toBe(true);
    expect(verifyDeviceSignature('ecdsa-p256', spki, `${text}x`, signature)).toBe(false);
    // The raw form (IEEE P1363) is not the one of Android: refused.
    const raw = sign('sha256', Buffer.from(text), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64');
    expect(verifyDeviceSignature('ecdsa-p256', spki, text, raw)).toBe(false);
  });

  it('never accepts a signature under another algorithm than the one of the key', () => {
    const ed = generateKeyPairSync('ed25519');
    const raw = Buffer.from(ed.publicKey.export({ format: 'jwk' }).x ?? '', 'base64url').toString('base64');
    const signature = sign(null, Buffer.from(text), ed.privateKey).toString('base64');
    expect(verifyDeviceSignature('ed25519', raw, text, signature)).toBe(true);
    expect(verifyDeviceSignature('ecdsa-p256', raw, text, signature)).toBe(false);
    expect(verifyDeviceSignature('ecdsa-p256', 'not a key', text, 'MEUC')).toBe(false);
  });
});
