import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EtareSnapshot } from '@etare/contracts';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
  type PDFPage,
} from 'pdf-lib';
import sharp from 'sharp';
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

const PUBLICATION = {
  id: '0600000f-0000-4000-8000-000000000002',
  number: 2,
  revisionNo: 2,
  contentHash: 'c'.repeat(64),
  submittedBy: 'Rédacteur',
  submittedAt: new Date('2026-09-30T09:41:00Z'),
  approvedBy: 'Validateur',
  approvedAt: new Date('2026-09-30T11:00:00Z'),
  createdAt: new Date('2026-09-30T11:00:05Z'),
};

/** A stream object of the document (content or image). */
function streamAt(document: PDFDocument, ref: unknown): PDFRawStream {
  const stream = ref instanceof PDFRef ? document.context.lookup(ref) : ref;
  if (!(stream instanceof PDFRawStream)) throw new Error('Expected a PDF stream.');
  return stream;
}

/** Operators of a page, decoded. */
function contentOf(document: PDFDocument, page: PDFPage): string {
  const contents = page.node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => Buffer.from(decodePDFRawStream(streamAt(document, ref)).decode()).toString('latin1'))
    .join('\n');
}

/** Texts drawn on a page (standard fonts: WinAnsi hex strings). */
const textsOf = (content: string) =>
  [...content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((match) => Buffer.from(match[1] ?? '', 'hex').toString('latin1'));

/** The single image drawn on the page, with its dictionary and its stream. */
function imageOf(document: PDFDocument, page: PDFPage) {
  const images = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
  const keys = images?.keys() ?? [];
  expect(keys).toHaveLength(1);
  const [name] = keys;
  const stream = streamAt(document, name ? images?.get(name) : undefined);
  return { name: name?.asString() ?? '', stream };
}

describe('ETARE PDF', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'draws the validated %s background and every item placed on the plan',
    async (mimeType) => {
      const renderer = new PdfLibEtareRenderer();
      const image =
        mimeType === 'image/webp'
          ? await sharp(DEMO_PLAN).webp({ lossless: true }).toBuffer()
          : mimeType === 'image/jpeg'
            ? await sharp(DEMO_PLAN).jpeg().toBuffer()
            : DEMO_PLAN;
      const bytes = await renderer.render({
        publication: PUBLICATION,
        snapshot,
        planImages: new Map([[REVISION, { bytes: image, mimeType }]]),
        photoImages: new Map(),
      });
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      const document = await PDFDocument.load(bytes);
      expect(document.getPageCount()).toBe(2);
      expect(document.getTitle()).toBe('ETARE 06-0428 — EHPAD Les Oliviers — version publiée n° 2');
      expect(renderer.templateVersion).toBe(ETARE_PDF_TEMPLATE_VERSION);

      const plan = document.getPage(1);
      // The plan page is landscape (wider background).
      expect(plan.getWidth()).toBeGreaterThan(plan.getHeight());

      // Background: the validated image itself, at its size (JPEG kept as is, PNG and WebP pixel-exact).
      const background = imageOf(document, plan);
      expect(background.stream.dict.get(PDFName.of('Width'))?.toString()).toBe('1600');
      expect(background.stream.dict.get(PDFName.of('Height'))?.toString()).toBe('1000');
      if (mimeType === 'image/jpeg') {
        expect(Buffer.from(background.stream.contents).equals(image)).toBe(true);
      } else {
        const pixels = await sharp(DEMO_PLAN).raw().toBuffer();
        expect(Buffer.from(decodePDFRawStream(background.stream).decode()).equals(pixels)).toBe(true);
      }

      // Overlays drawn over the background: zone outline, object disc, risk diamond and their labels.
      const content = contentOf(document, plan);
      const drawn = content.indexOf(`${background.name} Do`);
      expect(drawn).toBeGreaterThan(-1);
      const overlays = content.slice(drawn);
      expect(overlays.match(/ c\n/g)?.length ?? 0).toBeGreaterThanOrEqual(4); // Bézier arcs of the object disc
      expect(overlays.match(/ l\n/g)?.length ?? 0).toBeGreaterThanOrEqual(7); // zone (4) and risk diamond (3) sides
      expect(textsOf(overlays)).toEqual(expect.arrayContaining(['Local technique', 'O2 >= 18 bouteilles', 'O2', '!']));
    },
  );

  it('refuses to render a plan without its background rather than leave it out', async () => {
    await expect(
      new PdfLibEtareRenderer().render({
        publication: PUBLICATION,
        snapshot,
        planImages: new Map(),
        photoImages: new Map(),
      }),
    ).rejects.toThrow('PLAN_BACKGROUND_UNAVAILABLE');
  });
});

