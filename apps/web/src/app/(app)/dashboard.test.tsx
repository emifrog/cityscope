import type { Permission } from '@etare/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dashboard } from './dashboard';

const state = {
  permissions: new Set<Permission>(),
  counts: null as null | {
    sites: number;
    published: number;
    unpublished: number;
    to_validate: number;
    in_progress: number;
  },
  queue: [] as unknown[],
  reports: { items: [] as unknown[], next_cursor: null, open_count: 0 },
  contributions: { items: [] as unknown[], next_cursor: null, open_count: 0 },
};

const ready = <T,>(data: T) => ({ data, isPending: false, error: null });

vi.mock('@/lib/queries', () => ({
  usePermissions: () => state.permissions,
  useSites: () => ready({ pages: [{ items: sites, next_cursor: null }] }),
  useEtareCounts: (wanted: boolean) => (wanted ? ready(state.counts) : ready(undefined)),
  useValidations: (wanted: boolean) => (wanted ? ready(state.queue) : ready(undefined)),
  useFieldReports: (_: unknown, wanted: boolean) => (wanted ? ready(state.reports) : ready(undefined)),
  useContributions: (_: unknown, wanted: boolean) => (wanted ? ready(state.contributions) : ready(undefined)),
}));
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({
    me: { user: { display_name: 'Cne Martin', email: 'validateur06@demo.etare.test' } },
    activeTenant: { tenant_id: 't1', tenant_name: 'SDIS DEMO 06', roles: ['PREVISION_VALIDATOR'] },
    loading: false,
    error: null,
  }),
}));

const sites = [
  {
    id: '06000002-0000-4000-8000-000000000001',
    tenant_id: 't1',
    name: 'EHPAD Les Oliviers',
    short_name: null,
    status: 'active',
    site_type: 'healthcare',
    sensitivity: 'normal',
    etare_number: '06-0428',
    address: { city: 'Nice' },
    location: null,
    updated_at: '2026-10-01T08:00:00.000Z',
  },
  {
    id: '06000002-0000-4000-8000-000000000002',
    tenant_id: 't1',
    name: 'Entrepôt logistique Démo Antibes',
    short_name: null,
    status: 'draft',
    site_type: 'industrial',
    sensitivity: 'normal',
    etare_number: null,
    address: { city: 'Antibes' },
    location: null,
    updated_at: '2026-10-08T08:00:00.000Z',
  },
];

describe('Dashboard', () => {
  beforeEach(() => {
    state.permissions = new Set<Permission>(['site:read', 'etare:read', 'field_report:review', 'contribution:review']);
    state.counts = { sites: 2, published: 1, unpublished: 1, to_validate: 0, in_progress: 1 };
    state.queue = [];
    state.reports = { items: [], next_cursor: null, open_count: 0 };
    state.contributions = { items: [], next_cursor: null, open_count: 0 };
  });
  afterEach(cleanup);

  it('greets the person, shows the figures of the SIS and says when nothing waits', () => {
    render(<Dashboard />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bonjour, Cne Martin' })).toBeTruthy();
    expect(screen.getByText(/SDIS DEMO 06/)).toBeTruthy();
    expect(screen.getByText('Sites suivis')).toBeTruthy();
    expect(screen.getByText('sur 2 sites')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Couverture ETARE' }).getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getAllByText('Rien en attente')).toHaveLength(3);
    expect(screen.getByText(/Rien à traiter pour le moment/)).toBeTruthy();
    // Most recently modified first.
    const names = screen.getAllByRole('link', { name: /EHPAD|Entrepôt/ }).map((link) => link.textContent ?? '');
    expect(names[0]).toContain('Entrepôt logistique Démo Antibes');
    expect(screen.getByText('En cours de rédaction')).toBeTruthy();
  });

  it('lists what waits for a decision, the urgent ones flagged', () => {
    state.queue = [
      {
        revision_id: '05000001-0000-4000-8000-000000000001',
        site_id: sites[0]?.id,
        site_name: 'EHPAD Les Oliviers',
        etare_number: '06-0428',
        revision_no: 3,
        change_summary: 'Nouvelle colonne sèche',
        submitted_by: { id: 'u1', name: 'Lt Dupont' },
        submitted_at: '2026-10-07T08:00:00.000Z',
        base_publication_number: 2,
      },
    ];
    state.reports = {
      items: [
        {
          id: '08000001-0000-4000-8000-000000000001',
          site_name: 'EHPAD Les Oliviers',
          category: 'access',
          severity: 'urgent',
          description: 'Portail condamné',
          received_at: '2026-10-08T08:00:00.000Z',
        },
      ],
      next_cursor: null,
      open_count: 4,
    };
    render(<Dashboard />);
    expect(screen.getByText('Révisions à valider')).toBeTruthy();
    expect(screen.getByText(/Révision n° 3 soumise par Lt Dupont · Nouvelle colonne sèche/)).toBeTruthy();
    expect(screen.getByText('Signalements du terrain')).toBeTruthy();
    expect(screen.getByText('Urgent')).toBeTruthy();
    expect(screen.getByText(/Accès · Portail condamné/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tout voir' }).getAttribute('href')).toBe('/signalements');
    expect(screen.queryByText(/Rien à traiter/)).toBeNull();
    expect(screen.queryByText('Contributions des exploitants')).toBeNull();
  });

  it('shows a reader only what the role allows', () => {
    state.permissions = new Set<Permission>(['site:read']);
    render(<Dashboard />);
    expect(screen.getByText('Sites suivis')).toBeTruthy();
    expect(screen.queryByText('ETARE publiés')).toBeNull();
    expect(screen.queryByText('À valider')).toBeNull();
    expect(screen.queryByText('À faire')).toBeNull();
    expect(screen.queryByText('Dossiers ETARE')).toBeNull();
    expect(screen.queryByRole('link', { name: /Nouveau site/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /Carte/ }).length).toBeGreaterThan(0);
  });
});
