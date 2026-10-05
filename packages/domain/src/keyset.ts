/**
 * Distribution key set (SEC-04, ADR-027). The terminals embed only the public
 * part of a root key, kept offline; the root key signs a key set listing the
 * signing keys of the platform with their status. Rotation and revocation then
 * reach the tablets at their next contact, without a new application.
 *
 * - `active`: signs, and is trusted;
 * - `retired`: no longer signs. Content it signed before (publications, base maps)
 *   stays trusted; a catalogue, signed at each contact, never is;
 * - `revoked`: compromised or withdrawn. Nothing it signed is trusted: the terminal
 *   asks again for content signed by it, which the worker has re-signed.
 */

/** Format of the key set read by the terminals. */
export const KEYSET_VERSION = 1;

export const SIGNING_KEY_PURPOSES = ['publication', 'catalog'] as const;
export type SigningKeyPurpose = (typeof SIGNING_KEY_PURPOSES)[number];

export const SIGNING_KEY_STATUSES = ['active', 'retired', 'revoked'] as const;
export type SigningKeyStatus = (typeof SIGNING_KEY_STATUSES)[number];

/** Most keys a key set may list (rotations accumulate retired keys until removed). */
export const KEYSET_MAX_KEYS = 32;

export interface KeysetKey {
  readonly purpose: SigningKeyPurpose;
  readonly key_id: string;
  /** Raw Ed25519 public key (32 bytes, base64). */
  readonly public_key: string;
  readonly status: SigningKeyStatus;
}

export interface Keyset {
  readonly keyset_version: typeof KEYSET_VERSION;
  /** Increases with each key set: a terminal never goes back to an older one. */
  readonly sequence: number;
  readonly issued_at: string;
  readonly keys: readonly KeysetKey[];
}

/** Whether a signature by this key is trusted for this purpose. */
export function isKeyTrusted(keyset: Keyset, purpose: SigningKeyPurpose, keyId: string): boolean {
  const key = keyset.keys.find((candidate) => candidate.purpose === purpose && candidate.key_id === keyId);
  if (!key) return false;
  // A catalogue is signed at each contact: only an active key may have signed it.
  return key.status === 'active' || (key.status === 'retired' && purpose === 'publication');
}

/** Whether this key may sign now (a process refuses to sign with any other key). */
export function isKeyActive(keyset: Keyset, purpose: SigningKeyPurpose, keyId: string): boolean {
  return keyset.keys.some((key) => key.purpose === purpose && key.key_id === keyId && key.status === 'active');
}

/** Rules a key set must follow, beyond its format: an empty list means valid. */
export function keysetProblems(keyset: Keyset): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const publicKeys = new Set<string>();
  for (const key of keyset.keys) {
    if (ids.has(key.key_id)) problems.push(`clé ${key.key_id} listée deux fois`);
    ids.add(key.key_id);
    // Separation of the keys (ADR-015): one key never serves two purposes.
    if (publicKeys.has(key.public_key)) problems.push(`clé publique de ${key.key_id} déjà listée`);
    publicKeys.add(key.public_key);
  }
  for (const purpose of SIGNING_KEY_PURPOSES) {
    if (!keyset.keys.some((key) => key.purpose === purpose && key.status === 'active')) {
      problems.push(`aucune clé active pour l'usage ${purpose}`);
    }
  }
  if (keyset.keys.length > KEYSET_MAX_KEYS) problems.push(`plus de ${KEYSET_MAX_KEYS} clés`);
  return problems;
}

/**
 * The signature to serve for content signed several times (original signature,
 * then re-signatures after a rotation, oldest first): the most recent by an active
 * key, else by a retired one. Without a key set (development), the most recent.
 * Null: no signature the terminals still trust.
 */
export function preferredSignature<T extends { readonly key_id: string }>(
  signatures: readonly T[],
  keyset: Keyset | null,
  purpose: SigningKeyPurpose,
): T | null {
  const newestFirst = [...signatures].reverse();
  if (!keyset) return newestFirst[0] ?? null;
  return (
    newestFirst.find((signature) => isKeyActive(keyset, purpose, signature.key_id)) ??
    newestFirst.find((signature) => isKeyTrusted(keyset, purpose, signature.key_id)) ??
    null
  );
}
