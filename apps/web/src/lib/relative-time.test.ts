import { describe, expect, it } from 'vitest';
import { agoLabel } from './relative-time';

const NOW = Date.parse('2026-10-09T10:00:00.000Z');

describe('agoLabel', () => {
  it('speaks French, from the instant to the years', () => {
    expect(agoLabel('2026-10-09T09:59:30.000Z', NOW)).toBe('à l’instant');
    expect(agoLabel('2026-10-09T09:45:00.000Z', NOW)).toBe('il y a 15 minutes');
    expect(agoLabel('2026-10-09T07:00:00.000Z', NOW)).toBe('il y a 3 heures');
    expect(agoLabel('2026-10-08T10:00:00.000Z', NOW)).toBe('hier');
    expect(agoLabel('2026-10-06T10:00:00.000Z', NOW)).toBe('il y a 3 jours');
    expect(agoLabel('2026-09-25T10:00:00.000Z', NOW)).toBe('il y a 2 semaines');
    expect(agoLabel('2026-07-09T10:00:00.000Z', NOW)).toBe('il y a 3 mois');
    expect(agoLabel('2024-10-09T10:00:00.000Z', NOW)).toBe('il y a 2 ans');
  });

  it('says nothing for an unreadable instant', () => {
    expect(agoLabel('pas une date', NOW)).toBe('');
  });
});
