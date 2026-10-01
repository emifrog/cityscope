'use client';

import type { EtareChange } from '@etare/contracts';
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
import Link from 'next/link';
import { useState } from 'react';
import { EtareDocument } from '@/components/etare/etare-document';
import { PublicationPdfButton } from '@/components/etare/publication-pdf-button';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CHANGE_LABELS,
  ETARE_SECTION_LABELS,
  PUBLICATION_STATUS_LABELS,
  REVISION_STATUS_LABELS,
} from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';
import {
  queryKeys,
  useApiMutation,
  useContributions,
  useFieldReports,
  usePermissions,
  useRevision,
} from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

function Changes({ changes }: { changes: readonly EtareChange[] | null }) {
  if (changes === null) {
    return (
      <p className="text-sm text-muted">
        Pas de comparaison : première version, ou version précédente dans un format antérieur.
      </p>
    );
  }
  if (changes.length === 0) return <p className="text-sm text-muted">Aucun changement depuis la version publiée.</p>;
  const count = (kind: EtareChange['change']) => changes.filter((change) => change.change === kind).length;
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap gap-2 text-sm">
        <Badge tone="success">{count('added')} ajout(s)</Badge>
        <Badge tone="critical">{count('removed')} suppression(s)</Badge>
        <Badge tone="info">{count('modified')} modification(s)</Badge>
      </p>
      <ul className="divide-y divide-border text-sm">
        {changes.map((change) => (
          <li key={`${change.section}-${change.id}`} className="flex flex-wrap justify-between gap-2 py-1.5">
            <span>
              <span className="text-muted">{ETARE_SECTION_LABELS[change.section]} · </span>
              {change.label}
            </span>
            <span className="text-xs font-medium">{CHANGE_LABELS[change.change]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Field reports the editors integrated into this revision (traceability up to the publication). */
function IntegratedReports({ revisionId }: { revisionId: string }) {
  const reviewsReports = usePermissions().has('field_report:review');
  const reports = useFieldReports({ view: 'all', revision_id: revisionId, limit: 100 }, reviewsReports);
  if (!reviewsReports || !reports.data || reports.data.items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Signalements intégrés ({reports.data.items.length})</CardTitle>
          <CardDescription>Écarts remontés du terrain que cette révision corrige.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {reports.data.items.map((report) => (
            <li key={report.id}>
              <Link href={`/signalements/${report.id}`} className="line-clamp-2 text-info hover:underline">
                {report.description}
              </Link>
              <span className="text-xs text-muted">
                {report.reporter.name} · {when(report.observed_at)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Proposals of exploitants integrated into this revision (their origin stays linked to the publication). */
function IntegratedContributions({ revisionId }: { revisionId: string }) {
  const reviews = usePermissions().has('contribution:review');
  const contributions = useContributions({ view: 'all', revision_id: revisionId, limit: 100 }, reviews);
  if (!reviews || !contributions.data || contributions.data.items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Contributions intégrées ({contributions.data.items.length})</CardTitle>
          <CardDescription>Mises à jour proposées par les exploitants, reportées dans cette révision.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {contributions.data.items.map((contribution) => (
            <li key={contribution.id}>
              <Link href={`/contributions/${contribution.id}`} className="line-clamp-2 text-info hover:underline">
                {contribution.title}
              </Link>
              <span className="text-xs text-muted">
                {contribution.author.name} · {when(contribution.created_at)}
                {contribution.conflict_resolution ? ' · conflit résolu' : ''}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Review of a submitted revision (WF-02): frozen content, changes since the
 * published version, contributors, and the motivated decision of an
 * independent validator (second factor). "Valider et publier" queues the
 * publication, built by the worker from this exact content.
 */
export function RevisionReview({ id }: { id: string }) {
  const permissions = usePermissions();
  const { me } = useTenant();
  const detail = useRevision(id);
  const [choice, setChoice] = useState<'approve' | 'changes'>('approve');
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const canPublish = permissions.has('publication:publish');
  const decide = useApiMutation(
    (options, _: undefined) =>
      api.decideRevision(options, id, {
        decision: choice === 'approve' ? 'approved' : 'changes_requested',
        comment: comment.trim() || null,
        revision_hash: detail.data?.revision.content_hash ?? '',
        publish: choice === 'approve' && canPublish,
      }),
    (tenantId, revision) => [
      queryKeys.revision(tenantId, id),
      queryKeys.etare(tenantId),
      queryKeys.siteRecords(tenantId, revision.site_id, 'etare'),
      queryKeys.site(tenantId, revision.site_id),
    ],
  );

  if (detail.isPending) return <LoadingCard lines={6} />;
  if (detail.error) return <ApiErrorAlert error={detail.error} />;
  const { revision, snapshot, changes, contributors, site_name: siteName } = detail.data;
  const contributed =
    me !== undefined &&
    (revision.created_by.id === me.user.id ||
      revision.submitted_by?.id === me.user.id ||
      contributors.some((person) => person.id === me.user.id));

  function submit() {
    if (choice === 'changes' && !comment.trim()) {
      setProblem('Motivez la demande de correction : le rédacteur la lira.');
      return;
    }
    setProblem(null);
    decide.mutate(undefined);
  }

  return (
    <>
      <PageHeader
        title={`${siteName} — révision n° ${revision.revision_no}`}
        description={
          revision.base_publication_number
            ? `Passage de la version publiée n° ${revision.base_publication_number} à la révision n° ${revision.revision_no}.`
            : 'Première version publiée du dossier.'
        }
        actions={<Badge tone="info">{REVISION_STATUS_LABELS[revision.status]}</Badge>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="text-base">Modifications</CardTitle>
                <CardDescription>Éléments ajoutés, supprimés ou modifiés depuis la version publiée.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Changes changes={changes} />
            </CardContent>
          </Card>
          {snapshot ? (
            <EtareDocument snapshot={snapshot} versionLabel={`Révision n° ${revision.revision_no} (figée)`} />
          ) : (
            <Alert tone="info">Le contenu sera figé à la soumission.</Alert>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Origine</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Soumise par <span className="font-medium">{revision.submitted_by?.name ?? '—'}</span> le{' '}
                {when(revision.submitted_at)}.
              </p>
              {revision.change_summary ? (
                <p className="rounded-md bg-subtle px-3 py-2">{revision.change_summary}</p>
              ) : null}
              <p className="text-muted">
                Contributeurs : {contributors.map((person) => person.name).join(', ') || 'aucun'}.
              </p>
              {revision.content_hash ? (
                <p className="text-xs text-muted">
                  Empreinte SHA-256 : <code className="break-all">{revision.content_hash}</code>
                </p>
              ) : null}
              <Link href={`/sites/${revision.site_id}?onglet=etare`} className="text-info hover:underline">
                Dossier ETARE du site
              </Link>
            </CardContent>
          </Card>

          <IntegratedReports revisionId={revision.id} />
          <IntegratedContributions revisionId={revision.id} />

          {revision.decision ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Décision</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  {revision.decision.decision === 'approved' ? 'Validée' : 'Corrections demandées'} par{' '}
                  {revision.decision.actor.name} le {when(revision.decision.created_at)}.
                </p>
                {revision.decision.comment ? (
                  <p className="rounded-md bg-subtle px-3 py-2">{revision.decision.comment}</p>
                ) : null}
                {revision.publication ? (
                  <p>
                    Publication n° {revision.publication.publication_number} :{' '}
                    <span className="font-medium">{PUBLICATION_STATUS_LABELS[revision.publication.status]}</span>
                    {revision.publication.published_at ? ` le ${when(revision.publication.published_at)}` : ''}.
                  </p>
                ) : null}
                {revision.publication?.has_pdf ? (
                  <PublicationPdfButton
                    publicationId={revision.publication.id}
                    number={revision.publication.publication_number}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {revision.status === 'submitted' && permissions.has('etare:approve') ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle className="text-base">Décider</CardTitle>
                  <CardDescription>
                    Double authentification requise ; la décision porte sur ce contenu exact.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {contributed ? (
                  <Alert tone="important">
                    Vous avez contribué à cette révision : un autre validateur doit la contrôler.
                  </Alert>
                ) : (
                  <form
                    noValidate
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submit();
                    }}
                  >
                    <fieldset className="space-y-2">
                      <legend className="sr-only">Décision</legend>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="decision"
                          className="size-4 accent-brand-accent"
                          checked={choice === 'approve'}
                          onChange={() => setChoice('approve')}
                        />
                        {canPublish ? 'Valider et publier' : 'Valider'}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="decision"
                          className="size-4 accent-brand-accent"
                          checked={choice === 'changes'}
                          onChange={() => setChoice('changes')}
                        />
                        Demander une correction
                      </label>
                    </fieldset>
                    <Field
                      label={choice === 'changes' ? 'Motif de la demande' : 'Commentaire (facultatif)'}
                      htmlFor="decision-comment"
                      error={problem ?? undefined}
                    >
                      <Textarea
                        id="decision-comment"
                        rows={3}
                        maxLength={4000}
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                      />
                    </Field>
                    {choice === 'approve' && canPublish ? (
                      <p className="text-xs text-muted">
                        La publication créera une version immuable, consultée par les intervenants à la place de la
                        version actuelle.
                      </p>
                    ) : null}
                    {decide.error ? <ApiErrorAlert error={decide.error} /> : null}
                    <Button type="submit" disabled={decide.isPending}>
                      {decide.isPending
                        ? 'Enregistrement…'
                        : choice === 'approve'
                          ? canPublish
                            ? 'Valider et publier'
                            : 'Valider'
                          : 'Demander une correction'}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
