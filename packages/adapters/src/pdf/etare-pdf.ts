import type { EtarePdfInput, EtarePdfRenderer, PlanImage } from '@etare/application';
import type { EtareSnapshot } from '@etare/contracts';
import {
  HAZARD_CLASS_LABELS,
  PHYSICAL_STATE_LABELS,
  SECTION_TITLES,
  compareObjects,
  compareRisks,
  objectTitle,
  photoAnnex,
  propertyDefinitions,
  sectionObjects,
  visibleSections,
  type LayoutSection,
  type ObjectCategory,
  type PhotoAnnex,
} from '@etare/domain';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import qrcode from 'qrcode-generator';

/**
 * ETARE PDF (ETARE-02) drawn from the frozen snapshot of a publication only:
 * every page says which published version it belongs to, when it was
 * published and the SHA-256 of the approved content. Standard PDF fonts
 * (WinAnsi): characters they cannot encode are replaced by their closest form.
 */
export const ETARE_PDF_TEMPLATE_VERSION = 'etare-pdf/5';

const PORTRAIT: [number, number] = [595.28, 841.89];
const LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 40;
const HEADER = 34;
const FOOTER = 38;

const hex = (value: string): RGB =>
  rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );

/** FireScape palette; the accent is the strong orange, readable as text on white. */
const COLORS = {
  navy: hex('#012b5c'),
  accent: hex('#c84300'),
  text: hex('#0f172a'),
  muted: hex('#475569'),
  border: hex('#cbd5e1'),
  critical: hex('#b91c1c'),
  criticalSoft: hex('#fee2e2'),
  white: rgb(1, 1, 1),
  zone: hex('#334155'),
};

/** Same palette as the web plans (apps/web/src/components/map/object-layers.ts). */
const CATEGORY_COLORS: Readonly<Record<ObjectCategory, RGB>> = {
  access: hex('#15803d'),
  water: hex('#1d4ed8'),
  energy: hex('#b45309'),
  safety: hex('#b91c1c'),
  smoke_control: hex('#7c3aed'),
  vertical: hex('#0f766e'),
  risk: hex('#be185d'),
  refuge: hex('#0891b2'),
  communication: hex('#475569'),
  annotation: hex('#64748b'),
};

const CATEGORY_NAMES: Readonly<Record<ObjectCategory, string>> = {
  access: 'Accès',
  water: 'Eau',
  energy: 'Énergie',
  safety: 'Sécurité incendie',
  smoke_control: 'Désenfumage',
  vertical: 'Circulations verticales',
  risk: 'Objets à risque',
  refuge: 'Refuges',
  communication: 'Communication',
  annotation: 'Annotations',
};

type SnapshotObject = EtareSnapshot['objects'][number];
type SnapshotPhoto = NonNullable<SnapshotObject['photos']>[number];

const SITE_TYPES: Readonly<Record<string, string>> = {
  erp: 'Établissement recevant du public',
  industrial: 'Industriel',
  health: 'Santé / médico-social',
  education: 'Enseignement',
  heritage: 'Patrimoine',
  other: 'Autre',
};

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
const when = (date: Date) => `${dateTime.format(date)} (heure de Paris)`;

type Position = readonly [number, number];
type LocalGeometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: readonly Position[] }
  | { type: 'Polygon'; coordinates: readonly (readonly Position[])[] };

/** Signs the standard fonts lack, written the way a reader expects. */
const REPLACEMENTS: Readonly<Record<string, string>> = {
  '≥': '>=',
  '≤': '<=',
  '→': '->',
  '←': '<-',
  '✓': 'v',
  '≠': '!=',
};

/** Keeps what WinAnsi can encode; decomposes the rest (O₂ -> O2, accents kept when possible). */
function encoderFor(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (text) =>
    [...text]
      .map((character) => {
        if (character === '\n' || supported.has(character.codePointAt(0) ?? 0)) return character;
        const replacement = REPLACEMENTS[character];
        if (replacement) return replacement;
        const simpler = character.normalize('NFKD').replace(/\p{M}/gu, '');
        return simpler && [...simpler].every((part) => supported.has(part.codePointAt(0) ?? 0)) ? simpler : '?';
      })
      .join('');
}

