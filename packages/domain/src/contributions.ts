/**
 * Proposals of the exploitants (POR-03, POR-04, ADR-019): an update proposed
 * on one of their sites, instructed by the Prévision. A proposal never changes
 * the working data nor a publication by itself: an accepted one is integrated
 * into a draft revision, validated by an independent validator.
 */

/** What a proposal is about: the site identity, an element shown on the portal, or another information. */
export const CONTRIBUTION_TARGETS = ['site', 'contact', 'plan', 'document', 'other'] as const;
export type ContributionTarget = (typeof CONTRIBUTION_TARGETS)[number];

export const CONTRIBUTION_OPERATIONS = ['create', 'update', 'delete'] as const;
export type ContributionOperation = (typeof CONTRIBUTION_OPERATIONS)[number];

/** Operations allowed on each target (the database enforces the same rules). */
export const CONTRIBUTION_TARGET_OPERATIONS: Readonly<Record<ContributionTarget, readonly ContributionOperation[]>> = {
  site: ['update'],
  contact: ['create', 'update', 'delete'],
  plan: ['create', 'update', 'delete'],
  document: ['create', 'update', 'delete'],
  other: ['create'],
};

/** A change or a removal designates an element of the published version; the site itself excepted. */
export function contributionNeedsTarget(target: ContributionTarget, operation: ContributionOperation): boolean {
  return operation !== 'create' && target !== 'site' && target !== 'other';
}

/** Targets whose proposals carry structured values (the others are described and documented). */
export function contributionCarriesValue(target: ContributionTarget, operation: ContributionOperation): boolean {
  return (target === 'contact' && operation !== 'delete') || target === 'site';
}

export const CONTRIBUTION_STATUSES = [
  'submitted',
  'in_review',
  'info_requested',
  'accepted',
  'partially_accepted',
  'rejected',
  'withdrawn',
] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export const OPEN_CONTRIBUTION_STATUSES: ReadonlySet<ContributionStatus> = new Set([
  'submitted',
  'in_review',
  'info_requested',
]);
export const FINAL_CONTRIBUTION_STATUSES: ReadonlySet<ContributionStatus> = new Set([
  'accepted',
  'partially_accepted',
  'rejected',
  'withdrawn',
]);
/** Decisions that integrate the proposal into a draft revision. */
export const ACCEPTED_CONTRIBUTION_STATUSES: ReadonlySet<ContributionStatus> = new Set([
  'accepted',
  'partially_accepted',
]);

/** Statuses the Prévision may give a proposal (withdrawal belongs to its author). */
export function nextContributionStatuses(status: ContributionStatus): readonly ContributionStatus[] {
  switch (status) {
    case 'submitted':
      return ['in_review', 'info_requested', 'accepted', 'partially_accepted', 'rejected'];
    case 'in_review':
      return ['info_requested', 'accepted', 'partially_accepted', 'rejected'];
    case 'info_requested':
      return ['in_review', 'accepted', 'partially_accepted', 'rejected'];
    default:
      return [];
  }
}

export const MAX_CONTRIBUTION_FILES = 5;
export const MAX_CONTRIBUTION_TITLE = 200;
export const MAX_CONTRIBUTION_DESCRIPTION = 4000;
export const MAX_CONTRIBUTION_MESSAGE = 4000;
export const MAX_CONTRIBUTION_DECISION = 2000;
/** Open proposals of one exploitant on one site. */
export const MAX_OPEN_CONTRIBUTIONS_PER_SITE = 20;
