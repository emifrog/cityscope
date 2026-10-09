import type { Membership } from '@etare/contracts';
import { Badge } from '@etare/ui';
import { MapPinned, ShieldCheck } from 'lucide-react';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/components/labels';

/** Each SIS of the person, with what every role allows there. */
export function MembershipsSection({
  memberships,
  activeTenantId,
}: {
  memberships: readonly Membership[];
  activeTenantId: string | null;
}) {
  if (memberships.length === 0) {
    return <p className="text-sm text-muted">Aucun SIS n’est associé à votre compte.</p>;
  }
  return (
    <ul className="space-y-3">
      {memberships.map((membership) => {
        const active = membership.tenant_id === activeTenantId;
        return (
          <li
            key={membership.tenant_id}
            className={
              active ? 'rounded-md border border-info/30 bg-info-soft/40 p-3' : 'rounded-md border border-border p-3'
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{membership.tenant_name}</p>
              {active ? <Badge tone="info">SIS actif</Badge> : null}
            </div>
            {membership.roles.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucun rôle attribué.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {membership.roles.map((role) => (
                  <li key={role}>
                    <Badge tone="neutral">{ROLE_LABELS[role]}</Badge>
                    <p className="mt-1 text-xs text-muted">{ROLE_DESCRIPTIONS[role]}</p>
                  </li>
                ))}
              </ul>
            )}
            {membership.limited || membership.second_factor_required ? (
              <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted">
                {membership.limited ? (
                  <li className="flex items-center gap-1.5">
                    <MapPinned aria-hidden="true" className="size-3.5" />
                    Périmètre limité à des secteurs ou des sites.
                  </li>
                ) : null}
                {membership.second_factor_required ? (
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck aria-hidden="true" className="size-3.5" />
                    Double authentification exigée pour tout accès.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
