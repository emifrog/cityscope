import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EtareSnapshot } from '@etare/contracts';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { ETARE_PDF_TEMPLATE_VERSION, PdfLibEtareRenderer } from './etare-pdf';

const DEMO_PLAN = readFileSync(
  resolve(import.meta.dirname, '../../../../supabase/seed-assets/plan-batiment-a-rdc.png'),
);
const REVISION = '06000007-0000-4000-8000-000000000001';

const snapshot: EtareSnapshot = {
  schema_version: 1,
  site: {
    id: '06000002-0000-4000-8000-000000000001',
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
  buildings: [],
  contacts: [
    {
      id: 'c1',
      name: 'PC sécurité',
      role: 'Accueil de nuit',
      phone: '01 99 00 12 34',
      phone_alt: null,
      email: null,
      availability: '24/7',
      sort_order: 0,
      verified_at: null,
    },
  ],
  plans: [
    {
      id: 'p1',
      title: 'Bâtiment A - RDC',
      plan_type: 'level',
      building_id: null,
      level_id: null,
      background: {
        revision_id: REVISION,
        revision_no: 1,
        page_number: 1,
        width: 1600,
        height: 1000,
        asset: {
          id: 'a1',
          filename: 'plan.png',
          mime_type: 'image/png',
          size_bytes: DEMO_PLAN.byteLength,
          sha256: 'x',
        },
      },
    },
  ],
  zones: [
    {
      id: 'z1',
      level_id: 'l1',
      name: 'Local technique',
      zone_type: 'technical',
      plan_position: {
        plan_revision_id: REVISION,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [380, 250],
              [460, 250],
              [460, 330],
              [380, 330],
              [380, 250],
            ],
          ],
        },
      },
    },
  ],
  objects: [
    {
      id: 'o1',
      type_code: 'STOCKAGE_O2',
      type_name: 'Stockage oxygène',
      category: 'risk',
      name: null,
      label: 'O₂ ≥ 18 bouteilles',
      building_id: null,
      level_id: null,
      zone_id: 'z1',
      geometry: null,
      plan_position: { plan_revision_id: REVISION, geometry: { type: 'Point', coordinates: [412, 288] } },
      properties: { quantite: 18 },
      instructions: 'Ventiler le local.\nNe pas obstruer la vanne.',
      criticality: 'critical',
      status: 'active',
      verified_at: null,
    },
  ],
  risks: [
    {
      id: 'r1',
      type_code: 'OXYGENE',
      type_name: 'Oxygène',
      icon_key: 'risk-oxygen',
      severity: 4,
      label: 'O₂',
      description: null,
      quantity: 18,
      unit: 'bouteilles',
      properties: {},
      building_id: null,
      level_id: null,
      zone_id: null,
      plan_position: { plan_revision_id: REVISION, geometry: { type: 'Point', coordinates: [520, 290] } },
    },
  ],
  documents: [],
  catalog: {
    object_types: [
      {
        code: 'STOCKAGE_O2',
        name: 'Stockage oxygène',
        category: 'risk',
        icon_key: 'risk-oxygen',
        properties_schema: { type: 'object', properties: { quantite: { type: 'number', title: 'Quantité' } } },
      },
    ],
    risk_types: [],
  },
};

describe('ETARE PDF', () => {
  it('renders a stamped document with one page per plan, whatever the characters', async () => {
    const renderer = new PdfLibEtareRenderer();
    const bytes = await renderer.render({
      publication: {
        id: '0600000f-0000-4000-8000-000000000002',
        number: 2,
        revisionNo: 2,
        contentHash: 'c'.repeat(64),
        submittedBy: 'Rédacteur',
        submittedAt: new Date('2026-09-30T09:41:00Z'),
        approvedBy: 'Validateur',
        approvedAt: new Date('2026-09-30T11:00:00Z'),
        createdAt: new Date('2026-09-30T11:00:05Z'),
      },
      snapshot,
      planImages: new Map([[REVISION, { bytes: DEMO_PLAN, mimeType: 'image/png' }]]),
    });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(2);
    expect(document.getTitle()).toBe('ETARE 06-0428 — EHPAD Les Oliviers — version publiée n° 2');
    // The plan page is landscape (wider background).
    expect(document.getPage(1).getWidth()).toBeGreaterThan(document.getPage(1).getHeight());
    expect(renderer.templateVersion).toBe(ETARE_PDF_TEMPLATE_VERSION);
  });
});
