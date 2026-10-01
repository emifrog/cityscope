import { describe, expect, it } from 'vitest';
import {
  APP_VERSION_PATTERN,
  EMPTY_BODY_SHA256,
  ENROLLMENT_CODE_ALPHABET,
  deviceRequestText,
  deviceState,
  enrollmentCodeFromBytes,
  enrollmentText,
  formatEnrollmentCode,
  isEd25519PublicKey,
  isAppVersionBelow,
  isEd25519Signature,
  isSafePackagePath,
  normalizeEnrollmentCode,
  signedText,
} from './distribution';

describe('enrollment codes', () => {
  it('maps every random byte onto the 32-symbol alphabet without bias', () => {
    expect(ENROLLMENT_CODE_ALPHABET).toHaveLength(32);
    const code = enrollmentCodeFromBytes(new Uint8Array([0, 31, 32, 255, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toHaveLength(12);
    expect(code.slice(0, 4)).toBe('A9A9');
    expect(() => enrollmentCodeFromBytes(new Uint8Array(4))).toThrow(RangeError);
  });

  it('accepts a code as typed on a tablet and rejects ambiguous characters', () => {
    expect(formatEnrollmentCode('ABCDEFGHJKLM')).toBe('ABCD-EFGH-JKLM');
    expect(normalizeEnrollmentCode(' abcd-efgh jklm ')).toBe('ABCDEFGHJKLM');
    expect(normalizeEnrollmentCode('ABCD-EFGH-JKL')).toBeNull();
    expect(normalizeEnrollmentCode('ABCD-EFGH-JKL0')).toBeNull();
    expect(normalizeEnrollmentCode('ABCD-EFGH-JKLI')).toBeNull();
  });
});

describe('signed texts', () => {
  it('prefix the content with what the signature is for', () => {
    expect(signedText('etare.catalog.v1', '{}')).toBe('etare.catalog.v1\n{}');
    expect(
      deviceRequestText({ method: 'get', path: '/api/v1/sync/catalog', timestamp: 42, bodySha256: EMPTY_BODY_SHA256 }),
    ).toBe(`etare.device-request.v1\nGET\n/api/v1/sync/catalog\n42\n${EMPTY_BODY_SHA256}`);
    expect(enrollmentText({ tenantId: 't', code: 'C', publicKey: 'K' })).toBe('etare.enrollment.v1\nt\nC\nK');
  });

  it('recognizes raw Ed25519 keys and signatures in base64', () => {
    expect(isEd25519PublicKey(`${'A'.repeat(43)}=`)).toBe(true);
    expect(isEd25519PublicKey('A'.repeat(44))).toBe(false);
    expect(isEd25519Signature(`${'A'.repeat(86)}==`)).toBe(true);
    expect(isEd25519Signature(`${'A'.repeat(85)}==`)).toBe(false);
  });
});

describe('package paths', () => {
  it('are relative, without traversal', () => {
    for (const path of ['data/site.json', 'plans/a.png', 'etare.pdf']) expect(isSafePackagePath(path)).toBe(true);
    for (const path of ['', '/etc/passwd', '../x', 'a/../b', 'a//b', 'a\\b', './a', 'a b', 'é.pdf']) {
      expect(isSafePackagePath(path)).toBe(false);
    }
  });
});

describe('terminal state', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it('distinguishes waiting, never synchronized, up to date, late and failing terminals', () => {
    const state = (input: Partial<Parameters<typeof deviceState>[0]>) =>
      deviceState({ status: 'active', lastSyncAt: null, lastSyncStatus: null, now, ...input });
    expect(state({ status: 'pending' })).toBe('pending');
    expect(state({ status: 'revoked', lastSyncAt: daysAgo(1), lastSyncStatus: 'installed' })).toBe('revoked');
    expect(state({})).toBe('never_synced');
    expect(state({ lastSyncAt: daysAgo(1), lastSyncStatus: 'installed' })).toBe('up_to_date');
    expect(state({ lastSyncAt: daysAgo(1), lastSyncStatus: 'partial' })).toBe('error');
    expect(state({ lastSyncAt: daysAgo(8), lastSyncStatus: 'installed' })).toBe('late');
  });
});

describe('minimum application version (SYN-02)', () => {
  it('compares x.y.z numerically and ignores a build suffix', () => {
    expect(isAppVersionBelow('0.1.0', '0.2.0')).toBe(true);
    expect(isAppVersionBelow('0.9.0', '0.10.0')).toBe(true);
    expect(isAppVersionBelow('1.0.0', '0.10.3')).toBe(false);
    expect(isAppVersionBelow('0.2.0', '0.2.0')).toBe(false);
    expect(isAppVersionBelow('0.2.0+15', '0.2.0')).toBe(false);
    expect(isAppVersionBelow('0.1.9-rc1', '0.2.0')).toBe(true);
  });

  it('does not judge an unknown or unreadable version', () => {
    expect(isAppVersionBelow(null, '0.2.0')).toBe(false);
    expect(isAppVersionBelow('0.1.0', null)).toBe(false);
    expect(isAppVersionBelow('dev', '0.2.0')).toBe(false);
    expect(APP_VERSION_PATTERN.test('0.2.0')).toBe(true);
    expect(APP_VERSION_PATTERN.test('0.2')).toBe(false);
  });
});