/** Section headings of a page, in the order drawn. */
const headingsOf = (document: PDFDocument, index: number) =>
  textsOf(contentOf(document, document.getPage(index))).filter((text) => /^\d+\. /.test(text));

describe('sections of the ETARE PDF (MET-05)', () => {
  const plan = async () => new Map([[REVISION, { bytes: DEMO_PLAN, mimeType: 'image/png' }]]);

  it('follows the national registry and puts the risk objects under the risks', async () => {
    const bytes = await new PdfLibEtareRenderer().render({
      publication: PUBLICATION,
      snapshot,
      planImages: await plan(),
      photoImages: new Map(),
    });
    const document = await PDFDocument.load(bytes);
    expect(headingsOf(document, 0)).toEqual([
      '1. SYNTHÈSE',
      '2. ACCÈS',
      '3. RISQUES',
      '4. EAU',
      '5. ÉNERGIES',
      '6. MOYENS DE SECOURS',
      '7. PLANS',
      '8. CONTACTS',
      '9. ANNEXES',
    ]);
    const texts = textsOf(contentOf(document, document.getPage(0)));
    const risks = texts.indexOf('3. RISQUES');
    const water = texts.indexOf('4. EAU');
    const object = texts.findIndex((text) => text.startsWith('O2 >= 18 bouteilles'));
    expect(object).toBeGreaterThan(risks);
    expect(object).toBeLessThan(water);
  });

  it('leaves out the sections hidden by the SIS, plan pages included, and keeps the numbering', async () => {
    const bytes = await new PdfLibEtareRenderer().render({
      publication: PUBLICATION,
      snapshot: {
        ...snapshot,
        layout: { sections: ['synthesis', 'access', 'risks', 'water', 'rescue', 'contacts', 'annexes', 'photos'] },
      },
      planImages: new Map(),
      photoImages: new Map(),
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(headingsOf(document, 0)).toEqual([
      '1. SYNTHÈSE',
      '2. ACCÈS',
      '3. RISQUES',
      '4. EAU',
      '5. MOYENS DE SECOURS',
      '6. CONTACTS',
      '7. ANNEXES',
    ]);
  });

  it('ends with the annex of the photos, reduced images with their captions', async () => {
    const photo = await sharp(DEMO_PLAN).resize(400).jpeg().toBuffer();
    const [object] = snapshot.objects;
    if (!object) throw new Error('fixture');
    const withPhoto: EtareSnapshot = {
      ...snapshot,
      objects: [
        {
          ...object,
          photos: [
            {
              id: 'ph1',
              caption: 'Vanne de coupure',
              asset: { id: 'pa1', filename: 'vanne.jpg', mime_type: 'image/jpeg', size_bytes: 10, sha256: 'y' },
            },
          ],
        },
      ],
    };
    const render = (photoImages: Map<string, { bytes: Uint8Array; mimeType: string } | null>) =>
      new PdfLibEtareRenderer().render({
        publication: PUBLICATION,
        snapshot: withPhoto,
        planImages: new Map([[REVISION, { bytes: DEMO_PLAN, mimeType: 'image/png' }]]),
        photoImages,
      });
    const document = await PDFDocument.load(await render(new Map([['ph1', { bytes: photo, mimeType: 'image/jpeg' }]])));
    expect(document.getPageCount()).toBe(3);
    const texts = textsOf(contentOf(document, document.getPage(2)));
    expect(texts).toEqual(expect.arrayContaining(['10. PHOTOS', 'Vanne de coupure', 'Risques']));
    expect(imageOf(document, document.getPage(2)).stream.dict.get(PDFName.of('Width'))?.toString()).toBe('400');
    await expect(render(new Map())).rejects.toThrow('PHOTO_UNAVAILABLE');
    // A checked original that no decoder reads is said, not hidden.
    const unreadable = await PDFDocument.load(await render(new Map([['ph1', null]])));
    expect(textsOf(contentOf(unreadable, unreadable.getPage(2)))).toContain('Image illisible : voir la tablette');
  });
});
