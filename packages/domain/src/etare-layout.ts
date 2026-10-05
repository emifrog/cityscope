import type { Criticality, ObjectCategory } from './objects';

/**
 * Sections of the ETARE (DEC-05, ADR-026): one registry for the preview, the
 * PDF and the tablet, in the order of the mockup (screen 05). The keys are
 * stable: they travel in the frozen snapshot and the tablet reads them.
 */
export const LAYOUT_SECTIONS = [
  'synthesis',
  'access',
  'risks',
  'water',
  'energy',
  'rescue',
  'plans',
  'contacts',
  'annexes',
  'photos',
] as const;
export type LayoutSection = (typeof LAYOUT_SECTIONS)[number];

/** Always shown: what the terrain needs first. */
export const MANDATORY_SECTIONS = ['synthesis', 'access', 'risks', 'water', 'contacts'] as const;
/** The SIS may hide these. Plans and annexes are hidden from the document only: the tablet keeps them. */
export const OPTIONAL_SECTIONS = ['energy', 'rescue', 'plans', 'annexes', 'photos'] as const;
export type OptionalSection = (typeof OPTIONAL_SECTIONS)[number];

const MANDATORY: ReadonlySet<LayoutSection> = new Set(MANDATORY_SECTIONS);

export const SECTION_TITLES: Readonly<Record<LayoutSection, string>> = {
  synthesis: 'Synthèse',
  access: 'Accès',
  risks: 'Risques',
  water: 'Eau',
  energy: 'Énergies',
  rescue: 'Moyens de secours',
  plans: 'Plans',
  contacts: 'Contacts',
  annexes: 'Annexes',
  photos: 'Photos',
};

/** Sections listing operational objects, and their categories. Annotations appear on the plans only. */
export const OBJECT_SECTIONS = ['access', 'risks', 'water', 'energy', 'rescue'] as const;
export type ObjectSection = (typeof OBJECT_SECTIONS)[number];

export const SECTION_CATEGORIES: Readonly<Record<ObjectSection, readonly ObjectCategory[]>> = {
  access: ['access'],
  // Objects of the "risk" category join the risks of the catalogue (ADR-026).
  risks: ['risk'],
  water: ['water'],
  energy: ['energy'],
  rescue: ['safety', 'smoke_control', 'refuge', 'vertical', 'communication'],
};

export function sectionOfCategory(category: ObjectCategory): ObjectSection | null {
  return OBJECT_SECTIONS.find((section) => SECTION_CATEGORIES[section].includes(category)) ?? null;
}

/** Sections shown by a frozen layout, frozen in the snapshot (absent: every section, as before DEC-05). */
export interface EtareLayout {
  readonly sections: readonly LayoutSection[];
}

/** Every mandatory section, in the order of the registry, without duplicates. */
export function isLayoutValid(layout: EtareLayout): boolean {
  const positions = layout.sections.map((section) => LAYOUT_SECTIONS.indexOf(section));
  return (
    positions.every((position, index) => position >= 0 && (index === 0 || position > (positions[index - 1] ?? -1))) &&
    MANDATORY_SECTIONS.every((section) => layout.sections.includes(section))
  );
}

/** Sections to show, in order. */
export function visibleSections(layout: EtareLayout | null | undefined): LayoutSection[] {
  if (!layout) return [...LAYOUT_SECTIONS];
  return LAYOUT_SECTIONS.filter((section) => MANDATORY.has(section) || layout.sections.includes(section));
}

/**
 * Layout to freeze for the setting of the SIS. Omitted when nothing is hidden,
 * so that the content (and its SHA-256) of a SIS that hides nothing stays the same.
 */
export function layoutFor(hidden: readonly OptionalSection[]): EtareLayout | null {
  const sections = LAYOUT_SECTIONS.filter(
    (section) => MANDATORY.has(section) || !(hidden as readonly string[]).includes(section),
  );
  return sections.length === LAYOUT_SECTIONS.length ? null : { sections };
}

