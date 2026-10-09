import type { PropertiesSchema, PropertyDefinition } from './objects';

/**
 * Zones of a level (rooms, refuges, technical rooms...) and risks (RISK-01/02).
 * The national catalogue of risk types is reference data; each SIS may add its
 * own types with their fields (catalog:manage), never modify national ones.
 */
export const ZONE_TYPES = ['room', 'refuge', 'technical', 'storage', 'public', 'circulation', 'other'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

/** 1 (low) to 5 (major). */
export const RISK_SEVERITIES = [1, 2, 3, 4, 5] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

/** Pictograms a risk type can use (drawn by the clients; national entries use the same keys). */
export const RISK_ICON_KEYS = [
  'risk-flammable',
  'risk-explosive',
  'risk-toxic',
  'risk-corrosive',
  'risk-oxidizing',
  'risk-pressurized-gas',
  'risk-high-voltage',
  'risk-lithium',
  'risk-photovoltaic',
  'risk-radioactive',
  'risk-biological',
  'risk-oxygen',
  'risk-fragile-structure',
  'risk-vulnerable-public',
  'risk-heritage',
  'risk-generic',
] as const;
export type RiskIconKey = (typeof RISK_ICON_KEYS)[number];

export const CATALOG_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_CATALOG_FIELDS = 20;

/** Kinds of the fields a SIS declares for its own catalogue entries. */
export const FIELD_KINDS = ['text', 'number', 'integer', 'boolean', 'date', 'choice'] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export interface CatalogField {
  readonly key: string;
  readonly title: string;
  readonly kind: FieldKind;
  readonly unit?: string | undefined;
  /** Allowed values of a "choice" field. */
  readonly choices?: readonly string[] | undefined;
  readonly required?: boolean | undefined;
}

const TEXT_MAX_LENGTH = 200;

/** "Volume utile (m³)" → "volume_utile_m3": a stable key proposed from the title of a field. */
export const fieldKeyFromTitle = (title: string) =>
  title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'c_$1')
    .slice(0, 40);

/** Turns the fields declared by a SIS into the JSON Schema subset validated for every occurrence. */
export function schemaFromFields(fields: readonly CatalogField[]): PropertiesSchema {
  const properties: Record<string, PropertyDefinition> = {};
  for (const field of fields) {
    const base = { title: field.title, ...(field.unit ? { unit: field.unit } : {}) };
    switch (field.kind) {
      case 'text':
        properties[field.key] = { type: 'string', maxLength: TEXT_MAX_LENGTH, ...base };
        break;
      case 'date':
        properties[field.key] = { type: 'string', format: 'date', ...base };
        break;
      case 'choice':
        properties[field.key] = {
          type: 'string',
          oneOf: (field.choices ?? []).map((choice) => ({ const: choice, title: choice })),
          ...base,
        };
        break;
      case 'number':
      case 'integer':
        properties[field.key] = { type: field.kind, minimum: 0, ...base };
        break;
      case 'boolean':
        properties[field.key] = { type: 'boolean', ...base };
        break;
    }
  }
  const required = fields.filter((field) => field.required).map((field) => field.key);
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}

/** Reads back the fields of a catalogue entry (to edit them); unknown shapes become text fields. */
export function fieldsFromSchema(schema: unknown): CatalogField[] {
  if (typeof schema !== 'object' || schema === null) return [];
  const { properties, required } = schema as { properties?: Record<string, PropertyDefinition>; required?: unknown };
  const mandatory = new Set(Array.isArray(required) ? required : []);
  return Object.entries(properties ?? {}).map(([key, definition]) => {
    const kind: FieldKind = definition.oneOf
      ? 'choice'
      : definition.format === 'date'
        ? 'date'
        : definition.type === 'string'
          ? 'text'
          : definition.type;
    return {
      key,
      title: definition.title ?? key,
      kind,
      ...(definition.unit ? { unit: definition.unit } : {}),
      ...(definition.oneOf ? { choices: definition.oneOf.map((choice) => String(choice.const)) } : {}),
      ...(mandatory.has(key) ? { required: true } : {}),
    };
  });
}

/**
 * Hazardous substances (RISK-03): CLP pictograms of a product, as printed on its
 * safety data sheet (FDS). Codes are the GHS ones; labels are the French names.
 */
export const HAZARD_CLASSES = [
  'GHS01',
  'GHS02',
  'GHS03',
  'GHS04',
  'GHS05',
  'GHS06',
  'GHS07',
  'GHS08',
  'GHS09',
] as const;
export type HazardClass = (typeof HAZARD_CLASSES)[number];

export const HAZARD_CLASS_LABELS: Readonly<Record<HazardClass, string>> = {
  GHS01: 'Explosif',
  GHS02: 'Inflammable',
  GHS03: 'Comburant',
  GHS04: 'Gaz sous pression',
  GHS05: 'Corrosif',
  GHS06: 'Toxicité aiguë',
  GHS07: 'Nocif ou irritant',
  GHS08: 'Danger pour la santé',
  GHS09: 'Dangereux pour l’environnement',
};

export const PHYSICAL_STATES = ['solid', 'liquid', 'gas'] as const;
export type PhysicalState = (typeof PHYSICAL_STATES)[number];

export const PHYSICAL_STATE_LABELS: Readonly<Record<PhysicalState, string>> = {
  solid: 'Solide',
  liquid: 'Liquide',
  gas: 'Gaz',
};
