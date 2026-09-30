import { InvalidTransition, SelfApprovalForbidden } from './errors';

/**
 * Two separate state machines (ADR-005), mirrored by SQL triggers:
 * a revision is the candidate content validated by the SIS, a publication is
 * the immutable artefact built from an approved revision and distributed to
 * OPS terminals.
 */
export const REVISION_STATUSES = ['draft', 'submitted', 'approved', 'changes_requested', 'superseded'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

const REVISION_TRANSITIONS: Readonly<Record<RevisionStatus, readonly RevisionStatus[]>> = {
  draft: ['submitted', 'superseded'],
  submitted: ['approved', 'changes_requested'],
  approved: ['superseded'],
  changes_requested: [],
  superseded: [],
};

export const PUBLICATION_STATUSES = [
  'queued',
  'building',
  'ready',
  'published',
  'superseded',
  'withdrawn',
  'failed',
] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

const PUBLICATION_TRANSITIONS: Readonly<Record<PublicationStatus, readonly PublicationStatus[]>> = {
  queued: ['building', 'failed'],
  building: ['ready', 'failed'],
  ready: ['published', 'superseded'],
  published: ['superseded', 'withdrawn'],
  superseded: [],
  withdrawn: [],
  failed: [],
};

export function canTransitionRevision(from: RevisionStatus, to: RevisionStatus): boolean {
  return REVISION_TRANSITIONS[from].includes(to);
}

export function assertRevisionTransition(from: RevisionStatus, to: RevisionStatus): void {
  if (!canTransitionRevision(from, to)) throw new InvalidTransition(from, to);
}

export function canTransitionPublication(from: PublicationStatus, to: PublicationStatus): boolean {
  return PUBLICATION_TRANSITIONS[from].includes(to);
}

export function assertPublicationTransition(from: PublicationStatus, to: PublicationStatus): void {
  if (!canTransitionPublication(from, to)) throw new InvalidTransition(from, to);
}

/** A built publication never changes: any correction produces a new publication. */
export function isPublicationContentFrozen(status: PublicationStatus): boolean {
  return status === 'ready' || status === 'published' || status === 'superseded' || status === 'withdrawn';
}

export interface RevisionAuthorship {
  readonly createdBy: string;
  readonly submittedBy: string | null;
  readonly contributorIds: readonly string[];
}

/**
 * Separation of duties: the validator must not have contributed to the
 * revision, even when they also hold the editor role.
 */
export function assertIndependentValidator(validatorId: string, revision: RevisionAuthorship): void {
  if (
    validatorId === revision.createdBy ||
    validatorId === revision.submittedBy ||
    revision.contributorIds.includes(validatorId)
  ) {
    throw new SelfApprovalForbidden();
  }
}
