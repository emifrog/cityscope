/**
 * Security of the terminals (SEC-05, ADR-029): the key that proves the requests
 * of a tablet, and the lock policy the SIS sets for its fleet.
 */
import {
  OFFLINE_AUTHORIZATION_DAYS,
  SIGNATURE_CONTEXTS,
  isEd25519PublicKey,
  isEd25519Signature,
  signedText,
} from './distribution';

/**
 * Algorithms of the terminal key. `ed25519`: software key of the first tablets;
 * `ecdsa-p256`: key held by the Android Keystore, never extractable, which the
 * tablets move to by a rotation signed with their former key.
 */
export const DEVICE_KEY_ALGORITHMS = ['ed25519', 'ecdsa-p256'] as const;
export type DeviceKeyAlgorithm = (typeof DEVICE_KEY_ALGORITHMS)[number];

/** P-256 public key as exported by Android and Node: SubjectPublicKeyInfo (DER, 91 bytes), base64. */
const P256_SPKI = /^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{86}==$/;

/** Public key of a terminal in the encoding of its algorithm. */
export function isDevicePublicKey(algorithm: DeviceKeyAlgorithm, value: string): boolean {
  return algorithm === 'ed25519' ? isEd25519PublicKey(value) : P256_SPKI.test(value);
}

/** Signature of a terminal: raw Ed25519 (64 bytes), or ECDSA in DER (SHA-256, at most 72 bytes), base64. */
export function isDeviceSignature(algorithm: DeviceKeyAlgorithm, value: string): boolean {
  if (algorithm === 'ed25519') return isEd25519Signature(value);
  return value.length >= 12 && value.length <= 96 && value.length % 4 === 0 && /^M[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * What the new key signs at a rotation, the request itself being signed by the
 * current key: the server so learns that the terminal holds both.
 */
export function deviceKeyRotationText(input: {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly algorithm: DeviceKeyAlgorithm;
  readonly publicKey: string;
}): string {
  return signedText(
    SIGNATURE_CONTEXTS.deviceKey,
    [input.tenantId, input.deviceId, input.algorithm, input.publicKey].join('\n'),
  );
}

/**
 * Lock and session policy of the tablets of a SIS (SEC-05), carried by the signed
 * catalogue: the tablet applies the one of its last synchronisation.
 */
export interface TerminalPolicy {
  /** The application locks after this many minutes without a touch. */
  readonly idle_lock_minutes: number;
  /** Seconds the application may stay in the background before it locks (0: at once). */
  readonly background_lock_seconds: number;
  /** Screenshots and the preview in the recent applications. */
  readonly screenshots_allowed: boolean;
  /** Days an agent may go without signing in again with their password. */
  readonly max_days_without_login: number;
  /** Local consultation right granted with each catalogue (architecture §19). */
  readonly offline_authorization_days: number;
}

/** Bounds of each setting: an administrator cannot leave the tablets unlocked for good. */
export const TERMINAL_POLICY_BOUNDS = {
  idle_lock_minutes: { min: 1, max: 60 },
  background_lock_seconds: { min: 0, max: 600 },
  max_days_without_login: { min: 1, max: 90 },
  offline_authorization_days: { min: 1, max: 14 },
} as const;

/** Policy of a SIS that set none (porteur, 7 octobre 2026). */
export const DEFAULT_TERMINAL_POLICY: TerminalPolicy = {
  idle_lock_minutes: 5,
  background_lock_seconds: 0,
  screenshots_allowed: false,
  max_days_without_login: 30,
  offline_authorization_days: OFFLINE_AUTHORIZATION_DAYS,
};

/** What is wrong with a policy (empty: valid). */
export function terminalPolicyProblems(policy: TerminalPolicy): string[] {
  const problems: string[] = [];
  for (const [name, bounds] of Object.entries(TERMINAL_POLICY_BOUNDS)) {
    const value = policy[name as keyof typeof TERMINAL_POLICY_BOUNDS];
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      problems.push(`${name} : entier entre ${bounds.min} et ${bounds.max} attendu.`);
    }
  }
  return problems;
}

/**
 * The policy a SIS applies: what it set, each missing or unreadable setting
 * replaced by its default (a SIS that set nothing gets the defaults).
 */
export function completeTerminalPolicy(stored: Partial<TerminalPolicy> | null | undefined): TerminalPolicy {
  const policy: { -readonly [K in keyof TerminalPolicy]: TerminalPolicy[K] } = { ...DEFAULT_TERMINAL_POLICY };
  if (!stored) return policy;
  for (const [name, bounds] of Object.entries(TERMINAL_POLICY_BOUNDS) as [
    keyof typeof TERMINAL_POLICY_BOUNDS,
    { min: number; max: number },
  ][]) {
    const value = stored[name];
    if (typeof value === 'number' && Number.isInteger(value) && value >= bounds.min && value <= bounds.max) {
      policy[name] = value;
    }
  }
  if (typeof stored.screenshots_allowed === 'boolean') policy.screenshots_allowed = stored.screenshots_allowed;
  return policy;
}
