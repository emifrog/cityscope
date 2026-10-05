/**
 * Offline distribution rules (OFF-01 to OFF-04, ADMIN-02, architecture §10,
 * §11 and §19): terminals enrolled with their own Ed25519 key, publications
 * and catalogues signed by the server, requests proven by the terminal.
 * Everything signed is text (canonical JSON) prefixed with a context line, so
 * a signature made for one purpose can never be replayed for another.
 */

export const DEVICE_STATUSES = ['pending', 'active', 'revoked'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const DEVICE_PLATFORMS = ['android', 'ios'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Outcome of an installation reported by a terminal (receipt). */
export const SYNC_RECEIPT_STATUSES = ['installed', 'partial', 'error'] as const;
export type SyncReceiptStatus = (typeof SYNC_RECEIPT_STATUSES)[number];

/** Signature algorithm of manifests, catalogues and terminal proofs. */
export const SIGNATURE_ALGORITHM = 'Ed25519';

/** Version of the catalogue format read by the terminals. */
export const CATALOG_VERSION = 1;

/** Version x.y.z of the OPS application, as the server may require it (SYN-02). */
export const APP_VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/**
 * Whether a terminal runs an OPS application older than the minimum required
 * (SYN-02), comparing x.y.z numerically; a build suffix (`+12`, `-rc1`) is
 * ignored. An unknown or unreadable version is not judged: the terminal itself
 * refuses to install from a catalogue that requires a newer application.
 */
export function isAppVersionBelow(version: string | null, minimum: string | null): boolean {
  if (!version || !minimum) return false;
  const parts = (value: string) => /^(\d+)\.(\d+)\.(\d+)(?:[+-].*)?$/.exec(value)?.slice(1).map(Number) ?? null;
  const current = parts(version);
  const required = parts(minimum);
  if (!current || !required) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] !== required[index]) return (current[index] ?? 0) < (required[index] ?? 0);
  }
  return false;
}

/**
 * Local consultation right granted with each catalogue (architecture §19:
 * pilot proposal, to be settled by the RSSI and the operations directorate).
 */
export const OFFLINE_AUTHORIZATION_DAYS = 7;

/** A "restricted" site opened on demand stays consultable this long on the tablet (ADR-025). */
export const ON_DEMAND_ACCESS_HOURS = 24;

/** Longest habilitation to the sensitive sites, renewable (ADR-025, porteur 5 octobre 2026). */
export const SENSITIVE_HABILITATION_MAX_DAYS = 366;

/** An enrollment code is valid one day, once. */
export const ENROLLMENT_CODE_TTL_HOURS = 24;

/** Accepted gap between the clock of the terminal and the server for a signed request. */
export const DEVICE_PROOF_MAX_SKEW_MS = 5 * 60 * 1000;

/** Context lines: what a signature is for. */
export const SIGNATURE_CONTEXTS = {
  manifest: 'etare.manifest.v1',
  catalog: 'etare.catalog.v1',
  deviceRequest: 'etare.device-request.v1',
  enrollment: 'etare.enrollment.v1',
  basemap: 'etare.basemap.v1',
} as const;
export type SignatureContext = (typeof SIGNATURE_CONTEXTS)[keyof typeof SIGNATURE_CONTEXTS];

/** The exact text that is signed: the context line, then the content. */
export function signedText(context: SignatureContext, content: string): string {
  return `${context}\n${content}`;
}

/**
 * What a terminal signs for each synchronization request: method, path with
 * its query, its own clock (milliseconds) and the SHA-256 of the body.
 */
export function deviceRequestText(input: {
  readonly method: string;
  readonly path: string;
  readonly timestamp: number;
  readonly bodySha256: string;
}): string {
  return signedText(
    SIGNATURE_CONTEXTS.deviceRequest,
    [input.method.toUpperCase(), input.path, String(input.timestamp), input.bodySha256].join('\n'),
  );
}

/** What a terminal signs at enrollment: proof that it holds the private key of the public key it sends. */
export function enrollmentText(input: {
  readonly tenantId: string;
  readonly code: string;
  readonly publicKey: string;
}): string {
  return signedText(SIGNATURE_CONTEXTS.enrollment, [input.tenantId, input.code, input.publicKey].join('\n'));
}

/** SHA-256 of an empty body, sent by terminals for GET requests. */
export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Unambiguous alphabet (no I, O, 0, 1): 12 characters carry 60 random bits. */
export const ENROLLMENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ENROLLMENT_CODE_LENGTH = 12;

/** Builds a code from random bytes (one byte per character, 32 symbols: no modulo bias). */
export function enrollmentCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < ENROLLMENT_CODE_LENGTH) throw new RangeError('Not enough random bytes.');
  return [...bytes.subarray(0, ENROLLMENT_CODE_LENGTH)]
    .map((byte) => ENROLLMENT_CODE_ALPHABET[byte % ENROLLMENT_CODE_ALPHABET.length])
    .join('');
}

/** Code as typed on a tablet: case, spaces and dashes do not matter. Null when it cannot be a code. */
export function normalizeEnrollmentCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ENROLLMENT_CODE_LENGTH) return null;
  return [...code].every((character) => ENROLLMENT_CODE_ALPHABET.includes(character)) ? code : null;
}

/** Display form: ABCD-EFGH-JKLM. */
export function formatEnrollmentCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** Raw Ed25519 public key (32 bytes) in standard base64. */
export function isEd25519PublicKey(value: string): boolean {
  return /^[A-Za-z0-9+/]{43}=$/.test(value);
}

/** Ed25519 signature (64 bytes) in standard base64. */
export function isEd25519Signature(value: string): boolean {
  return /^[A-Za-z0-9+/]{86}==$/.test(value);
}

/**
 * Relative path of a file inside a package (architecture §10): no absolute
 * path, no traversal, no backslash, a small set of characters.
 */
export function isSafePackagePath(path: string): boolean {
  if (path.length === 0 || path.length > 200) return false;
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) return false;
  return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** A terminal without a receipt for this long is late (maquette, écran 11). */
export const DEVICE_LATE_AFTER_DAYS = 7;

/** How a terminal stands, as shown to the administration. */
export const DEVICE_STATES = ['pending', 'never_synced', 'up_to_date', 'late', 'error', 'revoked'] as const;
export type DeviceState = (typeof DEVICE_STATES)[number];

export function deviceState(input: {
  readonly status: DeviceStatus;
  readonly lastSyncAt: Date | null;
  readonly lastSyncStatus: SyncReceiptStatus | null;
  readonly now: Date;
}): DeviceState {
  if (input.status === 'revoked') return 'revoked';
  if (input.status === 'pending') return 'pending';
  if (!input.lastSyncAt) return 'never_synced';
  if (input.now.getTime() - input.lastSyncAt.getTime() > DEVICE_LATE_AFTER_DAYS * 86_400_000) return 'late';
  return input.lastSyncStatus === 'installed' ? 'up_to_date' : 'error';
}
