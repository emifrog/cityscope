import type { Contribution } from '@etare/contracts';
import type { Permission } from '@etare/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContributionsList } from './contributions-list';

const state = {
  permissions: new Set<Permission>(),
  items: [] as Contribution[],
  openCount: 0,
  views: [] as string[],
};

vi.mock('@/lib/queries', () => ({
  usePermissions: () => state.permissions,
  useContributionPages: (view: string) => {
    state.views.push(view);
    return {
      data: { pages: [{ items: state.items, next_cursor: null, open_count: state.openCount }] },
      isPending: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: () => undefined,
    };
  },
}));

const contribution = (partial: Partial<Contribution>): Contribution =>
  ({
    id: '06000013-0000-4000-8000-000000000001',
    site_id: '06000002-0000-4000-8000-000000000001',
    site_name: 'EHPAD Les Oliviers',
    etare_number: '06-0428',
    author: { id: '00000000-0000-4000-b000-000000000005', name: 'Direction EHPAD', email: 'direction@oliviers.test' },
    target_type: 'contact',
    target_id: '127c79a8-bcfc-479f-876d-99fdff881f38',
    operation: 'update',
    title: 'Nouveau numéro du PC sécurité',
    description: 'Le standard de nuit a changé de ligne depuis le 1er octobre.',
    base_value: { phone: '01 99 00 12 34' },
    proposed_value: { phone: '01 99 00 56 78' },
    current_value: { phone: '01 99 00 12 34' },
    conflict: false,
    publication: { id: '0600000f-0000-4000-8000-000000000001', publication_number: 1 },
    current_publication_number: 1,
    status: 'submitted',
    assigned_to: null,
    decision_comment: null,
    conflict_resolution: null,
    decided_by: null,
    decided_at: null,
    created_at: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    messages: [],
    attachments: [],
    resolution: null,
    row_version: 1,
    ...partial,
  }) as Contribution;

describe('ContributionsList', () => {
  beforeEach(() => {
    state.permissions = new Set<Permission>(['contribution:review']);
    state.items = [];
    state.openCount = 0;
    state.views = [];
  });
  afterEach(cleanup);

  it('shows the proposals to instruct with their target, author and conflicts', () => {
    state.openCount = 2;
    state.items = [
      contribution({}),
      contribution({
        id: '06000013-0000-4000-8000-000000000002',
        target_type: 'other',
        operation: 'create',
        title: 'Aire de retournement',
        description: 'Nouvelle aire au nord.',
        conflict: true,
        status: 'in_review',
        assigned_to: { id: '00000000-0000-4000-b000-000000000002', name: 'Lt Dupont' },
        messages: [
          {
            id: '06000014-0000-4000-8000-000000000001',
            side: 'sis',
            kind: 'info_request',
            body: 'Pouvez-vous préciser ?',
            created_at: '2026-10-11T10:00:00.000Z',
            author: { id: '00000000-0000-4000-b000-000000000002', name: 'Lt Dupont' },
          },
        ],
      }),
    ];
    render(<ContributionsList />);
    expect(screen.getByText('2 à traiter')).toBeTruthy();
    expect(screen.getByText('Modification · Contact')).toBeTruthy();
    expect(screen.getByText('Ajout · Autre information')).toBeTruthy();
    expect(screen.getByText('Conflit')).toBeTruthy();
    expect(screen.getAllByText(/Proposée par Direction EHPAD il y a 5 heures/)).toHaveLength(2);
    expect(screen.getByText(/· 1 échange$/)).toBeTruthy();
    expect(screen.getByText('En cours d’examen')).toBeTruthy();
    expect(screen.getByText('Lt Dupont')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Instruire' })).toHaveLength(2);
  });

  it('switches the view and says when nothing waits', () => {
    render(<ContributionsList />);
    expect(screen.getByText('Aucune contribution à traiter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(state.views.at(-1)).toBe('all');
    expect(screen.getByText('Aucune contribution dans cette vue.')).toBeTruthy();
  });

  it('keeps the page to those who instruct', () => {
    state.permissions = new Set<Permission>(['site:read']);
    render(<ContributionsList />);
    expect(screen.getByText(/instruites par la Prévision/)).toBeTruthy();
  });
});
