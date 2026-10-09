import type { EtareCheck, EtareRevision } from '@etare/contracts';

export type StepState = 'done' | 'current' | 'todo' | 'blocked';

export interface RevisionStep {
  readonly key: 'draft' | 'validation' | 'publication';
  readonly label: string;
  readonly state: StepState;
  /** What is happening at the current step, when something is. */
  readonly note: string | null;
}

/**
 * Where the dossier stands in its cycle: writing, validation, publication. `open` is the draft or
 * submitted revision, `latest` the newest revision whatever its status, `published` whether a
 * version is in force.
 */
export function revisionSteps(
  open: EtareRevision | undefined,
  latest: EtareRevision | undefined,
  published: boolean,
): readonly RevisionStep[] {
  const step = (key: RevisionStep['key'], label: string, state: StepState, note: string | null = null) => ({
    key,
    label,
    state,
    note,
  });
  if (open?.status === 'draft') {
    return [
      step('draft', 'Rédaction', 'current', `Révision n° ${open.revision_no} en cours`),
      step('validation', 'Validation', 'todo'),
      step('publication', 'Publication', 'todo'),
    ];
  }
  if (open?.status === 'submitted') {
    return [
      step('draft', 'Rédaction', 'done'),
      step('validation', 'Validation', 'current', 'En attente d’un validateur'),
      step('publication', 'Publication', 'todo'),
    ];
  }
  const publication = latest?.status === 'approved' ? latest.publication : null;
  if (publication?.status === 'queued' || publication?.status === 'building') {
    return [
      step('draft', 'Rédaction', 'done'),
      step('validation', 'Validation', 'done'),
      step('publication', 'Publication', 'current', 'Fabrication en cours'),
    ];
  }
  if (publication?.status === 'failed') {
    return [
      step('draft', 'Rédaction', 'done'),
      step('validation', 'Validation', 'done'),
      step('publication', 'Publication', 'blocked', 'Fabrication en échec'),
    ];
  }
  if (latest?.status === 'changes_requested') {
    return [
      step('draft', 'Rédaction', 'blocked', 'Corrections demandées'),
      step('validation', 'Validation', 'todo'),
      step('publication', 'Publication', 'todo'),
    ];
  }
  if (published) {
    return [
      step('draft', 'Rédaction', 'done'),
      step('validation', 'Validation', 'done'),
      step('publication', 'Publication', 'done', 'Version diffusée'),
    ];
  }
  return [
    step('draft', 'Rédaction', 'todo', latest ? null : 'Aucune révision'),
    step('validation', 'Validation', 'todo'),
    step('publication', 'Publication', 'todo'),
  ];
}

export interface CheckSummary {
  readonly ok: number;
  readonly warning: number;
  readonly error: number;
}

/** How many checks pass, deserve a look, or block the submission. */
export function summarizeChecks(checks: readonly EtareCheck[]): CheckSummary {
  const summary = { ok: 0, warning: 0, error: 0 };
  for (const check of checks) summary[check.level] += 1;
  return summary;
}