interface TextStyle {
  readonly size?: number;
  readonly bold?: boolean;
  readonly color?: RGB;
  readonly indent?: number;
  readonly gap?: number;
  /** Narrower flow, when a block drawn by hand takes the right of the page (QR code of the title). */
  readonly width?: number;
}

/** QR code of the site link on the first page (architecture §16): side, quiet zone and caption. */
const QR_SIDE = 76;
const QR_QUIET_MODULES = 4;
const QR_CAPTION = 'Scanner : ouvrir le site dans FireScape OPS';
/** Room kept free of text at the right of the title block, QR code and its caption. */
const QR_ZONE = QR_SIDE + 20;

/**
 * Draws the link as a QR code (error correction M, quiet zone of four modules) with its top-right
 * corner at (right, top); returns the bottom of the caption. Modules are plain rectangles: no image,
 * no font, the same whatever the viewer.
 */
function drawQr(page: PDFPage, text: string, right: number, top: number, font: PDFFont): number {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const modules = code.getModuleCount();
  const cell = QR_SIDE / (modules + 2 * QR_QUIET_MODULES);
  const left = right - QR_SIDE;
  page.drawRectangle({ x: left, y: top - QR_SIDE, width: QR_SIDE, height: QR_SIDE, color: COLORS.white });
  const origin = left + QR_QUIET_MODULES * cell;
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!code.isDark(row, column)) continue;
      page.drawRectangle({
        x: origin + column * cell,
        y: top - QR_QUIET_MODULES * cell - (row + 1) * cell,
        width: cell,
        height: cell,
        color: COLORS.text,
      });
    }
  }
  const captionY = top - QR_SIDE - 8;
  page.drawText(QR_CAPTION, {
    x: right - font.widthOfTextAtSize(QR_CAPTION, 6),
    y: captionY,
    size: 6,
    font,
    color: COLORS.muted,
  });
  return captionY - 2;
}

/** Flowing text over pages, with room kept for the header and the footer. */
class Writer {
  readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = 0;
  readonly encode: (text: string) => string;

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.encode = encoderFor(font);
    this.newPage();
  }

  newPage(size: [number, number] = PORTRAIT): PDFPage {
    this.page = this.doc.addPage(size);
    this.pages.push(this.page);
    this.y = this.page.getHeight() - MARGIN - HEADER;
    return this.page;
  }

  get current(): PDFPage {
    return this.page;
  }

  get cursor(): number {
    return this.y;
  }

  get width(): number {
    return this.page.getWidth() - 2 * MARGIN;
  }

  ensure(space: number): void {
    if (this.y - space < MARGIN + FOOTER) this.newPage();
  }

  /** Continues the flow below a block drawn by hand (grid of photos). */
  moveTo(y: number): void {
    this.y = y;
  }

  space(height: number): void {
    this.y -= height;
  }

  lines(text: string, font: PDFFont, size: number, width: number): string[] {
    const result: string[] = [];
    for (const paragraph of this.encode(text).split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          line = candidate;
          continue;
        }
        if (line) result.push(line);
        line = word;
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
          result.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      result.push(line);
    }
    return result;
  }

  text(text: string, style: TextStyle = {}): void {
    const size = style.size ?? 9.5;
    const font = style.bold ? this.bold : this.font;
    const indent = style.indent ?? 0;
    const leading = size * 1.3;
    for (const line of this.lines(text, font, size, (style.width ?? this.width) - indent)) {
      this.ensure(leading);
      this.y -= leading;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y + size * 0.25,
        size,
        font,
        color: style.color ?? COLORS.text,
      });
    }
    this.y -= style.gap ?? 0;
  }

  heading(title: string): void {
    this.ensure(40);
    this.y -= 12;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + this.width, y: this.y },
      thickness: 0.6,
      color: COLORS.border,
    });
    this.y -= 4;
    this.text(title.toUpperCase(), { size: 10.5, bold: true, color: COLORS.navy, gap: 3 });
  }
}

