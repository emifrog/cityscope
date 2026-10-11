import type { EtareDossier } from '@etare/contracts';

export type DossierStage = 'to_validate' | 'changes_requested' | 'in_progress' | 'published' | 'none';

export interface DossierStageInfo {
  readonly stage: DossierStage;
  readonly label: string;
  /** Colour of the mark beside the label, as a Tailwind background class. */
  readonly dot: string;
}

const STAGES: Readonly<Record<DossierStage, Omit<DossierStageInfo, 'stage'>>> = {
  to_validate: { label: 'À valider', dot: 'bg-important' },
  changes_requested: { label: 'Corrections demandées', dot: 'bg-critical' },
  in_progress: { label: 'En préparation', dot: 'bg-info' },
  published: { label: 'Publié', dot: 'bg-success' },
  none: { label: 'Sans version publiée', dot: 'bg-border' },
};

/**
 * Where a dossier stands, in one word: what the latest revision waits for when one is open,
 * else whether a version is in force. Mirrors the states of the list filter.
 */
export function dossierStage(dossier: EtareDossier): DossierStageInfo {
  const status = dossier.latest_revision?.status;
  const stage: DossierStage =
    status === 'submitted'
      ? 'to_validate'
      : status === 'changes_requested'
        ? 'changes_requested'
        : status === 'draft'
          ? 'in_progress'
          : dossier.active_publication
            ? 'published'
            : 'none';
  return { stage, ...STAGES[stage] };
}
