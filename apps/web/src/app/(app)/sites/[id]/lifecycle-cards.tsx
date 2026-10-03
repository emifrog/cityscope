'use client';

import type { EtareOverview, PublicationSummary, SiteDetail } from '@etare/contracts';
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Textarea } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, usePermissions } from '@/lib/queries';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

/** A reason typed then confirmed: withdrawing and archiving are deliberate, explained acts. */
function ReasonForm({
  id,
  label,
  hint,
  confirm,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  id: string;
  label: string;
  hint: string;
  confirm: string;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onConfirm(reason.trim());
      }}
    >
      <Field label={label} htmlFor={id} hint={hint}>
        <Textarea
          id={id}
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      {error ? <ApiErrorAlert error={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={!valid || pending}>
          {pending ? 'Enregistrement…' : confirm}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Withdrawal of the version in force (MET-04): validators, second factor, reason. */
export function WithdrawalSection({ siteId, active }: { siteId: string; active: PublicationSummary }) {
  const permissions = usePermissions();
  const [asking, setAsking] = useState(false);
  const withdraw = useApiMutation(
    (options, reason: string) => api.withdrawPublication(options, active.id, active.row_version, { reason }),
    (tenantId) => [
      queryKeys.siteRecords(tenantId, siteId, 'etare'),
      queryKeys.site(tenantId, siteId),
      queryKeys.etare(tenantId),
      queryKeys.sites(tenantId),
    ],
  );
  if (!permissions.has('publication:publish')) return null;
  if (!asking) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
        Retirer cette version
      </Button>
    );
  }
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <Alert tone="important">
        Retirée, la version disparaît des tablettes à leur prochaine synchronisation : les intervenants n’auront plus de
        dossier pour ce site jusqu’à une nouvelle publication. Le motif leur est affiché.
      </Alert>
      <ReasonForm
        id="withdrawal-reason"
        label="Motif du retrait"
        hint="Ex. bâtiment démoli, plans erronés, fermeture du site."
        confirm="Retirer la version"
        pending={withdraw.isPending}
        error={withdraw.error}
        onConfirm={(reason) => withdraw.mutate(reason, { onSuccess: () => setAsking(false) })}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}

/** Last withdrawn version, when no version is in force. */
export function WithdrawnNotice({ publication }: { publication: PublicationSummary }) {
  if (!publication.withdrawal) return null;
  return (
    <p className="text-sm">
      Version n° {publication.publication_number} retirée le {when(publication.withdrawal.withdrawn_at)}
      {publication.withdrawal.withdrawn_by ? ` par ${publication.withdrawal.withdrawn_by}` : ''} : «{' '}
      {publication.withdrawal.reason} »
    </p>
  );
}

/**
 * Archiving of the site and its dossier (MET-04): once nothing is in force nor
 * pending, by those who edit the site, with a reason; restoring makes the
 * dossier active again.
 */
export function ArchiveCard({ site, etare }: { site: SiteDetail; etare: EtareOverview }) {
  const permissions = usePermissions();
  const [asking, setAsking] = useState(false);
  const invalidate = (tenantId: string) => [
    queryKeys.site(tenantId, site.id),
    queryKeys.siteRecords(tenantId, site.id, 'etare'),
    queryKeys.etare(tenantId),
    queryKeys.sites(tenantId),
  ];
  const archive = useApiMutation(
    (options, reason: string) => api.archiveSite(options, site.id, site.row_version, { reason }),
    invalidate,
  );
  const restore = useApiMutation(
    (options, _: undefined) => api.restoreSite(options, site.id, site.row_version),
    invalidate,
  );
  const canWrite = permissions.has('site:write');

  if (site.archive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Site archivé</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Archivé le {when(site.archive.archived_at)}
            {site.archive.archived_by ? ` par ${site.archive.archived_by}` : ''}
            {site.archive.reason ? ` : « ${site.archive.reason} »` : '.'}
          </p>
          {restore.error ? <ApiErrorAlert error={restore.error} /> : null}
          {canWrite ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={restore.isPending}
              onClick={() => restore.mutate(undefined)}
            >
              Restaurer le site
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }
  if (!canWrite) return null;
  const inForce = etare.publications.some((publication) => publication.status === 'published');
  const building = etare.publications.some((publication) =>
    ['queued', 'building', 'ready'].includes(publication.status),
  );
  const waiting = etare.revisions.some((revision) => revision.status === 'submitted');
  const blocker = inForce
    ? 'Une version est en vigueur : un validateur doit d’abord la retirer.'
    : building
      ? 'Une publication est en cours de fabrication.'
      : waiting
        ? 'Une révision attend la décision d’un validateur.'
        : null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Archivage</CardTitle>
          <CardDescription>
            Pour un site fermé ou démoli : le dossier est archivé, ses brouillons clos ; l’historique reste consultable.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {blocker ? <p className="text-muted">{blocker}</p> : null}
        {asking && !blocker ? (
          <ReasonForm
            id="archive-reason"
            label="Motif de l’archivage"
            hint="Ex. établissement fermé définitivement, bâtiment démoli."
            confirm="Archiver le site"
            pending={archive.isPending}
            error={archive.error}
            onConfirm={(reason) => archive.mutate(reason, { onSuccess: () => setAsking(false) })}
            onCancel={() => setAsking(false)}
          />
        ) : (
          <Button size="sm" variant="ghost" disabled={Boolean(blocker)} onClick={() => setAsking(true)}>
            Archiver le site
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