function scopeOf(snapshot: EtareSnapshot) {
  const buildings = new Map(snapshot.buildings.map((building) => [building.id, building.name]));
  const levels = new Map(
    snapshot.buildings.flatMap((building) => building.levels.map((level) => [level.id, level.label] as const)),
  );
  const zones = new Map(snapshot.zones.map((zone) => [zone.id, zone.name]));
  return (item: { building_id: string | null; level_id: string | null; zone_id: string | null }) =>
    [
      item.building_id ? buildings.get(item.building_id) : null,
      item.level_id ? levels.get(item.level_id) : null,
      item.zone_id ? zones.get(item.zone_id) : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Site';
}

function propertiesText(schema: unknown, values: Readonly<Record<string, unknown>>): string {
  return Object.entries(propertyDefinitions(schema))
    .flatMap(([name, definition]) => {
      const value = values[name];
      if (value === undefined || value === null || value === '') return [];
      const shown =
        typeof value === 'boolean'
          ? value
            ? 'oui'
            : 'non'
          : (definition.oneOf?.find((choice) => choice.const === value)?.title ?? String(value));
      return [`${definition.title ?? name} : ${shown}${definition.unit ? ` ${definition.unit}` : ''}`];
    })
    .join(' · ');
}

const svgPath = (geometry: LocalGeometry): string => {
  const path = (points: readonly Position[], close: boolean) =>
    points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') + (close ? ' Z' : '');
  if (geometry.type === 'LineString') return path(geometry.coordinates, false);
  if (geometry.type === 'Polygon') return geometry.coordinates.map((ring) => path(ring, true)).join(' ');
  return '';
};

function centroid(geometry: LocalGeometry): Position {
  const points =
    geometry.type === 'Point'
      ? [geometry.coordinates]
      : geometry.type === 'LineString'
        ? geometry.coordinates
        : (geometry.coordinates[0] ?? []);
  const count = Math.max(points.length, 1);
  return [points.reduce((sum, [x]) => sum + x, 0) / count, points.reduce((sum, [, y]) => sum + y, 0) / count];
}

/** One page per plan: its background and the zones, objects and risks placed on it. */
function drawPlan(
  writer: Writer,
  snapshot: EtareSnapshot,
  plan: EtareSnapshot['plans'][number],
  image: PDFImage,
): void {
  const { width, height } = plan.background;
  const page = writer.newPage(width > height ? LANDSCAPE : PORTRAIT);
  writer.text(`Plan — ${plan.title}`, { size: 12, bold: true, color: COLORS.navy });
  writer.text(`Fond n° ${plan.background.revision_no} · ${width} × ${height} px · plan non calibré (aucune mesure)`, {
    size: 8,
    color: COLORS.muted,
    gap: 6,
  });
  const legendHeight = 34;
  const boxTop = writer.cursor;
  const boxHeight = boxTop - MARGIN - FOOTER - legendHeight;
  const boxWidth = writer.width;
  const scale = Math.min(boxWidth / width, boxHeight / height);
  const left = MARGIN + (boxWidth - width * scale) / 2;
  const top = boxTop;
  const at = ([x, y]: Position) => ({ x: left + x * scale, y: top - y * scale });
  page.drawImage(image, { x: left, y: top - height * scale, width: width * scale, height: height * scale });
  page.drawRectangle({
    x: left,
    y: top - height * scale,
    width: width * scale,
    height: height * scale,
    borderColor: COLORS.border,
    borderWidth: 0.5,
  });

  const onPlan = (position: { plan_revision_id: string } | null) =>
    position?.plan_revision_id === plan.background.revision_id;
  const small = (text: string, [x, y]: Position, color: RGB) =>
    page.drawText(writer.encode(text), {
      x: at([x, y]).x + 5,
      y: at([x, y]).y - 3,
      size: 6.5,
      font: writer.bold,
      color,
    });

  for (const zone of snapshot.zones.filter((item) => onPlan(item.plan_position))) {
    const geometry = zone.plan_position?.geometry as LocalGeometry;
    page.drawSvgPath(svgPath(geometry), {
      x: left,
      y: top,
      scale,
      color: COLORS.zone,
      opacity: 0.08,
      borderColor: COLORS.zone,
      borderWidth: 0.8,
      borderDashArray: [3, 2],
    });
    const [cx, cy] = centroid(geometry);
    const label = writer.encode(zone.name);
    const labelWidth = writer.font.widthOfTextAtSize(label, 6);
    page.drawText(label, {
      x: at([cx, cy]).x - labelWidth / 2,
      y: at([cx, cy]).y + 4,
      size: 6,
      font: writer.font,
      color: COLORS.zone,
    });
  }
  const categories = new Set<ObjectCategory>();
  for (const object of snapshot.objects.filter((item) => onPlan(item.plan_position))) {
    const geometry = object.plan_position?.geometry as LocalGeometry;
    const color = CATEGORY_COLORS[object.category];
    categories.add(object.category);
    if (geometry.type === 'Point') {
      page.drawCircle({ ...at(geometry.coordinates), size: 3.6, color, borderColor: COLORS.white, borderWidth: 0.8 });
    } else {
      page.drawSvgPath(svgPath(geometry), {
        x: left,
        y: top,
        scale,
        ...(geometry.type === 'Polygon' ? { color, opacity: 0.2 } : {}),
        borderColor: color,
        borderWidth: geometry.type === 'LineString' ? 2 : 1,
      });
    }
    small(object.label ?? object.type_name, centroid(geometry), color);
  }
  let risks = 0;
  for (const risk of snapshot.risks.filter((item) => onPlan(item.plan_position))) {
    const geometry = risk.plan_position?.geometry as LocalGeometry;
    risks += 1;
    if (geometry.type === 'Polygon') {
      page.drawSvgPath(svgPath(geometry), {
        x: left,
        y: top,
        scale,
        color: COLORS.critical,
        opacity: 0.12,
        borderColor: COLORS.critical,
        borderWidth: 1,
        borderDashArray: [2, 1.5],
      });
    }
    const anchor = at(centroid(geometry));
    page.drawSvgPath('M 0 -6 L 6 0 L 0 6 L -6 0 Z', {
      x: anchor.x,
      y: anchor.y,
      color: COLORS.white,
      borderColor: COLORS.critical,
      borderWidth: 1.2,
    });
    page.drawText('!', { x: anchor.x - 1.2, y: anchor.y - 2.8, size: 7, font: writer.bold, color: COLORS.critical });
    small(risk.label ?? risk.type_name, centroid(geometry), COLORS.critical);
  }

  // Legend.
  let x = MARGIN;
  const y = MARGIN + FOOTER + 8;
  const entry = (draw: () => void, label: string) => {
    draw();
    const text = writer.encode(label);
    page.drawText(text, { x: x + 9, y: y - 3, size: 7, font: writer.font, color: COLORS.text });
    x += 20 + writer.font.widthOfTextAtSize(text, 7);
  };
  for (const category of categories) {
    const start = x;
    entry(
      () => page.drawCircle({ x: start + 3, y, size: 3, color: CATEGORY_COLORS[category] }),
      CATEGORY_NAMES[category],
    );
  }
  if (risks > 0) {
    const start = x;
    entry(
      () =>
        page.drawSvgPath('M 0 -4 L 4 0 L 0 4 L -4 0 Z', {
          x: start + 3,
          y,
          color: COLORS.white,
          borderColor: COLORS.critical,
          borderWidth: 1,
        }),
      'Risque',
    );
  }
  if (snapshot.zones.some((zone) => onPlan(zone.plan_position))) {
    const start = x;
    entry(
      () =>
        page.drawRectangle({
          x: start,
          y: y - 3,
          width: 7,
          height: 6,
          borderColor: COLORS.zone,
          borderWidth: 0.8,
          borderDashArray: [2, 1],
        }),
      'Zone',
    );
  }
}

/**
 * Annex of the photos (ADR-026): two columns, three rows per page, each photo
 * with its caption, its object and its section; what is left out is counted.
 */
function drawPhotoAnnex(
  writer: Writer,
  title: string,
  annex: PhotoAnnex<SnapshotObject, SnapshotPhoto>,
  images: ReadonlyMap<string, PDFImage | null>,
): void {
  writer.newPage();
  writer.heading(title);
  if (annex.entries.length === 0) writer.text('Aucune photo dans les sections affichées.', { color: COLORS.muted });
  const gutter = 16;
  const columns = 2;
  const cellWidth = (writer.width - gutter) / columns;
  const imageHeight = 170;
  const rowHeight = imageHeight + 44;
  const line = (text: string, size: number, bold: boolean) => {
    const font = bold ? writer.bold : writer.font;
    const [first = '', ...rest] = writer.lines(text, font, size, cellWidth);
    return rest.length > 0 ? `${first.slice(0, Math.max(first.length - 1, 1))}…` : first;
  };
  let top = writer.cursor - 6;
  annex.entries.forEach((entry, index) => {
    const column = index % columns;
    if (column === 0 && top - rowHeight < MARGIN + FOOTER) {
      writer.newPage();
      top = writer.cursor;
    }
    const page = writer.current;
    const x = MARGIN + column * (cellWidth + gutter);
    const image = images.get(entry.photo.id);
    if (image === undefined) throw new Error('PHOTO_UNAVAILABLE');
    page.drawRectangle({ x, y: top - imageHeight, width: cellWidth, height: imageHeight, color: hex('#f1f5f9') });
    if (image) {
      const scale = Math.min(cellWidth / image.width, imageHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: x + (cellWidth - width) / 2,
        y: top - imageHeight + (imageHeight - height) / 2,
        width,
        height,
      });
    } else {
      const text = writer.encode('Image illisible : voir la tablette');
      page.drawText(text, {
        x: x + (cellWidth - writer.font.widthOfTextAtSize(text, 8)) / 2,
        y: top - imageHeight / 2,
        size: 8,
        font: writer.font,
        color: COLORS.muted,
      });
    }
    const captions: [string, number, boolean, RGB][] = [
      [entry.photo.caption ?? 'Sans légende', 8, true, COLORS.text],
      [`${objectTitle(entry.object)} — ${entry.object.type_name}`, 7.5, false, COLORS.text],
      [SECTION_TITLES[entry.section], 7, false, COLORS.muted],
    ];
    captions.forEach(([text, size, bold, color], row) => {
      page.drawText(line(text, size, bold), {
        x,
        y: top - imageHeight - 11 - row * 10,
        size,
        font: bold ? writer.bold : writer.font,
        color,
      });
    });
    if (column === columns - 1 || index === annex.entries.length - 1) top -= rowHeight;
  });
  writer.moveTo(top);
  if (annex.omitted > 0) {
    writer.text(
      `${annex.omitted} autre${annex.omitted > 1 ? 's photos sont consultables' : ' photo est consultable'} sur la tablette, avec les fiches des points.`,
      { size: 8.5, color: COLORS.muted },
    );
  }
}

