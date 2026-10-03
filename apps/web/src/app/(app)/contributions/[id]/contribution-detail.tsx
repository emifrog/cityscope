'use client';

import type { Asset, Contribution, ContributionUpdate } from '@etare/contracts';
import { FINAL_CONTRIBUTION_STATUSES } from '@etare/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Textarea,
} from '@etare/ui';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ContributionValues } from '@/components/contribution-values';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CONTRIBUTION_OPERATION_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_TARGET_LABELS,
  REJECTION_REASON_LABELS,
  REVISION_STATUS_LABELS,
  SCAN_STATUS_LABELS,
} from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { queryKeys, useApiMutation, useAssetUrl, useContribution, usePermissions, useSiteEtare } from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';
import { CONTRIBUTION_TONES } from '../contributions-list';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

function Attachment({ asset }: { asset: Asset }) {
  const clean = asset.scan_status === 'clean';
  const image = asset.mime_type.startsWith('image/');
  // Reduced image in the tile (CAP-03); "Ouvrir" fetches the original on demand.
  const preview = useAssetUrl(clean && image ? asset.id : null, 'thumbnail');
  const download = useApiMutation(
    (options, id: string) => api.getAssetDownload(options, id),
    () => [],
  );
  return (
    <li className="overflow-hidden rounded-md border border-border">
      <div className="flex aspect-[4/3] items-center justify-center bg-subtle">
        {clean && image && preview.data ? (
          // Short-lived signed URL of a checked file: next/image cannot optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.data.url} alt={asset.filename} className="size-full object-cover" />
        ) : (
          <Badge tone={asset.scan_status === 'rejected' ? 'critical' : clean ? 'neutral' : 'info'}>
            {clean
              ? asset.mime_type === 'application/pdf'
                ? 'PDF'
                : 'Fichier'
              : SCAN_STATUS_LABELS[asset.scan_status]}
          </Badge>
        )}
      </div>
      <div className="space-y-1 px-2 py-1.5 text-xs">
        <p className="truncate" title={asset.filename}>
          {asset.filename}
        </p>
        {asset.scan_status === 'rejected' ? (
          <p className="text-critical">
            Refusé : {REJECTION_REASON_LABELS[asset.rejection_reason ?? ''] ?? 'fichier non conforme'}.
          </p>
        ) : null}
        {clean ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={download.isPending}
            onClick={() => download.mutate(asset.id, { onSuccess: (ticket) => openInNewTab(ticket.url) })}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            Ouvrir
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function Instruction({ contribution }: { contribution: Contribution }) {
  const { me } = useTenant();
  const permissions = usePermissions();
  const etare = useSiteEtare(contribution.site_id);
  const [message, setMessage] = useState('');
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const update = useApiMutation(
    (options, patch: ContributionUpdate) =>
      api.updateContribution(options, contribution.id, contribution.row_version, patch),
    (tenantId) => [queryKeys.contributions(tenantId)],
  );
  const openRevision = useApiMutation(
    (options, _: undefined) =>
      api.createRevision(options, contribution.site_id, { change_summary: 'Mise à jour proposée par l’exploitant' }),
    (tenantId) => [queryKeys.siteRecords(tenantId, contribution.site_id, 'etare'), queryKeys.etare(tenantId)],
  );
  const draft = etare.data?.revisions.find((revision) => revision.status === 'draft');

  function write(status?: 'info_requested') {
    if (!message.trim()) return setProblem('Écrivez votre message à l’exploitant.');
    setProblem(null);
    update.mutate(status ? { status, message: message.trim() } : { message: message.trim() }, {
      onSuccess: () => setMessage(''),
    });
  }

  function decide(status: 'accepted' | 'partially_accepted' | 'rejected') {
    if (!comment.trim()) return setProblem('Motivez la décision : l’exploitant la lira.');
    if (status !== 'rejected' && contribution.conflict && !resolution.trim()) {
      return setProblem('Indiquez comment le conflit avec les données de travail est résolu.');
    }
    setProblem(null);
    update.mutate({
      status,
      decision_comment: comment.trim(),
      ...(status !== 'rejected' && contribution.conflict ? { conflict_resolution: resolution.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Instruction</CardTitle>
          <CardDescription>
            Acceptée, la proposition est reportée dans une révision de travail, puis validée par un validateur distinct.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {update.error ? <ApiErrorAlert error={update.error} /> : null}
        {problem ? <p className="text-critical">{problem}</p> : null}
        <section className="space-y-2">
          <h3 className="font-semibold">Prise en charge</h3>
          {contribution.assigned_to ? (
            <p>Suivie par {contribution.assigned_to.name}.</p>
          ) : (
            <p className="text-muted">Personne ne suit encore cette proposition.</p>
          )}
          {me && contribution.assigned_to?.id !== me.user.id ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  ...(contribution.status === 'submitted' ? { status: 'in_review' as const } : {}),
                  assigned_to: me.user.id,
                })
              }
            >
              Prendre en charge
            </Button>
          ) : null}
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">Échange avec l’exploitant</h3>
          <Field label="Message" htmlFor="contribution-message">
            <Textarea
              id="contribution-message"
              rows={3}
              maxLength={4000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={update.isPending} onClick={() => write('info_requested')}>
              Demander une précision
            </Button>
            <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => write()}>
              Envoyer sans attendre de réponse
            </Button>
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">Report dans le dossier</h3>
          {contribution.resolution ? (
            <p>
              Intégrée à la révision n° {contribution.resolution.revision_no} (
              {(REVISION_STATUS_LABELS as Readonly<Record<string, string>>)[
                contribution.resolution.revision_status
              ]?.toLowerCase() ?? contribution.resolution.revision_status}
              ).
            </p>
          ) : draft ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={update.isPending}
              onClick={() => update.mutate({ revision_id: draft.id })}
            >
              Intégrer à la révision n° {draft.revision_no} en brouillon
            </Button>
          ) : (
            <>
              <p className="text-muted">Aucune révision en brouillon pour ce site.</p>
              {permissions.has('etare:edit') ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={openRevision.isPending}
                  onClick={() => openRevision.mutate(undefined)}
                >
                  Ouvrir une révision
                </Button>
              ) : null}
              {openRevision.error ? <ApiErrorAlert error={openRevision.error} /> : null}
            </>
          )}
          <Link href={`/sites/${contribution.site_id}`} className="block text-info hover:underline">
            Données de travail du site
          </Link>
        </section>
        <form
          noValidate
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            decide('accepted');
          }}
        >
          <h3 className="font-semibold">Décision</h3>
          {contribution.conflict ? (
            <Field label="Résolution du conflit" htmlFor="contribution-resolution">
              <Textarea
                id="contribution-resolution"
                rows={2}
                maxLength={2000}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Motif, lu par l’exploitant" htmlFor="contribution-decision">
            <Textarea
              id="contribution-decision"
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
          {!contribution.resolution ? (
            <p className="text-xs text-muted">
              Pour accepter, reportez d’abord la proposition dans la révision en brouillon du site.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={update.isPending || !contribution.resolution}>
              Accepter
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={update.isPending || !contribution.resolution}
              onClick={() => decide('partially_accepted')}
            >
              Accepter en partie
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => decide('rejected')}
            >
              Refuser
            </Button>
          </div>
          <p className="text-xs text-muted">La décision est définitive.</p>
        </form>
      </CardContent>
    </Card>
  );
}

/** Detail and instruction of a proposal of an exploitant (POR-03, POR-04). */
export function ContributionDetail({ id }: { id: string }) {
  const permissions = usePermissions();
  const detail = useContribution(id);

  if (!permissions.has('contribution:review')) {
    return <Alert tone="info">Les contributions sont instruites par la Prévision et l’administration du SIS.</Alert>;
  }
  if (detail.isPending) return <LoadingCard lines={6} />;
  if (detail.error) return <ApiErrorAlert error={detail.error} />;
  const contribution = detail.data;
  const decided = FINAL_CONTRIBUTION_STATUSES.has(contribution.status);
  const outdated =
    contribution.publication !== null &&
    contribution.current_publication_number !== null &&
    contribution.current_publication_number !== contribution.publication.publication_number;

  return (
    <>
      <PageHeader
        title={`${contribution.title} — ${contribution.site_name}`}
        description={`Proposée par ${contribution.author.name}${contribution.author.email ? ` (${contribution.author.email})` : ''}, reçue le ${when(contribution.created_at)}.`}
        actions={
          <Badge tone={CONTRIBUTION_TONES[contribution.status]}>
            {CONTRIBUTION_STATUS_LABELS[contribution.status]}
          </Badge>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Proposition</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex flex-wrap gap-2">
                <Badge>{CONTRIBUTION_OPERATION_LABELS[contribution.operation]}</Badge>
                <Badge>{CONTRIBUTION_TARGET_LABELS[contribution.target_type]}</Badge>
              </p>
              <p className="rounded-md bg-subtle px-3 py-2 whitespace-pre-wrap">{contribution.description}</p>
              {contribution.conflict ? (
                <Alert tone="important">
                  {contribution.current_value === null
                    ? 'L’élément visé n’existe plus dans les données de travail.'
                    : 'Les données de travail ont changé depuis la version vue par l’exploitant.'}{' '}
                  Comparez les valeurs : accepter demande d’indiquer comment le conflit est résolu.
                </Alert>
              ) : null}
              <ContributionValues
                base={contribution.base_value}
                proposed={contribution.proposed_value}
                current={contribution.operation === 'create' ? undefined : contribution.current_value}
                removal={contribution.operation === 'delete'}
              />
              <p className="text-muted">
                {contribution.publication
                  ? `Faite sur la version publiée n° ${contribution.publication.publication_number}.`
                  : 'Faite alors qu’aucune version n’était publiée.'}
                {outdated ? ` La version publiée actuelle est la n° ${contribution.current_publication_number}.` : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pièces jointes ({contribution.attachments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {contribution.attachments.length === 0 ? (
                <p className="text-sm text-muted">Aucune pièce jointe.</p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                  {contribution.attachments.map((asset) => (
                    <Attachment key={asset.id} asset={asset} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Échanges ({contribution.messages.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {contribution.messages.length === 0 ? (
                <p className="text-sm text-muted">Aucun échange pour l’instant.</p>
              ) : (
                <ol className="space-y-3 text-sm">
                  {contribution.messages.map((message) => (
                    <li
                      key={message.id}
                      className={
                        message.side === 'sis' ? 'border-l-2 border-info pl-3' : 'border-l-2 border-border pl-3'
                      }
                    >
                      <p className="text-xs text-muted">
                        {message.author.name} · {when(message.created_at)}
                        {message.kind === 'info_request' ? ' · demande de précision' : ''}
                      </p>
                      <p className="whitespace-pre-wrap">{message.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          {decided ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Décision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  {CONTRIBUTION_STATUS_LABELS[contribution.status]}
                  {contribution.status === 'withdrawn'
                    ? ' par l’exploitant'
                    : ` par ${contribution.decided_by?.name ?? '—'}`}{' '}
                  le {when(contribution.decided_at)}.
                </p>
                {contribution.decision_comment ? (
                  <p className="rounded-md bg-subtle px-3 py-2 whitespace-pre-wrap">{contribution.decision_comment}</p>
                ) : null}
                {contribution.conflict_resolution ? (
                  <p>
                    <span className="font-medium">Résolution du conflit : </span>
                    {contribution.conflict_resolution}
                  </p>
                ) : null}
                {contribution.resolution ? (
                  <p>
                    Intégrée à la révision n° {contribution.resolution.revision_no}
                    {contribution.resolution.publication_number
                      ? `, publiée en version n° ${contribution.resolution.publication_number}.`
                      : ', pas encore publiée.'}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <Instruction contribution={contribution} />
          )}
        </aside>
      </div>
    </>
  );
}
