import type { Permission } from '@etare/domain';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminView, allowedGroups } from './admin-view';

const state = { permissions: new Set<Permission>(), requested: null as string | null };

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => state.requested }),
}));
vi.mock('@/lib/queries', () => ({ usePermissions: () => state.permissions }));
vi.mock('@/providers/session-provider', () => ({ useSession: () => ({ ready: true }) }));
vi.mock('@/providers/tenant-provider', () => ({ useTenant: () => ({ loading: false }) }));
// Each section has its own tests: stubs here.
vi.mock('./members-admin', () => ({ MembersAdmin: () => <div data-testid="section-membres" /> }));
vi.mock('./sectors-admin', () => ({ SectorsAdmin: () => <div data-testid="section-secteurs" /> }));
vi.mock('./devices-admin', () => ({ DevicesAdmin: () => <div data-testid="section-terminaux" /> }));
vi.mock('./basemaps-admin', () => ({ BasemapsAdmin: () => <div data-testid="section-fonds" /> }));
vi.mock('./notifications-admin', () => ({ NotificationsAdmin: () => <div data-testid="section-notifications" /> }));
vi.mock('./access-journal-admin', () => ({ AccessJournalAdmin: () => <div data-testid="section-journal" /> }));
vi.mock('./settings-admin', () => ({ SettingsAdmin: () => <div data-testid="section-parametres" /> }));
vi.mock('./supervision-admin', () => ({ SupervisionAdmin: () => <div data-testid="section-supervision" /> }));
vi.mock('./exports-admin', () => ({ ExportsAdmin: () => <div data-testid="section-export" /> }));
vi.mock('./risk-catalog-admin', () => ({ RiskCatalogAdmin: () => <div data-testid="section-risques" /> }));

describe('allowedGroups', () => {
  it('keeps the groups holding at least one permitted section', () => {
    const groups = allowedGroups(new Set<Permission>(['audit:read']));
    expect(groups.map((group) => group.title)).toEqual(['Sécurité et exploitation']);
    expect(groups[0]?.sections.map((section) => section.key)).toEqual(['journal', 'supervision']);
    expect(allowedGroups(new Set<Permission>())).toEqual([]);
  });
});

describe('AdminView', () => {
  beforeEach(() => {
    state.permissions = new Set<Permission>(['member:manage', 'device:manage', 'catalog:manage', 'audit:read']);
    state.requested = null;
  });
  afterEach(cleanup);

  it('opens the first permitted section with its heading, and lists the others by theme', () => {
    render(<AdminView />);
    expect(screen.getByRole('heading', { level: 2, name: 'Membres' })).toBeTruthy();
    expect(screen.getByTestId('section-membres')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Sections de l’administration' });
    expect(nav.textContent).toContain('Personnes');
    expect(nav.textContent).toContain('Terrain');
    expect(nav.textContent).not.toContain('Export de réversibilité');
    expect(screen.getAllByRole('link', { name: 'Supervision' }).length).toBeGreaterThan(0);
  });

  it('follows the requested section when it is permitted, else falls back', () => {
    state.requested = 'supervision';
    const { unmount } = render(<AdminView />);
    expect(screen.getByRole('heading', { level: 2, name: 'Supervision' })).toBeTruthy();
    expect(screen.getByTestId('section-supervision')).toBeTruthy();
    unmount();
    state.requested = 'export';
    render(<AdminView />);
    expect(screen.getByRole('heading', { level: 2, name: 'Membres' })).toBeTruthy();
  });

  it('turns away a person without any administration permission', () => {
    state.permissions = new Set<Permission>(['site:read']);
    render(<AdminView />);
    expect(screen.getByText(/réservée à ses administrateurs/)).toBeTruthy();
  });
});