async function embed(doc: PDFDocument, image: PlanImage): Promise<PDFImage> {
  if (image.mimeType === 'image/png') return doc.embedPng(image.bytes);
  if (image.mimeType === 'image/jpeg') return doc.embedJpg(image.bytes);
  if (image.mimeType === 'image/webp') {
    // Lossless conversion of the checked WebP background (the PDF format has no WebP image).
    const { default: sharp } = await import('sharp');
    return doc.embedPng(await sharp(image.bytes).png().toBuffer());
  }
  throw new Error('PLAN_BACKGROUND_UNSUPPORTED');
}

export class PdfLibEtareRenderer implements EtarePdfRenderer {
  readonly templateVersion = ETARE_PDF_TEMPLATE_VERSION;

  async render({ publication, snapshot, planImages, photoImages, siteLink }: EtarePdfInput): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const writer = new Writer(doc, font, bold);
    const { site } = snapshot;
    const scope = scopeOf(snapshot);
    const objectTypes = new Map(snapshot.catalog.object_types.map((type) => [type.code, type]));
    const riskTypes = new Map(snapshot.catalog.risk_types.map((type) => [type.code, type]));
    const title = `ETARE ${site.etare_number ?? 'sans numéro'} — ${site.name}`;

    doc.setTitle(writer.encode(`${title} — version publiée n° ${publication.number}`));
    doc.setSubject('Établissement répertorié — version publiée');
    doc.setCreator('FireScape');
    doc.setProducer(`FireScape (${ETARE_PDF_TEMPLATE_VERSION})`);
    doc.setLanguage('fr-FR');
    doc.setCreationDate(publication.createdAt);
    doc.setModificationDate(publication.createdAt);

