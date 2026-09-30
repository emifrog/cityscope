import type { Contact, Document, OperationalObject, Plan, SiteDetail } from '@etare/contracts';
import { canonicalJson } from '@etare/domain';
import { describe, expect, it } from 'vitest';
import { buildSnapshot, compareSnapshots, preSubmissionChecks, type WorkingData } from './etare-snapshot';

const SITE = '06000002-0000-4000-8000-000000000001';
const NOW = new Date('2026-09-30T12:00:00Z');

const site: SiteDetail = {
  id: SITE,
  tenant_id: '06000000-0000-4000-8000-000000000000',
  name: 'EHPAD Les Oliviers',
  short_name: null,
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
  location: { type: 'Point', coordinates: [7.2518, 43.7079] },
  updated_at: '2026-09-30T10:00:00Z',
  footprint: null,
  last_verified_at: null,
  building_count: 1,
  active_publication: null,
  row_version: 3,
};

const asset = (id: string, status: 'clean' | 'pending' | 'rejected' = 'clean') => ({
  id,
  filename: `${id}.png`,
  mime_type: 'image/png',
  size_bytes: 1000,
  sha256: 'a'.repeat(64),
  scan_status: status,
  rejection_reason: null,
  created_at: '2026-09-30T10:00:00Z',
});

const plan = (id: string, status: 'clean' | 'pending' = 'clean'): Plan => ({
  id,
  site_id: SITE,
  building_id: 'b1',
  building_name: 'Bâtiment A',
  level_id: 'l1',
  level_label: 'RDC',
  plan_type: 'level',
  title: `Plan ${id}`,
  status: 'active',
  row_version: 1,
  revisions: [
    {
      id: `${id}-r2`,
      revision_no: 2,
      page_number: 1,
      width: 1600,
      height: 1000,
      local_unit: 'pixel',
      is_current: true,
      created_at: '2026-09-30T10:00:00Z',
      asset: asset(`${id}-a2`, status),
    },
  ],
});

const contact = (id: string, visibility: Contact['visibility'], verified: string | null): Contact => ({
  id,
  site_id: SITE,
  name: `Contact ${id}`,
  role: null,
  phone: '0491000000',
  phone_alt: null,
  email: null,
  availability: null,
  visibility,
  sort_order: 0,
  status: 'active',
  verified_at: verified,
  row_version: 1,
});

const object = (id: string, overrides: Partial<OperationalObject> = {}): OperationalObject => ({
  id,
  site_id: SITE,
  building_id: 'b1',
  level_id: 'l1',
  zone_id: null,
  object_type_id: 't1',
  type_code: 'PEI',
  type_name: 'Point d’eau incendie',
  category: 'water',
  name: null,
  label: id,
  geometry: null,
  plan_position: {
    plan_id: 'p1',
    plan_revision_id: 'p1-r2',
    revision_no: 2,
    is_current: true,
    geometry: { type: 'Point', coordinates: [10, 20] },
  },
  properties: {},
  instructions: null,
  criticality: 'info',
  status: 'active',
  verified_at: null,
  distance_m: null,
  row_version: 1,
  ...overrides,
});

const document = (id: string, status: 'clean' | 'pending'): Document => ({
  id,
  site_id: SITE,
  category: 'fds',
  title: `Document ${id}`,
  offline_policy: 'always',
  status: 'active',
  row_version: 1,
  versions: [
    {
      id: `${id}-v1`,
      version_no: 1,
      valid_from: null,
      expires_at: null,
      created_at: NOW.toISOString(),
      asset: asset(`${id}-a`, status),
    },
  ],
});

const data = (overrides: Partial<WorkingData> = {}): WorkingData => ({
  site,
  classifications: [],
  buildings: [
    {
      id: 'b1',
      site_id: SITE,
      name: 'Bâtiment A',
      code: null,
      status: 'active',
      sort_order: 0,
      construction_type: null,
      height_m: null,
      floors_above: null,
      floors_below: null,
      notes: null,
      footprint: null,
      row_version: 1,
      levels: [
        {
          id: 'l1',
          building_id: 'b1',
          label: 'RDC',
          sort_order: 0,
          elevation_m: null,
          status: 'active',
          row_version: 1,
        },
        {
          id: 'l2',
          building_id: 'b1',
          label: 'R+1',
          sort_order: 1,
          elevation_m: null,
          status: 'active',
          row_version: 1,
        },
      ],
    },
  ],
  contacts: [contact('c1', 'ops', '2026-06-01T00:00:00Z'), contact('c2', 'prevision', null)],
  plans: [plan('p1')],
  zones: [],
  objects: [object('o1'), object('o2', { status: 'archived' })],
  risks: [],
  documents: [document('d1', 'clean')],
  objectTypes: [
    {
      id: 't1',
      code: 'PEI',
      name: 'Point d’eau incendie',
      category: 'water',
      geometry_kind: 'point',
      icon_key: 'water-hydrant',
      properties_schema: { type: 'object' },
    },
  ],
  riskTypes: [],
  ...overrides,
});

