import { describe, expect, it } from 'vitest';
import { DEFAULT_RATE_LIMITS, clientAddress, originAllowed, rateLimitKey, securityAction } from './network';

describe('client address', () => {
  it('is unknown without a trusted proxy (the header may come from the client)', () => {
    expect(clientAddress('203.0.113.7', 0)).toBeNull();
    expect(clientAddress(undefined, 1)).toBeNull();
  });

  it('is the entry appended by the trusted proxies, whatever the client sent before', () => {
    expect(clientAddress('6.6.6.6, 203.0.113.7', 1)).toBe('203.0.113.7');
    expect(clientAddress('6.6.6.6, 203.0.113.7, 10.0.0.2', 2)).toBe('203.0.113.7');
    expect(clientAddress('2001:db8::1', 1)).toBe('2001:db8::1');
    expect(clientAddress('<script>', 1)).toBeNull();
  });
});

describe('origins', () => {
  it('accepts the own origin of the API and the configured ones only', () => {
    expect(originAllowed('http://localhost:3000', 'http://localhost:3000/api/v1/me', [])).toBe(true);
    expect(originAllowed('https://evil.example', 'http://localhost:3000/api/v1/me', [])).toBe(false);
    expect(
      originAllowed('https://admin.sdis06.fr', 'https://firescape.fr/api/v1/me', ['https://admin.sdis06.fr']),
    ).toBe(true);
    expect(originAllowed('null', 'http://localhost:3000/api/v1/me', [])).toBe(false);
  });
});

describe('rate limit keys', () => {
  it('hash the rule and the caller: nothing is stored in clear', () => {
    const key = rateLimitKey(DEFAULT_RATE_LIMITS.recovery, 'person', 'subject-1');
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toBe(rateLimitKey(DEFAULT_RATE_LIMITS.enrollment, 'person', 'subject-1'));
  });
});

describe('security events', () => {
  it('trace sensitive refusals, rejected codes only where they matter', () => {
    expect(securityAction('MFA_REQUIRED', 'listSites', true)).toBe('security.mfa_required');
    expect(securityAction('VALIDATION_FAILED', 'enrollDevice', true)).toBe('security.enrollment_refused');
    expect(securityAction('VALIDATION_FAILED', 'createSite', true)).toBeNull();
    expect(securityAction('UNAUTHENTICATED', 'getMe', false)).toBeNull();
    expect(securityAction('UNAUTHENTICATED', 'getMe', true)).toBe('security.session_refused');
    expect(securityAction('NOT_FOUND', 'getSite', true)).toBeNull();
  });
});
