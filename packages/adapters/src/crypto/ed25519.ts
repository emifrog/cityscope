import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import type { IdentifiedSigner } from '@etare/application';
import type { Signature } from '@etare/contracts';
import { SIGNATURE_ALGORITHM, isEd25519PublicKey, signedText, type SignatureContext } from '@etare/domain';

/** Raw public key (32 bytes) in standard base64, the form terminals and configuration use. */
export function rawPublicKey(key: KeyObject): string {
  const { x } = key.export({ format: 'jwk' });
  if (!x) throw new Error('Not an Ed25519 key.');
  return Buffer.from(x, 'base64url').toString('base64');
}

/** Stable key identifier derived from the public key: rotation never needs a separate setting. */
export function keyIdOf(publicKey: string): string {
  return `ed25519-${createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 16)}`;
}

/**
 * Ed25519 signer of distributed content holding its private key in this process:
 * the worker holds the publication key, the API the catalogue key (ADR-015). The
 * key comes from a secret file mounted by the host, or from the environment in
 * development and tests (SEC-04, ADR-027); a Transit engine keeps it out of the
 * process altogether (`TransitSigner`).
 */
export class Ed25519Signer implements IdentifiedSigner {
  readonly keyId: string;
  readonly publicKey: string;

  private constructor(private readonly key: KeyObject) {
    this.publicKey = rawPublicKey(createPublicKey(key));
    this.keyId = keyIdOf(this.publicKey);
  }

  /** PKCS#8 DER in base64 (the form of the environment variables). */
  static fromPkcs8(base64: string): Ed25519Signer {
    let key: KeyObject;
    try {
      key = createPrivateKey({ key: Buffer.from(base64.trim(), 'base64'), format: 'der', type: 'pkcs8' });
    } catch {
      throw new Error('Signing key: PKCS#8 DER in base64 expected.');
    }
    return Ed25519Signer.of(key);
  }

  /** Content of a secret file: PEM (`openssl genpkey -algorithm ed25519`) or PKCS#8 DER in base64. */
  static fromSecret(text: string): Ed25519Signer {
    const trimmed = text.trim();
    if (!trimmed.startsWith('-----BEGIN')) return Ed25519Signer.fromPkcs8(trimmed);
    let key: KeyObject;
    try {
      key = createPrivateKey({ key: trimmed, format: 'pem' });
    } catch {
      throw new Error('Signing key: PEM private key expected.');
    }
    return Ed25519Signer.of(key);
  }

  private static of(key: KeyObject): Ed25519Signer {
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Signing key: an Ed25519 key is expected.');
    return new Ed25519Signer(key);
  }

  /** New key pair; returns the private key to store (PKCS#8 DER in base64, and PEM). */
  static generate(): { signer: Ed25519Signer; privateKey: string; privateKeyPem: string } {
    const { privateKey } = generateKeyPairSync('ed25519');
    return {
      signer: new Ed25519Signer(privateKey),
      privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    };
  }

  /** Synchronous signature, for local tools (key set ceremony) and tests. */
  signNow(context: SignatureContext, content: string): Signature {
    return {
      algorithm: SIGNATURE_ALGORITHM,
      key_id: this.keyId,
      signature: sign(null, Buffer.from(signedText(context, content), 'utf8'), this.key).toString('base64'),
    };
  }

  async sign(context: SignatureContext, content: string): Promise<Signature> {
    return this.signNow(context, content);
  }
}

/** Checks an Ed25519 signature of a text with a raw public key; never throws. */
export function verifyEd25519(publicKey: string, text: string, signature: string): boolean {
  if (!isEd25519PublicKey(publicKey)) return false;
  try {
    const key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKey, 'base64').toString('base64url') },
      format: 'jwk',
    });
    return verify(null, Buffer.from(text, 'utf8'), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