describe('canonical snapshot', () => {
  it('keeps what the terrain may use, without working metadata', () => {
    const snapshot = buildSnapshot(data());
    expect(snapshot.contacts.map((item) => item.id)).toEqual(['c1']);
    expect(snapshot.objects.map((item) => item.id)).toEqual(['o1']);
    expect(snapshot.objects[0]?.plan_position).toEqual({
      plan_revision_id: 'p1-r2',
      geometry: { type: 'Point', coordinates: [10, 20] },
    });
    expect(snapshot.plans[0]?.background).toMatchObject({ revision_id: 'p1-r2', width: 1600 });
    expect(snapshot.buildings[0]?.levels.map((level) => level.label)).toEqual(['RDC', 'R+1']);
    expect(JSON.stringify(snapshot)).not.toContain('row_version');
  });

  it('does not depend on the order the records were read in', () => {
    const shuffled = data({ objects: [object('o2', { status: 'archived' }), object('o1'), object('o0')] });
    const ordered = data({ objects: [object('o0'), object('o1')] });
    expect(canonicalJson(buildSnapshot(shuffled))).toBe(canonicalJson(buildSnapshot(ordered)));
  });

  it('leaves out plans and documents whose files are not checked', () => {
    const snapshot = buildSnapshot(
      data({ plans: [plan('p1'), plan('p2', 'pending')], documents: [document('d2', 'pending')] }),
    );
    expect(snapshot.plans.map((item) => item.id)).toEqual(['p1']);
    expect(snapshot.documents).toEqual([]);
  });
});

describe('checks before submission', () => {
  const levelOf = (checks: ReturnType<typeof preSubmissionChecks>, code: string) =>
    checks.find((check) => check.code === code)?.level;

  it('passes a complete dossier, with warnings to read', () => {
    const checks = preSubmissionChecks(data(), NOW);
    expect(checks.filter((check) => check.level === 'error')).toEqual([]);
    expect(checks.find((check) => check.code === 'level_plans')).toMatchObject({
      level: 'warning',
      label: 'Plans de niveaux 1/2',
    });
    expect(levelOf(checks, 'contacts')).toBe('ok');
  });

  it('blocks a site without position, a pending file and items left on a replaced background', () => {
    const stale = object('o3', {
      plan_position: {
        plan_id: 'p1',
        plan_revision_id: 'p1-r1',
        revision_no: 1,
        is_current: false,
        geometry: { type: 'Point', coordinates: [1, 1] },
      },
    });
    const checks = preSubmissionChecks(
      data({ site: { ...site, location: null }, objects: [stale], documents: [document('d1', 'pending')] }),
      NOW,
    );
    expect(levelOf(checks, 'site_location')).toBe('error');
    expect(levelOf(checks, 'positions_to_replace')).toBe('error');
    expect(levelOf(checks, 'documents')).toBe('error');
  });

  it('asks to check contacts older than a year', () => {
    const checks = preSubmissionChecks(data({ contacts: [contact('c1', 'ops', '2025-01-01T00:00:00Z')] }), NOW);
    expect(levelOf(checks, 'contacts')).toBe('warning');
  });
});

describe('changes since the base publication', () => {
  it('lists added, removed and modified elements by identifier', () => {
    const base = buildSnapshot(data({ objects: [object('o1'), object('o9')] }));
    const next = buildSnapshot(
      data({
        objects: [object('o1', { label: 'PEI 1 bis' }), object('o5')],
        site: { ...site, name: 'EHPAD Les Oliviers (bâtiment neuf)' },
      }),
    );
    expect(compareSnapshots(base, next).map(({ section, id, change }) => `${section}:${id}:${change}`)).toEqual([
      'site:' + SITE + ':modified',
      'objects:o1:modified',
      'objects:o5:added',
      'objects:o9:removed',
    ]);
  });
});
