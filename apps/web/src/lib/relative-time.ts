const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const format = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });

/** « il y a 3 jours », « hier », « à l’instant » : the distance from `now` to an instant. */
export function agoLabel(iso: string, now: number = Date.now()): string {
  const delta = Date.parse(iso) - now;
  if (Number.isNaN(delta)) return '';
  const distance = Math.abs(delta);
  if (distance < 60_000) return 'à l’instant';
  for (const [unit, ms] of UNITS) {
    if (distance >= ms) return format.format(Math.round(delta / ms), unit);
  }
  return format.format(Math.round(delta / 60_000), 'minute');
}
