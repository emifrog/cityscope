import type { Membership } from '@etare/contracts';
import { Badge } from '@etare/ui';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { ROLE_LABELS } from '@/components/labels';
import { displayNameOf, initialsOf } from '@/lib/identity';

/** Who is signed in, where, with which roles, and whether the account is protected. */
export function AccountHeader({
  email,
  displayName,
  protectedAccount,
  activeTenant,
}: {
  email: string;
  displayName: string | null;
  protectedAccount: boolean;
  activeTenant: Membership | null;
}) {
  const name = displayNameOf(displayName, email);
  return (
    <header className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xl font-bold text-white"
      >
        {initialsOf(displayName, email)}
      </div>
      {/* Keeps a readable width next to the avatar: on a phone, the protection goes under. */}
      <div className="min-w-0 flex-1 basis-56">
        <h1 className="text-2xl font-bold break-words text-foreground">{name}</h1>
        {name !== email ? <p className="text-sm break-all text-muted">{email}</p> : null}
        {activeTenant ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-foreground">{activeTenant.tenant_name}</span>
            {activeTenant.roles.map((role) => (
              <Badge key={role} tone="info">
                {ROLE_LABELS[role]}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <p
        className={
          protectedAccount
            ? 'flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-sm font-semibold text-success'
            : 'flex items-center gap-2 rounded-full bg-important-soft px-3 py-1.5 text-sm font-semibold text-important'
        }
      >
        {protectedAccount ? (
          <ShieldCheck aria-hidden="true" className="size-4" />
        ) : (
          <ShieldAlert aria-hidden="true" className="size-4" />
        )}
        {protectedAccount ? 'Compte protégé' : 'Compte non protégé'}
      </p>
    </header>
  );
}
