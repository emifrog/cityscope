import { describe, expect, it } from 'vitest';
import { geometryMatchesKind, validateObjectProperties } from './objects';

const HYDRANT = {
  type: 'object',
  properties: {
    numero: { type: 'string', title: 'Numéro', maxLength: 40 },
    nature: {
      type: 'string',
      title: 'Nature',
      oneOf: [
        { const: 'poteau', title: 'Poteau' },
        { const: 'bouche', title: 'Bouche' },
      ],
    },
    debit_m3h: { type: 'number', title: 'Débit', unit: 'm³/h', minimum: 0, maximum: 2000 },
    diametre_mm: { type: 'integer', title: 'Diamètre' },
    date_controle: { type: 'string', title: 'Dernier contrôle', format: 'date' },
    aspiration: { type: 'boolean', title: 'Aire d’aspiration' },
  },
  required: ['nature'],
};

describe('object properties', () => {
  it('accepts values that follow the type schema', () => {
    expect(
      validateObjectProperties(HYDRANT, {
        numero: 'NIC-0428-1',
        nature: 'poteau',
        debit_m3h: 120,
        diametre_mm: 100,
        date_controle: '2026-09-18',
        aspiration: false,
      }),
    ).toEqual([]);
  });

  it('explains each refusal with the property title', () => {
    const issues = validateObjectProperties(HYDRANT, {
      nature: 'citerne',
      debit_m3h: -5,
      diametre_mm: 100.5,
      date_controle: '18/09/2026',
      couleur: 'rouge',
    });
    expect(issues.map((issue) => issue.message)).toEqual([
      'Nature : valeur non prévue.',
      'Débit : au moins 0.',
      'Diamètre : nombre entier attendu.',
      'Dernier contrôle : date attendue.',
      'Propriété « couleur » non prévue pour ce type.',
    ]);
  });

  it('enforces required properties, and accepts nothing for a type without schema', () => {
    expect(validateObjectProperties(HYDRANT, {})).toEqual([
      { path: 'properties.nature', message: 'Nature : obligatoire.' },
    ]);
    expect(validateObjectProperties({ type: 'object' }, { libre: 1 })).toHaveLength(1);
  });

  it('matches the drawn geometry with the kind of the type', () => {
    expect(geometryMatchesKind('Point', 'point')).toBe(true);
    expect(geometryMatchesKind('Polygon', 'line')).toBe(false);
  });
});
