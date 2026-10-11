import type { Permission } from '@etare/domain';
import type { ValidationQueueItem } from '@etare/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationsList } from './validations-list';

const state = { permissions: new Set<Permission>(), queue: [] as ValidationQueueItem[] };

vi.mock('@/lib/queries', () => ({
  usePermissions: () => state.permissions,
  useValidations: () => ({ data: state.queue, isPending: false, error: null }),
}));

const item = (partial: Partial<ValidationQueueItem>): ValidationQueueItem => ({
  revision_id: '05000001-0000-4000-8000-000000000001',
  site_id: '06000002-0000-4000-8000-000000000001',
  site_name: 'EHPAD Les Oliviers',
  etare_number: '06-0428',
  revision_no: 2,
  change_summary: 'Nouvelle colonne sèche et contact de nuit.',
  submitted_by: { id: '02000001-0000-4000-8000-000000000001', name: 'Lt Dupont' },
  submitted_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  base_publication_number: 1,
  ...partial,
});

describe('ValidationsList', () => {
  beforeEach(() => {
    state.permissions = new Set<Permission>(['etare:read', 'etare:approve']);
    state.queue = [];
  });
  afterEach(cleanup);

  it('says when nothing waits', () => {
    render(<ValidationsList />);
    expect(screen.getByText('Aucune révision en attente de validation.')).toBeTruthy();
    expect(screen.queryByText(/en attente$/)).toBeNull();
  });

  it('lists what waits, with the summary, the submitter and a long wait flagged', () => {
    state.queue = [
      item({}),
      item({
        revision_id: '05000001-0000-4000-8000-000000000002',
        site_name: 'Entrepôt Antibes',
        etare_number: null,
        change_summary: null,
        base_publication_number: null,
        submitted_at: new Date(Date.now() - 12 * 86_400_000).toISOString(),
      }),
    ];
    render(<ValidationsList />);
    expect(screen.getByText('2 révisions en attente')).toBeTruthy();
    expect(screen.getByText('Nouvelle colonne sèche et contact de nuit.')).toBeTruthy();
    expect(screen.getByText(/Soumise par Lt Dupont il y a 3 jours/)).toBeTruthy();
    expect(screen.getByText(/Sans n° ETARE · révision n° 2 · première version/)).toBeTruthy();
    expect(screen.getByText('Sans résumé des changements.')).toBeTruthy();
    expect(screen.getAllByText('En attente depuis plus de 7 jours')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Contrôler' })).toHaveLength(2);
  });

  it('lets a reader look without deciding', () => {
    state.permissions = new Set<Permission>(['etare:read']);
    state.queue = [item({})];
    render(<ValidationsList />);
    expect(screen.getByText(/seuls les validateurs du SIS décident/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Contrôler' })).toBeNull();
  });
});
