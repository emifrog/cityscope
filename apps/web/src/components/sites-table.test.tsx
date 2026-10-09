import type { SiteSummary } from '@etare/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SitesTable } from './sites-table';

afterEach(cleanup);

const NOW = Date.parse('2026-10-09T10:00:00.000Z');

const site = (partial: Partial<SiteSummary>): SiteSummary => ({
  id: '06000002-0000-4000-8000-000000000001',
  tenant_id: '01000001-0000-4000-8000-000000000001',
  name: 'EHPAD Les Oliviers',
  short_name: null,
  status: 'active',
  site_type: 'health',
  sensitivity: 'normal',
  etare_number: '06-0428',
  address: { label: '12 avenue des Mimosas, 06000 Nice', city: 'Nice', postal_code: '06000' },
  location: { type: 'Point', coordinates: [7.25, 43.7] },
  updated_at: '2026-10-06T10:00:00.000Z',
  ...partial,
});

describe('SitesTable', () => {
  it('names each site with its address, state and freshness, flags the sensitive and unplaced ones', () => {
    render(
      <SitesTable
        sites={[
          site({}),
          site({
            id: '06000002-0000-4000-8000-000000000002',
            name: 'Dépôt restreint',
            sensitivity: 'restricted',
            address: { label: '3 chemin du Port, 06600 Antibes', city: 'Antibes', postal_code: '06600' },
            location: null,
            status: 'draft',
            etare_number: null,
            updated_at: '2026-10-09T09:00:00.000Z',
          }),
        ]}
        now={NOW}
      />,
    );
    expect(screen.getByRole('link', { name: 'EHPAD Les Oliviers' }).getAttribute('href')).toBe(
      '/sites/06000002-0000-4000-8000-000000000001',
    );
    expect(screen.getByText('12 avenue des Mimosas, 06000 Nice')).toBeTruthy();
    expect(screen.getByText('il y a 3 jours')).toBeTruthy();
    expect(screen.getByText('il y a 1 heure')).toBeTruthy();
    expect(screen.getByText('Restreinte')).toBeTruthy();
    expect(screen.getByText('Sans position')).toBeTruthy();
    expect(screen.getByText('Brouillon')).toBeTruthy();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });
});
