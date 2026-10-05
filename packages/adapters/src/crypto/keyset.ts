import { keysetSchema, signedKeysetSchema, type KeysetDocument, type SignedKeyset } from '@etare/contracts';
import { SIGNATURE_CONTEXTS, canonicalJson, isEd25519PublicKey, signedText, type Keyset } from '@etare/domain';
import { keyIdOf, verifyEd25519, type Ed25519Signer } from './ed25519';

/** A root public key embedded in the applications (`root:<id>:<base64>`, like the terminals read it). */
export interface RootKey {
  readonly keyId: string;
  readonly publicKey: string;
}

/** Parses `root:<id>:<base64>` entries separated by `;` or `,`; the identifier must match the key. */
export function parseRootKeys(raw: string): RootKey[] {
  return raw
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [purpose, keyId, publicKey] = entry.split(':');
      if (purpose !== 'root' || !keyId || !publicKey || !isEd25519PublicKey(publicKey)) {
        throw new Error(`Root key "${entry.slice(0, 40)}": root:<id>:<base64> expected.`);
      }
      if (keyIdOf(publicKey) !== keyId) throw new Error(`Root key ${keyId}: the identifier does not match the key.`);
      return { keyId, publicKey };
    });
}

/** Every key of a key set must carry the identifier derived from its public key. */
export function keysetIdentifierProblems(keyset: KeysetDocument): string[] {
  return keyset.keys
    .filter((key) => keyIdOf(key.public_key) !== key.key_id)
    .map((key) => `clé ${key.key_id} : identifiant différent de celui de sa clé publique`);
}

/** Reads a signed key set (JSON envelope) and its content; throws on any format problem. */
export function parseSignedKeyset(text: string): { signed: SignedKeyset; keyset: Keyset } {
  const signed = signedKeysetSchema.parse(JSON.parse(text));
  const keyset = keysetSchema.parse(JSON.parse(signed.keyset));
  // The bytes signed are the canonical form: anything else would be refused by the terminals.
  if (canonicalJson(keyset) !== signed.keyset) throw new Error('Key set: canonical JSON expected.');
  const problems = keysetIdentifierProblems(keyset);
  if (problems.length > 0) throw new Error(`Key set: ${problems.join('; ')}.`);
  return { signed, keyset };
}

/** Whether a root key of the list signed this key set. */
export function isKeysetSignedBy(signed: SignedKeyset, rootKeys: readonly RootKey[]): boolean {
  const root = rootKeys.find((key) => key.keyId === signed.signature.key_id);
  return (
    !!root &&
    verifyEd25519(root.publicKey, signedText(SIGNATURE_CONTEXTS.keyset, signed.keyset), signed.signature.signature)
  );
}

/** Signs a key set with a root key (key ceremony, local development): canonical JSON, context line. */
export function signKeyset(keyset: KeysetDocument, root: Ed25519Signer): SignedKeyset {
  const valid = keysetSchema.parse(keyset);
  const problems = keysetIdentifierProblems(valid);
  if (problems.length > 0) throw new Error(`Key set: ${problems.join('; ')}.`);
  const text = canonicalJson(valid);
  return { keyset: text, signature: root.signNow(SIGNATURE_CONTEXTS.keyset, text) };
}
