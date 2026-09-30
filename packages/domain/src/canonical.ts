/**
 * Canonical JSON (in the spirit of RFC 8785): object keys sorted by code
 * unit, no whitespace, arrays kept in order, `undefined` members left out.
 * The same content always gives the same text, so its SHA-256 identifies a
 * revision snapshot or a publication manifest whatever the producer.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Canonical JSON has no NaN or Infinity.');
      // -0 and 0 are the same value.
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, member]) => member !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
      return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(',')}}`;
    }
    default:
      throw new TypeError(`Canonical JSON cannot encode a ${typeof value}.`);
  }
}
