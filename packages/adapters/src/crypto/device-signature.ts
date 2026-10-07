/**
 * Proofs of the terminals (SEC-05): Ed25519 for the software keys of the first
 * tablets, ECDSA P-256 with SHA-256 (DER signature) for the keys of the Android
 * Keystore, which export their public key as SubjectPublicKeyInfo.
 */
import { createPublicKey, verify } from 'node:crypto';
import type { DeviceSignatureVerifier } from '@etare/application';
import { isDevicePublicKey, isDeviceSignature, type DeviceKeyAlgorithm } from '@etare/domain';
import { verifyEd25519 } from './ed25519';

/** Checks the signature of a terminal in the algorithm of its key; never throws. */
export function verifyDeviceSignature(
  algorithm: DeviceKeyAlgorithm,
  publicKey: string,
  text: string,
  signature: string,
): boolean {
  if (algorithm === 'ed25519') return verifyEd25519(publicKey, text, signature);
  if (!isDevicePublicKey(algorithm, publicKey) || !isDeviceSignature(algorithm, signature)) return false;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    return verify('sha256', Buffer.from(text, 'utf8'), { key, dsaEncoding: 'der' }, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

export const deviceSignatureVerifier: DeviceSignatureVerifier = { verify: verifyDeviceSignature };