    // Title block and publication stamp; the QR code of the site at their right (no secret, no right).
    const width = siteLink ? writer.width - QR_ZONE : writer.width;
    const qrBottom = siteLink
      ? drawQr(writer.current, siteLink, MARGIN + writer.width, writer.cursor, font)
      : Number.POSITIVE_INFINITY;
    writer.text(`ETARE ${site.etare_number ?? 'sans numéro'}`, { size: 10, bold: true, color: COLORS.accent, width });
    writer.text(site.name, { size: 18, bold: true, color: COLORS.navy, gap: 2, width });
    writer.text(site.address?.label ?? 'Adresse non renseignée', { size: 10, color: COLORS.muted, gap: 8, width });
    writer.text(`VERSION PUBLIÉE N° ${publication.number} — ${when(publication.createdAt)}`, {
      size: 11,
      bold: true,
      color: COLORS.accent,
      width,
    });
    writer.text(
      `Révision n° ${publication.revisionNo} soumise par ${publication.submittedBy} le ${when(publication.submittedAt)}, validée par ${publication.approvedBy} le ${when(publication.approvedAt)}.`,
      { size: 8.5, color: COLORS.muted, width },
    );
    writer.text(`Empreinte du contenu validé (SHA-256) : ${publication.contentHash}`, {
      size: 7,
      color: COLORS.muted,
      width,
    });
    // The flow goes on under both the title block and the QR code.
    if (writer.cursor > qrBottom) writer.moveTo(qrBottom);

