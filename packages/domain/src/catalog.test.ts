import { describe, expect, it } from 'vitest';
import { FIELD_KEY_PATTERN, fieldKeyFromTitle, fieldsFromSchema, schemaFromFields, type CatalogField } from './catalog';
import { validateObjectProperties } from './objects';

const fields: CatalogField[] = [
  { key: 'volume_m3', title: 'Volume', kind: 'number', unit: 'm³', required: true },
  { key: 'produit', title: 'Produit', kind: 'choice', choices: ['fioul', 'gazole'] },
  { key: 'double_paroi', title: 'Double paroi', kind: 'boolean' },
  { key: 'controle', title: 'Dernier contrôle', kind: 'date' },
];

describe('fields of a SIS catalogue entry', () => {
  it('become a properties schema validated like the national ones', () => {
    const schema = schemaFromFields(fields);
    expect(validateObjectProperties(schema, { volume_m3: 12, produit: 'fioul', double_paroi: true })).toEqual([]);
    expect(validateObjectProperties(schema, { produit: 'essence' }).map((issue) => issue.path)).toEqual([
      'properties.produit',
      'properties.volume_m3',
    ]);
    expect(validateObjectProperties(schema, { volume_m3: -1 })[0]?.message).toContain('au moins 0');
  });

  it('are read back from the schema to be edited', () => {
    expect(fieldsFromSchema(schemaFromFields(fields))).toEqual(fields);
    expect(fieldsFromSchema(null)).toEqual([]);
  });
});

describe('field keys', () => {
  it.each([
    ['Volume utile (m³)', 'volume_utile_m3'],
    ['Pression de service', 'pression_de_service'],
    ['  Éléments   inflammables ', 'elements_inflammables'],
    ['2e accès', 'c_2e_acces'],
  ])('proposes a key for "%s"', (title, key) => {
    expect(fieldKeyFromTitle(title)).toBe(key);
    expect(FIELD_KEY_PATTERN.test(key)).toBe(true);
  });
});
