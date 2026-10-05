import { describe, expect, it } from 'vitest';
import {
  ANNEX_PHOTOS_MAX,
  ANNEX_PHOTOS_PER_OBJECT,
  LAYOUT_SECTIONS,
  compareObjects,
  compareRisks,
  isLayoutValid,
  layoutFor,
  photoAnnex,
  sectionObjects,
  sectionOfCategory,
  sortKey,
  visibleSections,
} from './etare-layout';
import type { Criticality, ObjectCategory } from './objects';

const object = (
  id: string,
  category: ObjectCategory,
  criticality: Criticality,
  label: string | null,
  photos: string[] = [],
) => ({ id, category, criticality, label, name: null, type_name: 'Type', photos });

describe('ETARE sections (ADR-026)', () => {
  it('shows every section without a frozen layout, as before DEC-05', () => {
    expect(visibleSections(undefined)).toEqual([...LAYOUT_SECTIONS]);
    expect(visibleSections(null)[0]).toBe('synthesis');
  });

  it('freezes nothing when nothing is hidden, so the content hash stays the same', () => {
    expect(layoutFor([])).toBeNull();
  });

  it('keeps the national order and the mandatory sections', () => {
    const layout = layoutFor(['energy', 'photos']);
    expect(layout?.sections).toEqual([
      'synthesis',
      'access',
      'risks',
      'water',
      'rescue',
      'plans',
      'contacts',
      'annexes',
    ]);
    expect(layout && isLayoutValid(layout)).toBe(true);
    expect(visibleSections(layout)).not.toContain('energy');
  });

  it('refuses a layout without a mandatory section or out of order', () => {
    expect(isLayoutValid({ sections: ['synthesis', 'access', 'risks', 'water'] })).toBe(false);
    expect(isLayoutValid({ sections: ['access', 'synthesis', 'risks', 'water', 'contacts'] })).toBe(false);
    expect(isLayoutValid({ sections: ['synthesis', 'access', 'access', 'risks', 'water', 'contacts'] })).toBe(false);
  });

  it('puts the objects of the risk category in the risks section, annotations nowhere', () => {
    expect(sectionOfCategory('risk')).toBe('risks');
    expect(sectionOfCategory('smoke_control')).toBe('rescue');
    expect(sectionOfCategory('annotation')).toBeNull();
  });
});

describe('order of the sections', () => {
  it('sorts objects by criticality, then title without accents, then identifier', () => {
    const items = [
      object('3', 'water', 'info', 'Bouche'),
      object('2', 'water', 'critical', 'Poteau'),
      object('5', 'water', 'info', 'Éclairage'),
      object('4', 'water', 'info', 'Bouche'),
      object('1', 'access', 'critical', 'Portail'),
    ];
    expect(sectionObjects(items, 'water').map((item) => item.id)).toEqual(['2', '3', '4', '5']);
    expect([...items].sort(compareObjects).map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(sortKey('Œil Été')).toBe('oeil ete');
  });

  it('sorts risks by severity, then title', () => {
    const risks = [
      { id: 'b', severity: 3, label: null, type_name: 'Gaz' },
      { id: 'a', severity: 5, label: 'Oxygène', type_name: 'Comburant' },
      { id: 'c', severity: 3, label: 'Acide', type_name: 'Corrosif' },
    ];
    expect([...risks].sort(compareRisks).map((risk) => risk.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('photo annex', () => {
  it('follows the sections and caps the photos per object', () => {
    const many = Array.from({ length: ANNEX_PHOTOS_PER_OBJECT + 2 }, (_, index) => `p${index}`);
    const annex = photoAnnex(
      [object('w', 'water', 'info', 'Poteau', ['w1']), object('a', 'access', 'info', 'Portail', many)],
      LAYOUT_SECTIONS,
    );
    expect(annex?.entries.map((entry) => entry.photo)).toEqual([...many.slice(0, ANNEX_PHOTOS_PER_OBJECT), 'w1']);
    expect(annex?.entries[0]?.section).toBe('access');
    expect(annex?.omitted).toBe(2);
  });

  it('stops at the ceiling of the document and counts the rest', () => {
    const objects = Array.from({ length: 15 }, (_, index) =>
      object(String(index).padStart(2, '0'), 'energy', 'info', 'Coupure', ['1', '2', '3', '4']),
    );
    const annex = photoAnnex(objects, LAYOUT_SECTIONS);
    expect(annex?.entries).toHaveLength(ANNEX_PHOTOS_MAX);
    expect(annex?.omitted).toBe(60 - ANNEX_PHOTOS_MAX);
  });

  it('leaves out hidden sections and has no annex when photos are hidden', () => {
    const objects = [object('e', 'energy', 'info', 'TGBT', ['e1']), object('n', 'annotation', 'info', 'Note', ['n1'])];
    const visible = visibleSections(layoutFor(['energy']));
    expect(photoAnnex(objects, visible)).toEqual({ entries: [], omitted: 2 });
    expect(photoAnnex(objects, visibleSections(layoutFor(['photos'])))).toBeNull();
  });
});
