import { describe, expect, it } from 'vitest';
import { verificationState } from './site-verification';

const NOW = Date.parse('2026-10-09T10:00:00.000Z');

describe('verificationState', () => {
  it('is verified within a year, stale after, never without a date', () => {
    expect(verificationState('2026-09-18T09:00:00.000Z', NOW)).toBe('verified');
    expect(verificationState('2025-10-10T10:00:00.000Z', NOW)).toBe('verified');
    expect(verificationState('2025-10-08T10:00:00.000Z', NOW)).toBe('stale');
    expect(verificationState(null, NOW)).toBe('never');
    expect(verificationState('pas une date', NOW)).toBe('never');
  });
});
