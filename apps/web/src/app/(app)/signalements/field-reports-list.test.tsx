import type { FieldReport } from '@etare/contracts';
import type { Permission } from '@etare/domain';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldReportsList } from './field-reports-list';

const state = {
  permissions: new Set<Permission>(),
  items: [] as FieldReport[],
  openCount: 0,
  views: [] as string[],
};

vi.mock('@/lib/queries', () => ({
  usePermissions: () => state.permissions,
  useFieldReportPages: (view: string) => {
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

const report = (partial: Partial<FieldReport>): FieldReport =>
  ({
    id: '06000012-0000-4000-8000-000000000001',
    site_id: '06000002-0000-4000-8000-000000000001',
    site_name: 'EHPAD Les Oliviers',
    etare_number: '06-0428',
    category: 'access',
    severity: 'urgent',
    description: 'Portail principal condamné par des travaux.',
    status: 'new',
    observed_at: '2026-10-11T08:00:00.000Z',
    received_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    reporter: { id: '00000000-0000-4000-a000-000000000004', name: 'Sgt Durand' },
    assigned_to: null,
    decision_comment: null,
    decided_by: null,
    decided_at: null,
    publication: { id: '0600000f-0000-4000-8000-000000000001', publication_number: 1 },
    current_publication_number: 1,
    item: {
      type: 'object',
      id: '06000009-0000-4000-8000-000000000009',
      label: 'Portail principal',
      current_status: 'active',
    },
    plan_position: null,
    photos: [],
    resolution: null,
    row_version: 1,
    ...partial,
  }) as FieldReport;

describe('FieldReportsList', () => {
  beforeEach(() => {
    state.permissions = new Set<Permission>(['field_report:review']);
    state.items = [];
    state.openCount = 0;
    state.views = [];
  });
  afterEach(cleanup);

  it('shows the reports to instruct with their severity, element and author', () => {
    state.openCount = 2;
    state.items = [
      report({}),
      report({
        id: '06000012-0000-4000-8000-000000000002',
        category: 'water',
        severity: 'important',
        status: 'triaged',
        assigned_to: { id: '02000001-0000-4000-8000-000000000001', name: 'Lt Dupont' },
        description: 'PEI masqué par un véhicule.',
        item: null,
      }),
    ];
    render(<FieldReportsList />);
    expect(screen.getByText('2 à traiter')).toBeTruthy();
    expect(screen.getByText('Portail principal condamné par des travaux.')).toBeTruthy();
    expect(screen.getByText(/Point : Portail principal · N° ETARE 06-0428 · version n° 1/)).toBeTruthy();
    expect(screen.getAllByText(/Signalé par Sgt Durand il y a 3 heures/)).toHaveLength(2);
    expect(screen.getByText('Urgent')).toBeTruthy();
    expect(screen.getByText('Pris en charge')).toBeTruthy();
    expect(screen.getByText('Lt Dupont')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Instruire' })).toHaveLength(2);
  });

  it('switches the view and says when the queue is empty', () => {
    render(<FieldReportsList />);
    expect(screen.getByText('Aucun signalement à traiter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Traités' }));
    expect(state.views.at(-1)).toBe('closed');
    expect(screen.getByText('Aucun signalement dans cette vue.')).toBeTruthy();
  });

  it('keeps the page to those who instruct', () => {
    state.permissions = new Set<Permission>(['site:read']);
    render(<FieldReportsList />);
    expect(screen.getByText(/instruits par la Prévision/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /À traiter/ })).toBeNull();
  });
});
