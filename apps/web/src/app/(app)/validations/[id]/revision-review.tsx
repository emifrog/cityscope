'use client';

import type { EtareChange } from '@etare/contracts';
import { Alert, Badge, Button, Field, Textarea, cn } from '@etare/ui';
import {
  BadgeCheck,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  GitCompareArrows,
  Inbox,
  MessageSquareWarning,
  Send,
} from 'lucide-react';
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
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import {
  queryKeys,
  useApiMutation,
  useContributions,
  useFieldReports,
  usePermissions,
  useRevision,
} from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { useTenant } from '@/providers/tenant-provider';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

const CHANGE_DOTS: Readonly<Record<EtareChange['change'], string>> = {
  added: 'bg-success',
  removed: 'bg-critical',
  modified: 'bg-info',
};

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
      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {changes.map((change) => (
          <li key={`${change.section}-${change.id}`} className="flex items-center gap-3 px-3 py-2">
            <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', CHANGE_DOTS[change.change])} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-foreground">{change.label}</span>
              <span className="block text-xs text-muted">{ETARE_SECTION_LABELS[change.section]}</span>
            </span>
            <span className="shrink-0 text-xs font-medium text-muted">{CHANGE_LABELS[change.change]}</span>
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
    <SectionCard
      icon={MessageSquareWarning}
      title={`Signalements intégrés (${reports.data.items.length})`}
      description="Écarts remontés du terrain que cette révision corrige."
    >
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
    </SectionCard>
  );
}

/** Proposals of exploitants integrated into this revision (their origin stays linked to the publication). */
function IntegratedContributions({ revisionId }: { revisionId: string }) {
  const reviews = usePermissions().has('contribution:review');
  const contributions = useContributions({ view: 'all', revision_id: revisionId, limit: 100 }, reviews);
  if (!reviews || !contributions.data || contributions.data.items.length === 0) return null;
  return (
    <SectionCard
      icon={Inbox}
      title={`Contributions intégrées (${contributions.data.items.length})`}
      description="Mises à jour proposées par les exploitants, reportées dans cette révision."
    >
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
    </SectionCard>
  );
}

/** One of the two decisions, as a card the person picks. */
function DecisionOption({
  selected,
  tone,
  title,
  detail,
  onSelect,
}: {
  selected: boolean;
  tone: 'success' | 'important';
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
        selected
          ? tone === 'success'
            ? 'border-success bg-success-soft/50'
            : 'border-important bg-important-soft/50'
          : 'border-border hover:bg-subtle',
      )}
    >
      <input
        type="radio"
        name="decision"
        className="mt-0.5 size-4 accent-brand-accent"
        checked={selected}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </label>
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
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
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
      <header className="mb-5">
        <nav aria-label="Fil d’Ariane" className="mb-3 flex items-center gap-1 text-sm text-muted">
          <Link href="/validations" className="hover:text-foreground hover:underline">
            Validations
          </Link>
          <ChevronRight aria-hidden="true" className="size-4" />
          <span className="truncate text-foreground">{siteName}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words text-foreground">
              {siteName} · révision n° {revision.revision_no}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {revision.base_publication_number
                ? `Passage de la version publiée n° ${revision.base_publication_number} à la révision n° ${revision.revision_no}.`
                : 'Première version publiée du dossier.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  revision.status === 'submitted' ? 'info' : revision.status === 'approved' ? 'success' : 'important'
                }
              >
                {REVISION_STATUS_LABELS[revision.status]}
              </Badge>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/sites/${revision.site_id}?onglet=etare`}>
              <FileCheck2 aria-hidden="true" className="size-4" />
              Dossier ETARE du site
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="min-w-0 space-y-4">
          <SectionCard
            icon={GitCompareArrows}
            title="Modifications"
            description="Éléments ajoutés, supprimés ou modifiés depuis la version publiée."
          >
            <Changes changes={changes} />
          </SectionCard>
          {snapshot ? (
            <EtareDocument snapshot={snapshot} versionLabel={`Révision n° ${revision.revision_no} (figée)`} />
          ) : (
            <Alert tone="info">Le contenu sera figé à la soumission.</Alert>
          )}
        </div>

        <aside className="space-y-4">
          {revision.status === 'submitted' && permissions.has('etare:approve') ? (
            <SectionCard
              icon={ClipboardCheck}
              title="Décider"
              description="Double authentification requise ; la décision porte sur ce contenu exact."
            >
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
                  <fieldset className="grid gap-2">
                    <legend className="sr-only">Décision</legend>
                    <DecisionOption
                      selected={choice === 'approve'}
                      tone="success"
                      title={canPublish ? 'Valider et publier' : 'Valider'}
                      detail={
                        canPublish
                          ? 'Une version immuable remplace la version actuelle sur les tablettes.'
                          : 'La révision est validée ; un validateur habilité la publiera.'
                      }
                      onSelect={() => setChoice('approve')}
                    />
                    <DecisionOption
                      selected={choice === 'changes'}
                      tone="important"
                      title="Demander une correction"
                      detail="Le rédacteur lit votre motif et reprend la révision."
                      onSelect={() => setChoice('changes')}
                    />
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
                  {decide.error ? <ApiErrorAlert error={decide.error} /> : null}
                  <Button
                    type="submit"
                    className="w-full"
                    variant={choice === 'approve' ? 'primary' : 'secondary'}
                    disabled={decide.isPending}
                  >
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
            </SectionCard>
          ) : null}

          <SectionCard icon={Send} title="Origine" contentClassName="space-y-3 px-5 py-4 text-sm">
            <p>
              Soumise par <span className="font-medium text-foreground">{revision.submitted_by?.name ?? '—'}</span>{' '}
              {revision.submitted_at ? agoLabel(revision.submitted_at, now) : ''}
              <span className="block text-xs text-muted">{when(revision.submitted_at)}</span>
            </p>
            {revision.change_summary ? (
              <p className="rounded-md bg-subtle px-3 py-2 text-foreground">{revision.change_summary}</p>
            ) : null}
            <p className="text-muted">
              Contributeurs : {contributors.map((person) => person.name).join(', ') || 'aucun'}.
            </p>
            {revision.content_hash ? (
              <p className="text-xs text-muted">
                Empreinte SHA-256 : <code className="break-all">{revision.content_hash}</code>
              </p>
            ) : null}
          </SectionCard>

          <IntegratedReports revisionId={revision.id} />
          <IntegratedContributions revisionId={revision.id} />

          {revision.decision ? (
            <SectionCard icon={BadgeCheck} title="Décision" contentClassName="space-y-2 px-5 py-4 text-sm">
              <p>
                <span className="font-medium text-foreground">
                  {revision.decision.decision === 'approved' ? 'Validée' : 'Corrections demandées'}
                </span>{' '}
                par {revision.decision.actor.name} le {when(revision.decision.created_at)}.
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
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </>
  );
}
