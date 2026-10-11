import type { EtareDossier } from '@etare/contracts';
import { describe, expect, it } from 'vitest';
import { dossierStage } from './dossier-stage';

const dossier = (partial: Partial<EtareDossier>): EtareDossier => ({
  site_id: '06000002-0000-4000-8000-000000000001',
  site_name: 'EHPAD Les Oliviers',
  etare_number: '06-0428',
  active_publication: null,
  latest_revision: null,
  ...partial,
});

const revision = (status: NonNullable<EtareDossier['latest_revision']>['status']) => ({
  id: '05000001-0000-4000-8000-000000000001',
  revision_no: 2,
  status,
  updated_at: '2026-10-09T08:00:00.000Z',
});

const published = { publication_number: 1, published_at: '2026-09-18T09:06:00.000Z' };

describe('dossierStage', () => {
  it('names what the open revision waits for before the published state', () => {
    expect(dossierStage(dossier({ active_publication: published, latest_revision: revision('submitted') })).stage).toBe(
      'to_validate',
    );
    expect(dossierStage(dossier({ active_publication: published, latest_revision: revision('draft') })).stage).toBe(
      'in_progress',
    );
    expect(dossierStage(dossier({ latest_revision: revision('changes_requested') })).stage).toBe('changes_requested');
  });

  it('falls back to the version in force, or its absence', () => {
    expect(
      dossierStage(dossier({ active_publication: published, latest_revision: revision('approved') })),
    ).toMatchObject({ stage: 'published', label: 'Publié' });
    expect(
      dossierStage(dossier({ active_publication: published, latest_revision: revision('superseded') })).stage,
    ).toBe('published');
    expect(dossierStage(dossier({})).label).toBe('Sans version publiée');
  });
});
