import { cn } from '@etare/ui';
import { CONTRIBUTION_FIELD_LABELS } from './labels';

type Values = Readonly<Record<string, string | null>> | null;

const ORDER = Object.keys(CONTRIBUTION_FIELD_LABELS);
const shown = (value: string | null | undefined) =>
  value === null || value === undefined || value === '' ? '—' : value;

/**
 * Values of a proposal side by side (POR-04): what the exploitant saw in the
 * published version, what they propose and, for the Prévision, what the
 * working data hold now. A difference with the published value is marked.
 */
export function ContributionValues({
  base,
  proposed,
  current,
  removal = false,
}: {
  base: Values;
  proposed: Values;
  /** Undefined: column not shown (portal). Null: the element is gone from the working data. */
  current?: Values | undefined;
  removal?: boolean;
}) {
  const keys = [...new Set([...Object.keys(base ?? {}), ...Object.keys(proposed ?? {}), ...Object.keys(current ?? {})])]
    .filter((key) => key in CONTRIBUTION_FIELD_LABELS)
    .sort((left, right) => ORDER.indexOf(left) - ORDER.indexOf(right));
  if (keys.length === 0) return null;
  const withCurrent = current !== undefined;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">Champ</th>
            {base ? <th className="py-1 pr-3 font-medium">Version publiée</th> : null}
            <th className="py-1 pr-3 font-medium">Proposé</th>
            {withCurrent ? <th className="py-1 font-medium">Données de travail</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {keys.map((key) => {
            const before = base?.[key];
            const proposal = removal ? undefined : proposed?.[key];
            const changed = proposal !== undefined && (proposal ?? null) !== (before ?? null);
            const drift = withCurrent && base !== null && (current?.[key] ?? null) !== (before ?? null);
            return (
              <tr key={key}>
                <th scope="row" className="py-1.5 pr-3 font-normal text-muted">
                  {CONTRIBUTION_FIELD_LABELS[key]}
                </th>
                {base ? <td className="py-1.5 pr-3">{shown(before)}</td> : null}
                <td className={cn('py-1.5 pr-3', changed && 'font-semibold text-brand-accent-strong')}>
                  {removal ? 'Retrait demandé' : proposal === undefined ? 'inchangé' : shown(proposal)}
                </td>
                {withCurrent ? (
                  <td className={cn('py-1.5', drift && 'font-semibold text-important')}>
                    {current === null ? 'supprimé' : shown(current?.[key])}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
