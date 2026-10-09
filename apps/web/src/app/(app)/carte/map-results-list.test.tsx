import type { MapSiteFeature } from '@etare/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapResultsList, sortedByName } from './map-results-list';

afterEach(cleanup);

const feature = (id: string, name: string, extra: Partial<MapSiteFeature['properties']> = {}): MapSiteFeature => ({
  type: 'Feature',
  id,
  geometry: { type: 'Point', coordinates: [7.25, 43.7] },
  properties: {
    name,
    site_type: 'health',
    status: 'active',
    etare_number: null,
    city: 'Nice',
    published: false,
    publication_number: null,
    verified_recently: false,
    ...extra,
  },
});

const ANTIBES = feature('06000002-0000-4000-8000-000000000002', 'Entrepôt Antibes', { site_type: 'industrial' });
const OLIVIERS = feature('06000002-0000-4000-8000-000000000001', 'EHPAD Les Oliviers', {
  published: true,
  publication_number: 1,
  etare_number: '06-0428',
});
const ECOLE = feature('06000002-0000-4000-8000-000000000003', 'École Émile Zola', { site_type: 'education' });

describe('MapResultsList', () => {
  it('sorts by name, French accents included', () => {
    expect(sortedByName([ECOLE, OLIVIERS, ANTIBES]).map((item) => item.properties.name)).toEqual([
      'École Émile Zola',
      'EHPAD Les Oliviers',
      'Entrepôt Antibes',
    ]);
  });

  it('lists the sites with their publication and hands the clicked one back', () => {
    const onSelect = vi.fn();
    render(
      <MapResultsList
        features={[ANTIBES, OLIVIERS]}
        selectedId={OLIVIERS.id}
        truncated={false}
        listLink="/sites"
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('2 sites')).toBeTruthy();
    expect(screen.getByText('Publié n° 1')).toBeTruthy();
    expect(screen.getByText('Non publié')).toBeTruthy();
    expect(screen.getByText('Santé / médico-social · Nice · n° 06-0428')).toBeTruthy();
    const selected = screen.getByRole('button', { pressed: true });
    expect(selected.textContent).toContain('EHPAD Les Oliviers');
    fireEvent.click(screen.getByRole('button', { name: /Entrepôt Antibes/ }));
    expect(onSelect).toHaveBeenCalledWith(ANTIBES);
  });

  it('says when the list is only what the map shows, and when nothing matches', () => {
    const { unmount } = render(
      <MapResultsList features={[ANTIBES]} selectedId={null} truncated={true} listLink="/sites" onSelect={() => {}} />,
    );
    expect(screen.getByText('dans la zone visible')).toBeTruthy();
    unmount();
    render(<MapResultsList features={[]} selectedId={null} truncated={false} listLink="/sites" onSelect={() => {}} />);
    expect(screen.getByText(/Aucun site positionné/)).toBeTruthy();
  });
});