const FOLDED: Readonly<Record<string, string>> = {
  à: 'a',
  â: 'a',
  ä: 'a',
  á: 'a',
  ç: 'c',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  î: 'i',
  ï: 'i',
  í: 'i',
  ô: 'o',
  ö: 'o',
  ó: 'o',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ú: 'u',
  ÿ: 'y',
  ñ: 'n',
  œ: 'oe',
  æ: 'ae',
};

/**
 * Lower-case key without French accents: the same order in TypeScript and on
 * the tablet (apps/mobile, ops_order.dart), whatever the collation of the runtime.
 */
export function sortKey(text: string): string {
  return [...text.toLowerCase()].map((character) => FOLDED[character] ?? character).join('');
}

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const CRITICALITY_RANK: Readonly<Record<Criticality, number>> = { critical: 0, important: 1, info: 2 };

interface SortableObject {
  readonly id: string;
  readonly criticality: Criticality;
  readonly label: string | null;
  readonly name: string | null;
  readonly type_name: string;
}

interface SortableRisk {
  readonly id: string;
  readonly severity: number;
  readonly label: string | null;
  readonly type_name: string;
}

/** Title in the lists: the full name first, the short label of the map otherwise (as on the tablet). */
export const objectTitle = (object: Pick<SortableObject, 'label' | 'name' | 'type_name'>) =>
  object.name ?? object.label ?? object.type_name;

/** Same order everywhere (ADR-026): criticality, then title, then identifier. */
export function compareObjects(left: SortableObject, right: SortableObject): number {
  return (
    CRITICALITY_RANK[left.criticality] - CRITICALITY_RANK[right.criticality] ||
    compareText(sortKey(objectTitle(left)), sortKey(objectTitle(right))) ||
    compareText(left.id, right.id)
  );
}

/** Severity first, then title, then identifier. */
export function compareRisks(left: SortableRisk, right: SortableRisk): number {
  return (
    right.severity - left.severity ||
    compareText(sortKey(left.label ?? left.type_name), sortKey(right.label ?? right.type_name)) ||
    compareText(left.id, right.id)
  );
}

/** Objects of a section, sorted. */
export function sectionObjects<T extends SortableObject & { readonly category: ObjectCategory }>(
  objects: readonly T[],
  section: ObjectSection,
): T[] {
  const categories = SECTION_CATEGORIES[section];
  return objects.filter((object) => categories.includes(object.category)).sort(compareObjects);
}

/** Photos of the PDF annex (ADR-026): a few per object, a ceiling per document. */
export const ANNEX_PHOTOS_PER_OBJECT = 4;
export const ANNEX_PHOTOS_MAX = 40;

export interface AnnexEntry<O, P> {
  readonly photo: P;
  readonly object: O;
  readonly section: ObjectSection;
}

type PhotoOf<O> = O extends { readonly photos?: readonly (infer P)[] | undefined } ? P : never;

export interface PhotoAnnex<O, P> {
  readonly entries: AnnexEntry<O, P>[];
  /** Photos of the content left out of the annex: consultable on the tablet. */
  readonly omitted: number;
}

/**
 * Photos of the annex, in the order of the sections and of their objects; null
 * when the photos section is hidden. The preview and the PDF use the same list.
 */
export function photoAnnex<
  O extends SortableObject & { readonly category: ObjectCategory; readonly photos?: readonly unknown[] | undefined },
>(objects: readonly O[], sections: readonly LayoutSection[]): PhotoAnnex<O, PhotoOf<O>> | null {
  if (!sections.includes('photos')) return null;
  const entries: AnnexEntry<O, PhotoOf<O>>[] = [];
  for (const section of OBJECT_SECTIONS) {
    if (!sections.includes(section)) continue;
    for (const object of sectionObjects(objects, section)) {
      for (const photo of ((object.photos ?? []) as readonly PhotoOf<O>[]).slice(0, ANNEX_PHOTOS_PER_OBJECT)) {
        if (entries.length < ANNEX_PHOTOS_MAX) entries.push({ photo, object, section });
      }
    }
  }
  const total = objects.reduce((sum, object) => sum + (object.photos?.length ?? 0), 0);
  return { entries, omitted: total - entries.length };
}
