'use client';

import type { AccountSession } from '@etare/contracts';
import { Alert, Badge, Button, Skeleton } from '@etare/ui';
import { Laptop, Smartphone } from 'lucide-react';
import { ApiErrorAlert } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useMySessions } from '@/lib/queries';
import { useSession } from '@/providers/session-provider';

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** A readable name for the browser or application that opened the session. */
export function describeUserAgent(userAgent: string | null): { label: string; mobile: boolean } {
  if (!userAgent) return { label: 'Appareil inconnu', mobile: false };
  if (/dart|okhttp|etare_ops/i.test(userAgent)) return { label: 'Application tablette', mobile: true };
  if (!userAgent.startsWith('Mozilla/')) return { label: 'Autre application', mobile: false };
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Navigateur';
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  return {
    label: system ? `${browser} sur ${system}` : browser,
    mobile: /Android|iPhone|iPad|Mobile/.test(userAgent),
  };
}

function SessionRow({ session, onRevoke, busy }: { session: AccountSession; onRevoke: () => void; busy: boolean }) {
  const device = describeUserAgent(session.user_agent);
  const Icon = device.mobile ? Smartphone : Laptop;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex items-center gap-3">
        <Icon aria-hidden="true" className="size-5 text-muted" />
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {device.label}
            {session.is_current ? <Badge tone="info">Cette session</Badge> : null}
            {session.aal === 'aal2' ? <Badge tone="success">Code saisi</Badge> : null}
          </p>
          <p className="text-xs text-muted">
            Ouverte le {dateFormat.format(new Date(session.created_at))} · dernière activité le{' '}
            {dateFormat.format(new Date(session.last_seen_at))}
            {session.ip ? ` · adresse ${session.ip}` : ''}
          </p>
        </div>
      </div>
      {session.is_current ? null : (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRevoke}>
          Fermer
        </Button>
      )}
    </li>
  );
}

/** Open sessions of the account: close one, or all the others (lost or shared computer). */
export function SessionsSection() {
  const { session } = useSession();
  const userId = session?.user.id ?? 'none';
  const sessions = useMySessions();
  const revokeOne = useApiMutation(
    (options, id: string) => api.revokeMySession(options, id),
    () => [queryKeys.mySessions(userId)],
  );
  const revokeOthers = useApiMutation(
    (options, _: void) => api.revokeMyOtherSessions(options),
    () => [queryKeys.mySessions(userId)],
  );
  const busy = revokeOne.isPending || revokeOthers.isPending;
  const error = revokeOne.error ?? revokeOthers.error;

  if (sessions.isPending) return <Skeleton className="h-16 w-full" />;
  if (sessions.error) return <ApiErrorAlert error={sessions.error} />;
  const others = sessions.data.filter((item) => !item.is_current);

  return (
    <div className="space-y-3">
      {error ? <ApiErrorAlert error={error} /> : null}
      {revokeOthers.isSuccess ? (
        <Alert tone="info">
          {revokeOthers.data.revoked === 0
            ? 'Aucune autre session n’était ouverte.'
            : `${revokeOthers.data.revoked} session(s) fermée(s) : elles devront se reconnecter.`}
        </Alert>
      ) : null}
      <ul className="divide-y divide-border">
        {sessions.data.map((item) => (
          <SessionRow key={item.id} session={item} busy={busy} onRevoke={() => revokeOne.mutate(item.id)} />
        ))}
      </ul>
      {others.length > 0 ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => revokeOthers.mutate()}>
          Fermer les autres sessions
        </Button>
      ) : null}
      <p className="text-xs text-muted">
        Une session fermée est refusée dès sa requête suivante. Une tablette déconnectée garde ses données hors ligne
        jusqu’à l’expiration de son droit de consultation.
      </p>
    </div>
  );
}