    const critical = [
      ...snapshot.risks
        .filter((risk) => risk.severity >= 4)
        .sort(compareRisks)
        .map((risk) => [risk.type_name, risk.label].filter(Boolean).join(' ')),
      ...snapshot.objects
        .filter((object) => object.criticality === 'critical')
        .sort(compareObjects)
        .map(objectTitle),
    ];
    const sections = visibleSections(snapshot.layout);
    let number = 1;
    const heading = (section: LayoutSection) => writer.heading(`${number++}. ${SECTION_TITLES[section]}`);
    const objectEntry = (object: SnapshotObject) => {
      writer.text(
        `${objectTitle(object)} — ${object.type_name}${object.criticality === 'critical' ? ' (critique)' : ''}${object.status !== 'active' ? ' — HORS SERVICE OU INCONNU' : ''}`,
        {
          bold: true,
          color: object.criticality === 'critical' ? COLORS.critical : COLORS.text,
        },
      );
      writer.text(
        [scope(object), object.plan_position ? 'sur plan' : object.geometry ? 'sur carte' : null]
          .filter(Boolean)
          .join(' · '),
        { size: 8, color: COLORS.muted, indent: 10 },
      );
      const fields = propertiesText(objectTypes.get(object.type_code)?.properties_schema, object.properties);
      if (fields) writer.text(fields, { size: 8, indent: 10 });
      if (object.instructions) writer.text(object.instructions, { size: 8.5, indent: 10 });
      writer.space(3);
    };

