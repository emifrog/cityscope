import { describe, expect, it } from 'vitest';
import { InvalidTransition, SelfApprovalForbidden } from './errors';
import {
  assertIndependentValidator,
  assertPublicationTransition,
  assertRevisionTransition,
  canTransitionPublication,
  canTransitionRevision,
  isPublicationContentFrozen,
} from './workflow';

describe('revision workflow', () => {
  it('follows draft -> submitted -> approved', () => {
    expect(canTransitionRevision('draft', 'submitted')).toBe(true);
    expect(canTransitionRevision('submitted', 'approved')).toBe(true);
    expect(canTransitionRevision('submitted', 'changes_requested')).toBe(true);
  });

  it('never approves a draft directly nor reopens a decided revision', () => {
    expect(() => assertRevisionTransition('draft', 'approved')).toThrow(InvalidTransition);
    expect(() => assertRevisionTransition('approved', 'draft')).toThrow(InvalidTransition);
    expect(() => assertRevisionTransition('changes_requested', 'submitted')).toThrow(InvalidTransition);
  });
});

describe('publication workflow', () => {
  it('builds before publishing and never goes back', () => {
    expect(canTransitionPublication('queued', 'building')).toBe(true);
    expect(canTransitionPublication('ready', 'published')).toBe(true);
    expect(() => assertPublicationTransition('published', 'building')).toThrow(InvalidTransition);
    expect(() => assertPublicationTransition('queued', 'published')).toThrow(InvalidTransition);
  });

  it('freezes the content once built', () => {
    expect(isPublicationContentFrozen('building')).toBe(false);
    expect(isPublicationContentFrozen('ready')).toBe(true);
    expect(isPublicationContentFrozen('published')).toBe(true);
    expect(isPublicationContentFrozen('withdrawn')).toBe(true);
  });
});

describe('separation of duties', () => {
  const revision = { createdBy: 'editor', submittedBy: 'editor', contributorIds: ['editor', 'colleague'] };

  it('accepts an independent validator', () => {
    expect(() => assertIndependentValidator('validator', revision)).not.toThrow();
  });

  it('rejects the author, the submitter and any contributor', () => {
    expect(() => assertIndependentValidator('editor', revision)).toThrow(SelfApprovalForbidden);
    expect(() => assertIndependentValidator('colleague', revision)).toThrow(SelfApprovalForbidden);
    expect(() =>
      assertIndependentValidator('submitter', { createdBy: 'a', submittedBy: 'submitter', contributorIds: [] }),
    ).toThrow(SelfApprovalForbidden);
  });
});
