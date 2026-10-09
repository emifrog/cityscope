import type { EtareSnapshot } from '@etare/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EtareDocument } from './etare-document';

// The photo annex needs the API for its images; no photo here.
vi.mock('@/lib/queries', () => ({ useAssetUrl: () => ({ data: undefined, isError: false }) }));

afterEach(cleanup);

const SITE = '06000002-0000-4000-8000-000000000001';
const BUILDING = '06000003-0000-4000-8000-000000000001';
const LEVEL = '06000004-0000-4000-8000-000000000001';
const SUBSTANCE = '06000008-0000-4000-8000-000000000001';
const FDS = '06000006-0000-4000-8000-000000000001';
const FDS_VERSION = '06000006-0000-4000-8000-000000000011';

const snapshot: EtareSnapshot = {
  schema_version: 1,
  site: {
    id: SITE,
    etare_number: '06-0428',
    name: 'EHPAD Les Oliviers',
    short_name: null,
    site_type: 'health',
    status: 'active',
    sensitivity: 'normal',
    address: {
      label: '12 avenue des Mimosas, 06000 Nice',
      city: 'Nice',
      postal_code: '06000',
      street: null,
      insee_code: null,
    },
    location: { type: 'Point', coordinates: [7.2518, 43.7079] },
    footprint: null,
  },
  classifications: [],
  buildings: [
    {
      id: BUILDING,
      name: 'Bâtiment A',
      code: null,
      sort_order: 0,
      construction_type: null,
      height_m: null,
      floors_above: null,
      floors_below: null,
      notes: null,
      footprint: null,
      levels: [{ id: LEVEL, label: 'Sous-sol', sort_order: 0, elevation_m: null }],
    },
  ],
  contacts: [],
  plans: [],
  zones: [],
  objects: [],
  risks: [],
  documents: [
    {
      id: FDS,
      category: 'fds',
      title: 'FDS acide chlorhydrique',
      offline_policy: 'on_demand',
      version: {
        id: FDS_VERSION,
        version_no: 1,
        valid_from: null,
        expires_at: null,
        asset: { id: 'a1', filename: 'fds.pdf', mime_type: 'application/pdf', size_bytes: 1000, sha256: 'x' },
      },
    },
  ],
  substances: [
    {
      id: SUBSTANCE,
      name: 'Acide chlorhydrique 33 %',
      hazard_classes: ['GHS05', 'GHS07'],
      un_number: '1789',
      physical_state: 'liquid',
      quantity: 200,
      unit: 'L',
      building_id: BUILDING,
      level_id: LEVEL,
      zone_id: null,
      location_note: 'Local de traitement d’eau',
      fds: { document_id: FDS, title: 'FDS acide chlorhydrique', version_id: FDS_VERSION },
    },
  ],
  catalog: { object_types: [], risk_types: [] },
};

describe('EtareDocument', () => {
  it('lists the hazardous substances with their sheet in the risks section', () => {
    render(<EtareDocument snapshot={snapshot} versionLabel="Aperçu" />);
    expect(screen.getByText('Matières dangereuses')).toBeTruthy();
    expect(screen.getByText('Acide chlorhydrique 33 %')).toBeTruthy();
    expect(screen.getByText('FDS : FDS acide chlorhydrique')).toBeTruthy();
    expect(screen.getByText('Corrosif')).toBeTruthy();
    expect(screen.getByText('Bâtiment A · Sous-sol · 200 L · Liquide · Local de traitement d’eau')).toBeTruthy();
    expect(screen.queryByText('Aucun risque déclaré.')).toBeNull();
  });

  it('names a substance without sheet', () => {
    const withoutSheet: EtareSnapshot = {
      ...snapshot,
      documents: [],
      substances: snapshot.substances?.map((substance) => ({ ...substance, fds: null })),
    };
    render(<EtareDocument snapshot={withoutSheet} versionLabel="Aperçu" />);
    expect(screen.getByText('FDS absente')).toBeTruthy();
  });
});