    for (const section of sections) {
      switch (section) {
        case 'synthesis': {
          heading(section);
          writer.text(`Type : ${SITE_TYPES[site.site_type] ?? site.site_type}`);
          for (const classification of snapshot.classifications) {
            writer.text(
              `${classification.classification_type.toUpperCase()} : ${[classification.code, classification.category && `${classification.category}e cat.`, classification.label].filter(Boolean).join(' · ')}`,
            );
          }
          writer.space(4);
          writer.text('POINTS CRITIQUES', { size: 8.5, bold: true, color: COLORS.critical });
          writer.text(critical.length > 0 ? critical.join(' • ') : 'Aucun point critique déclaré.', { gap: 2 });
          break;
        }
        case 'risks': {
          heading(section);
          const risks = [...snapshot.risks].sort(compareRisks);
          const riskObjects = sectionObjects(snapshot.objects, 'risks');
          const substances = snapshot.substances ?? [];
          if (risks.length === 0 && riskObjects.length === 0 && substances.length === 0) {
            writer.text('Aucun risque déclaré.', { color: COLORS.muted });
          }
          for (const risk of risks) {
            writer.text(`${risk.type_name}${risk.label ? ` — ${risk.label}` : ''} (gravité ${risk.severity})`, {
              bold: true,
              color: risk.severity >= 4 ? COLORS.critical : COLORS.text,
            });
            writer.text(
              [
                scope(risk),
                risk.quantity !== null ? `${risk.quantity} ${risk.unit ?? ''}`.trim() : null,
                risk.plan_position ? 'sur plan' : null,
                risk.geometry ? 'sur carte' : null,
              ]
                .filter(Boolean)
                .join(' · '),
              { size: 8, color: COLORS.muted, indent: 10 },
            );
            const fields = propertiesText(riskTypes.get(risk.type_code)?.properties_schema, risk.properties);
            if (fields) writer.text(fields, { size: 8, indent: 10 });
            if (risk.description) writer.text(risk.description, { size: 8.5, indent: 10 });
            writer.space(3);
          }
          riskObjects.forEach(objectEntry);
          // Hazardous substances (RISK-03): product, classes, quantity, location, and the sheet published with it.
          if (substances.length > 0) {
            writer.space(4);
            writer.text('MATIÈRES DANGEREUSES', { size: 8.5, bold: true, color: COLORS.navy });
          }
          for (const substance of substances) {
            writer.text(
              substance.quantity !== null
                ? `${substance.name} — ${substance.quantity} ${substance.unit ?? ''}`.trimEnd()
                : substance.name,
              { bold: true },
            );
            writer.text(
              [
                substance.hazard_classes.map((hazard) => HAZARD_CLASS_LABELS[hazard]).join(', ') || null,
                substance.un_number ? `ONU ${substance.un_number}` : null,
                substance.physical_state ? PHYSICAL_STATE_LABELS[substance.physical_state] : null,
                scope(substance),
                substance.location_note,
              ]
                .filter(Boolean)
                .join(' · '),
              { size: 8, color: COLORS.muted, indent: 10 },
            );
            writer.text(substance.fds ? `FDS : ${substance.fds.title}` : 'FDS absente de cette version', {
              size: 8,
              indent: 10,
              color: substance.fds ? COLORS.text : COLORS.critical,
            });
            writer.space(3);
          }
          break;
        }
        case 'access':
        case 'water':
        case 'energy':
        case 'rescue': {
          heading(section);
          const items = sectionObjects(snapshot.objects, section);
          if (items.length === 0) writer.text('Rien de déclaré.', { color: COLORS.muted });
          items.forEach(objectEntry);
          break;
        }
        case 'plans': {
          heading(section);
          for (const building of snapshot.buildings) {
            writer.text(
              `${building.name}${building.levels.length > 0 ? ` — niveaux : ${building.levels.map((level) => level.label).join(', ')}` : ''}`,
            );
          }
          for (const plan of snapshot.plans)
            writer.text(`${plan.title} (fond n° ${plan.background.revision_no}) : voir la page du plan.`, {
              size: 8.5,
            });
          if (snapshot.buildings.length === 0 && snapshot.plans.length === 0)
            writer.text('Aucun bâtiment ni plan.', { color: COLORS.muted });
          break;
        }
        case 'contacts': {
          heading(section);
          if (snapshot.contacts.length === 0) {
            writer.text('Aucun contact destiné aux intervenants.', { color: COLORS.muted });
          }
          for (const contact of snapshot.contacts) {
            writer.text(`${contact.name}${contact.role ? ` — ${contact.role}` : ''}`, { bold: true });
            writer.text([contact.phone, contact.phone_alt, contact.availability].filter(Boolean).join(' · '), {
              size: 9,
              indent: 10,
              gap: 2,
            });
          }
          break;
        }
        case 'annexes': {
          heading(section);
          if (snapshot.documents.length === 0) writer.text('Aucun document.', { color: COLORS.muted });
          for (const document of snapshot.documents) {
            writer.text(
              `${document.title} — version ${document.version.version_no} (${document.version.asset.filename})`,
              { size: 9 },
            );
          }
          break;
        }
        case 'photos':
          // At the end of the document, after the plan pages (ADR-026).
          break;
      }
    }

