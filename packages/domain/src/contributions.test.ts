import { describe, expect, it } from 'vitest';
import {
  CONTRIBUTION_TARGETS,
  CONTRIBUTION_TARGET_OPERATIONS,
  contributionCarriesValue,
  contributionNeedsTarget,
  nextContributionStatuses,
} from './contributions';

describe('proposals of the exploitants', () => {
  it('designate an element of the published version to change or remove it', () => {
    expect(contributionNeedsTarget('contact', 'update')).toBe(true);
    expect(contributionNeedsTarget('document', 'delete')).toBe(true);
    expect(contributionNeedsTarget('contact', 'create')).toBe(false);
    expect(contributionNeedsTarget('site', 'update')).toBe(false);
    expect(contributionNeedsTarget('other', 'create')).toBe(false);
  });

  it('carry structured values for contacts and the site only', () => {
    expect(contributionCarriesValue('contact', 'create')).toBe(true);
    expect(contributionCarriesValue('contact', 'delete')).toBe(false);
    expect(contributionCarriesValue('site', 'update')).toBe(true);
    expect(contributionCarriesValue('plan', 'update')).toBe(false);
  });

  it('allow every target at least one operation, the site and other information one only', () => {
    for (const target of CONTRIBUTION_TARGETS) expect(CONTRIBUTION_TARGET_OPERATIONS[target].length).toBeGreaterThan(0);
    expect(CONTRIBUTION_TARGET_OPERATIONS.site).toEqual(['update']);
    expect(CONTRIBUTION_TARGET_OPERATIONS.other).toEqual(['create']);
  });

  it('move forward only, and end with a final decision or a withdrawal', () => {
    expect(nextContributionStatuses('submitted')).not.toContain('submitted');
    expect(nextContributionStatuses('info_requested')).toContain('in_review');
    expect(nextContributionStatuses('in_review')).not.toContain('withdrawn');
    for (const final of ['accepted', 'partially_accepted', 'rejected', 'withdrawn'] as const) {
      expect(nextContributionStatuses(final)).toEqual([]);
    }
  });
});
