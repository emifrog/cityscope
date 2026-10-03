'use client';

import { Label, Select } from '@etare/ui';
import { RISK_SEVERITY_LABELS } from './labels';
import { useRiskTypes } from '@/lib/queries';

export const SEVERITIES = [1, 2, 3, 4, 5] as const;

/** URL parameters of the risk filters, shared by the site list and the map (MET-01). */
export function riskFiltersFromParams(params: { get(name: string): string | null }): {
  risk_type_id?: string;
  min_severity?: number;
} {
  const type = params.get('risque');
  const severity = Number(params.get('gravite'));
  return {
    ...(type && /^[0-9a-f-]{36}$/i.test(type) ? { risk_type_id: type } : {}),
    ...((SEVERITIES as readonly number[]).includes(severity) ? { min_severity: severity } : {}),
  };
}

/** Risk type of the catalogue and minimal severity, as form fields named `risque` and `gravite`. */
export function RiskFilterFields({
  prefix,
  riskTypeId,
  minSeverity,
  className,
}: {
  prefix: string;
  riskTypeId: string | undefined;
  minSeverity: number | undefined;
  className?: string;
}) {
  // Retired types too: sites may still hold risks of a type no longer offered.
  const types = useRiskTypes(true);
  return (
    <>
      <div className={className}>
        <Label htmlFor={`${prefix}-risk`}>Risque</Label>
        <Select id={`${prefix}-risk`} name="risque" defaultValue={riskTypeId ?? ''} className="mt-1">
          <option value="">Tous</option>
          {(types.data ?? []).map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </Select>
      </div>
      <div className={className}>
        <Label htmlFor={`${prefix}-severity`}>Gravité</Label>
        <Select id={`${prefix}-severity`} name="gravite" defaultValue={minSeverity ?? ''} className="mt-1">
          <option value="">Toutes</option>
          {SEVERITIES.map((severity) => (
            <option key={severity} value={severity}>
              {`${RISK_SEVERITY_LABELS[severity]} et plus`}
            </option>
          ))}
        </Select>
      </div>
    </>
  );
}
