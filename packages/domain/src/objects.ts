/**
 * Operational objects (gates, fire hydrants, shut-offs...) and their typed
 * properties. Each object type of the catalogue carries a JSON Schema subset
 * describing its properties; only declared properties are accepted.
 */
export const OBJECT_CATEGORIES = [
  'access',
  'water',
  'energy',
  'safety',
  'smoke_control',
  'vertical',
  'risk',
  'refuge',
  'communication',
  'annotation',
] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export const GEOMETRY_KINDS = ['point', 'line', 'polygon'] as const;
export type GeometryKind = (typeof GEOMETRY_KINDS)[number];

export const CRITICALITIES = ['info', 'important', 'critical'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const OBJECT_STATUSES = ['active', 'out_of_service', 'unknown', 'archived'] as const;
export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

const GEOJSON_TYPE_OF_KIND: Readonly<Record<GeometryKind, string>> = {
  point: 'Point',
  line: 'LineString',
  polygon: 'Polygon',
};

/** The geometry drawn for an object must be the one its type expects (a hydrant is a point, a fire lane a line). */
export const geometryMatchesKind = (geometryType: string, kind: GeometryKind) =>
  GEOJSON_TYPE_OF_KIND[kind] === geometryType;

export interface PropertyDefinition {
  readonly type: 'string' | 'number' | 'integer' | 'boolean';
  readonly title?: string;
  readonly description?: string;
  /** Unit shown next to numbers ("m³/h"). */
  readonly unit?: string;
  /** Allowed values with their labels. */
  readonly oneOf?: readonly { readonly const: string | number; readonly title?: string }[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly maxLength?: number;
  readonly format?: 'date';
}

export interface PropertiesSchema {
  readonly type: 'object';
  readonly properties?: Readonly<Record<string, PropertyDefinition>>;
  readonly required?: readonly string[];
}

export interface PropertyIssue {
  readonly path: string;
  readonly message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a catalogue schema defensively: anything unexpected describes no property. */
export function propertyDefinitions(schema: unknown): Readonly<Record<string, PropertyDefinition>> {
  if (!isRecord(schema) || !isRecord(schema['properties'])) return {};
  return schema['properties'] as Record<string, PropertyDefinition>;
}

function checkValue(name: string, definition: PropertyDefinition, value: unknown): string | null {
  const label = definition.title ?? name;
  switch (definition.type) {
    case 'string':
      if (typeof value !== 'string') return `${label} : texte attendu.`;
      if (definition.maxLength !== undefined && value.length > definition.maxLength) {
        return `${label} : ${definition.maxLength} caractères au plus.`;
      }
      if (definition.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${label} : date attendue.`;
      break;
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} : nombre attendu.`;
      if (definition.type === 'integer' && !Number.isInteger(value)) return `${label} : nombre entier attendu.`;
      if (definition.minimum !== undefined && value < definition.minimum) {
        return `${label} : au moins ${definition.minimum}.`;
      }
      if (definition.maximum !== undefined && value > definition.maximum) {
        return `${label} : au plus ${definition.maximum}.`;
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') return `${label} : oui ou non attendu.`;
      break;
    default:
      return `${label} : type de propriété inconnu.`;
  }
  if (definition.oneOf && !definition.oneOf.some((choice) => choice.const === value)) {
    return `${label} : valeur non prévue.`;
  }
  return null;
}

/**
 * Validates the properties of an object against its type's schema. Only
 * declared properties are accepted (no free-form data in operational files).
 */
export function validateObjectProperties(schema: unknown, value: Readonly<Record<string, unknown>>): PropertyIssue[] {
  const definitions = propertyDefinitions(schema);
  const issues: PropertyIssue[] = [];
  for (const [name, item] of Object.entries(value)) {
    const definition = definitions[name];
    if (!definition) {
      issues.push({ path: `properties.${name}`, message: `Propriété « ${name} » non prévue pour ce type.` });
      continue;
    }
    if (item === null) continue;
    const problem = checkValue(name, definition, item);
    if (problem) issues.push({ path: `properties.${name}`, message: problem });
  }
  const required = isRecord(schema) && Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];
  for (const name of required) {
    if (value[name] === undefined || value[name] === null) {
      issues.push({ path: `properties.${name}`, message: `${definitions[name]?.title ?? name} : obligatoire.` });
    }
  }
  return issues;
}
