import type { SiteDetail } from '@etare/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SiteHeader } from './site-header';

afterEach(cleanup);

const site: SiteDetail = {
  id: '06000002-0000-4000-8000-000000000001',
  tenant_id: '01000001-0000-4000-8000-000000000001',
  name: 'EHPAD Les Oliviers',
  short_name: 'Les Oliviers',
  status: 'active',
  site_type: 'health',
  sensitivity: 'normal',
  etare_number: '06-0428',
  address: {
    label: '12 avenue des Mimosas, 06000 Nice',
    city: 'Nice',
    postal_code: '06000',
    street: null,
    insee_code: null,
  },
  location: null,
  updated_at: '2026-10-09T14:02:00.000Z',
  footprint: null,
  last_verified_at: '2026-09-18T09:00:00.000Z',
  building_count: 2,
  active_publication: {
    id: '04000001-0000-4000-8000-000000000001',
    publication_number: 1,
    published_at: '2026-09-18T09:06:00.000Z',
  },
  archive: null,
  row_version: 3,
};

describe('SiteHeader', () => {
  it('names the site, its family, its number and its published version, with the way back', () => {
    render(<SiteHeader site={site} />);
    expect(screen.getByRole('heading', { level: 1, name: 'EHPAD Les Oliviers' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sites' }).getAttribute('href')).toBe('/sites');
    expect(screen.getByText('Les Oliviers')).toBeTruthy();
    expect(screen.getByText('12 avenue des Mimosas, 06000 Nice')).toBeTruthy();
    expect(screen.getByText('Version publiée n° 1')).toBeTruthy();
    expect(screen.getByText('Santé / médico-social')).toBeTruthy();
    expect(screen.getByText('N° ETARE 06-0428')).toBeTruthy();
    expect(screen.queryByText(/Sensibilité/)).toBeNull();
    expect(screen.queryByText('Actif')).toBeNull();
    expect(screen.getByRole('link', { name: /Dossier ETARE/ }).getAttribute('href')).toBe(
      `/sites/${site.id}?onglet=etare`,
    );
    expect(screen.getByRole('link', { name: /Sur la carte/ }).getAttribute('href')).toBe(
      '/carte?q=EHPAD%20Les%20Oliviers',
    );
  });

  it('flags a sensitive, inactive, unpublished or archived site', () => {
    const { unmount } = render(
      <SiteHeader site={{ ...site, sensitivity: 'restricted', status: 'draft', active_publication: null }} />,
    );
    expect(screen.getByText('Sensibilité restreinte')).toBeTruthy();
    expect(screen.getByText('Brouillon')).toBeTruthy();
    expect(screen.getByText('Aucune version publiée')).toBeTruthy();
    unmount();
    render(<SiteHeader site={{ ...site, archive: { archived_at: null, archived_by: null, reason: null } }} />);
    expect(screen.getByText('Site archivé')).toBeTruthy();
    expect(screen.queryByText(/Version publiée/)).toBeNull();
  });
});