    if (sections.includes('plans')) {
      for (const plan of snapshot.plans) {
        const image = planImages.get(plan.background.revision_id);
        if (!image) throw new Error('PLAN_BACKGROUND_UNAVAILABLE');
        drawPlan(writer, snapshot, plan, await embed(doc, image));
      }
    }

    const annex = photoAnnex(snapshot.objects, sections);
    // No annex for a content without any photo; a mention when they all are elsewhere.
    if (annex && (annex.entries.length > 0 || annex.omitted > 0)) {
      const images = new Map<string, PDFImage | null>();
      for (const { photo } of annex.entries) {
        const image = photoImages.get(photo.id);
        if (image === undefined) throw new Error('PHOTO_UNAVAILABLE');
        images.set(photo.id, image && (await embed(doc, image)));
      }
      drawPhotoAnnex(writer, `${number++}. ${SECTION_TITLES.photos}`, annex, images);
    }

    // Header and footer on every page: which published version, when, and its fingerprint.
    const total = writer.pages.length;
    writer.pages.forEach((page, index) => {
      const width = page.getWidth();
      const height = page.getHeight();
      const header = writer.encode(title);
      page.drawText(header, { x: MARGIN, y: height - MARGIN + 4, size: 8, font: bold, color: COLORS.navy });
      const stamp = writer.encode(`VERSION PUBLIÉE N° ${publication.number}`);
      page.drawText(stamp, {
        x: width - MARGIN - bold.widthOfTextAtSize(stamp, 8),
        y: height - MARGIN + 4,
        size: 8,
        font: bold,
        color: COLORS.accent,
      });
      page.drawLine({
        start: { x: MARGIN, y: height - MARGIN },
        end: { x: width - MARGIN, y: height - MARGIN },
        thickness: 0.6,
        color: COLORS.border,
      });
      page.drawLine({
        start: { x: MARGIN, y: MARGIN + 20 },
        end: { x: width - MARGIN, y: MARGIN + 20 },
        thickness: 0.4,
        color: COLORS.border,
      });
      page.drawText(
        writer.encode(
          `Publiée le ${when(publication.createdAt)} · révision n° ${publication.revisionNo} · seule la version publiée la plus récente fait foi`,
        ),
        { x: MARGIN, y: MARGIN + 10, size: 6.5, font, color: COLORS.muted },
      );
      page.drawText(writer.encode(`Empreinte du contenu : ${publication.contentHash}`), {
        x: MARGIN,
        y: MARGIN + 2,
        size: 6,
        font,
        color: COLORS.muted,
      });
      const pageLabel = `Page ${index + 1} / ${total}`;
      page.drawText(pageLabel, {
        x: width - MARGIN - font.widthOfTextAtSize(pageLabel, 7),
        y: MARGIN + 10,
        size: 7,
        font,
        color: COLORS.muted,
      });
    });
    return doc.save();
  }
}
