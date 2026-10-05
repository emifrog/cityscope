import type { TenantSupervision } from '@etare/contracts';
import { describe, expect, it } from 'vitest';
import { formatDuration, noticesOf } from './supervision-admin';

const calm: TenantSupervision = {
  generated_at: '2026-10-28T10:00:00.000Z',
  publications: { in_force: 4, published_7d: 2, failed_7d: 0, stuck: 0, duration_p95_seconds_7d: 42 },
  devices: { active: 3, up_to_date: 3, late: 0, error: 0, never_synced: 0, holding_withdrawn: 0 },
  receipts_7d: { installed: 12, partial: 0, error: 0 },
  field_reports: { new: 0, oldest_new_at: null },
  files: { pending: 0, rejected_7d: 0, clean_bytes: 1_048_576 },
  notifications: { pending: 0, failed: 0 },
  basemaps: { ready: 2, failed: 0, renewal_due: 0 },
};

describe('supervision of the SIS (EXP-03)', () => {
  it('has nothing to say when nothing needs action', () => {
    expect(noticesOf(calm)).toEqual([]);
  });

  it('puts a blocked publication first, then what the administration can act upon', () => {
    const notices = noticesOf({
      ...calm,
      publications: { ...calm.publications, stuck: 1, failed_7d: 2 },
      devices: { ...calm.devices, late: 1, never_synced: 1, holding_withdrawn: 1 },
      notifications: { pending: 0, failed: 3 },
      field_reports: { new: 2, oldest_new_at: '2026-10-20T08:00:00.000Z' },
    });
    expect(notices.map((notice) => notice.tone)).toEqual([
      'critical',
      'important',
      'important',
      'important',
      'info',
      'info',
    ]);
    expect(notices[2]?.link?.href).toBe('/administration?onglet=terminaux');
    expect(notices[2]?.text).toContain('2 terminal(aux)');
    expect(notices.at(-1)?.text).toContain('le plus ancien reçu le 20/10/2026');
  });

  it('reads durations the way an administrator does', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(0.4)).toBe('moins d’1 s');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(9_000)).toBe('2,5 h');
  });
});
