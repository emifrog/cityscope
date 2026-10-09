'use client';

import type { EtareCheck, EtareRevision, SiteDetail } from '@etare/contracts';
import { Alert, Badge, Button, Field, Textarea, cn } from '@etare/ui';
import {
  Check,
  CircleCheck,
  CircleX,
  FileCheck2,
  History,
  PencilLine,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EtareDocument } from '@/components/etare/etare-document';
import { PublicationPdfButton } from '@/components/etare/publication-pdf-button';
import { revisionSteps, summarizeChecks, type RevisionStep } from '@/components/etare/revision-steps';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PUBLICATION_STATUS_LABELS, REVISION_STATUS_LABELS } from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useEtarePreview, usePermissions, useSiteEtare } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { ArchiveCard, WithdrawalSection, WithdrawnNotice } from './lifecycle-cards';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

const CHECK_STYLES: Readonly<
  Record<EtareCheck['level'], { icon: LucideIcon; tone: string; row: string; label: string }>
> = {
  ok: { icon: CircleCheck, tone: 'text-success', row: '', label: 'conforme' },
  warning: { icon: TriangleAlert, tone: 'text-important', row: 'bg-important-soft/60', label: 'à vérifier' },
  error: { icon: CircleX, tone: 'text-critical', row: 'bg-critical-soft/60', label: 'bloquant' },
};

const STATUS_TONES: Readonly<Record<EtareRevision['status'], 'neutral' | 'info' | 'success' | 'important'>> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  changes_requested: 'important',
  superseded: 'neutral',
};

/** The three steps of the cycle, the current one in the accent colour, what blocks in red. */
function Steps({ steps }: { steps: readonly RevisionStep[] }) {
  return (
    <ol aria-label="Cycle du dossier" className="flex items-start">
      {steps.map((step, index) => {
        const previousDone = index > 0 && steps[index - 1]?.state === 'done';
        return (
          <li key={step.key} className={cn('flex min-w-0 items-start', index > 0 && 'flex-1')}>
            {index > 0 ? (
              <span aria-hidden="true" className={cn('mt-4 h-0.5 flex-1', previousDone ? 'bg-success' : 'bg-border')} />
            ) : null}
            <div className="flex shrink-0 flex-col items-center px-2 text-center">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-sm font-bold',
                  step.state === 'done' && 'bg-success text-white',
                  step.state === 'current' && 'border-2 border-brand-accent bg-surface text-brand-accent-strong',
                  step.state === 'blocked' && 'bg-critical text-white',
                  step.state === 'todo' && 'border border-border bg-surface text-muted',
                )}
              >
                {step.state === 'done' ? <Check className="size-4" /> : step.state === 'blocked' ? '!' : index + 1}
              </span>
              <span
                className={cn(
                  'mt-1.5 text-xs font-semibold',
                  step.state === 'todo' ? 'text-muted' : 'text-foreground',
                  step.state === 'blocked' && 'text-critical',
                )}
              >
                {step.label}
                <span className="sr-only">
                  {step.state === 'done'
                    ? ' (terminée)'
                    : step.state === 'current'
                      ? ' (en cours)'
                      : step.state === 'blocked'
                        ? ' (bloquée)'
                        : ' (à venir)'}
                </span>
              </span>
              {step.note ? <span className="mt-0.5 max-w-32 text-xs text-muted">{step.note}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Checks({ checks }: { checks: readonly EtareCheck[] }) {
  const summary = summarizeChecks(checks);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Contrôle avant validation</h3>
        <Badge tone="success">
          {summary.ok} conforme{summary.ok > 1 ? 's' : ''}
        </Badge>
        {summary.warning > 0 ? <Badge tone="important">{summary.warning} à vérifier</Badge> : null}
        {summary.error > 0 ? (
          <Badge tone="critical">
            {summary.error} bloquant{summary.error > 1 ? 's' : ''}
          </Badge>
        ) : null}
      </div>
      <ul className="divide-y divide-border rounded-md border border-border" aria-label="Contrôle avant validation">
        {checks.map((check) => {
          const style = CHECK_STYLES[check.level];
          const Icon = style.icon;
          return (
            <li key={check.code} className={cn('flex gap-2.5 px-3 py-2 text-sm', style.row)}>
              <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', style.tone)} />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{check.label}</span>
                <span className="sr-only"> ({style.label})</span>
                <span className="block text-xs text-muted">{check.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Dot of the timeline, coloured like the status of the revision. */
const DOT_TONES: Readonly<Record<EtareRevision['status'], string>> = {
  draft: 'bg-muted',
  submitted: 'bg-info',
  approved: 'bg-success',
  changes_requested: 'bg-important',
  superseded: 'bg-border',
};

/**
 * ETARE of a site (ETARE-01, WF-01): the published version, the revision in
 * progress with its checks and a faithful preview, submission to validation,
 * and the history of revisions and publications.
 */
export function EtarePanel({ site }: { site: SiteDetail }) {
  const siteId = site.id;
  const permissions = usePermissions();
  const etare = useSiteEtare(siteId);
  const open = etare.data?.revisions.find((revision) => revision.status === 'draft' || revision.status === 'submitted');
  const preview = useEtarePreview(siteId, !open || open.status === 'draft');
  const [summary, setSummary] = useState<string | null>(null);
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const invalidate = (tenantId: string) => [
    queryKeys.siteRecords(tenantId, siteId, 'etare'),
    queryKeys.siteRecords(tenantId, siteId, 'etare-preview'),
    queryKeys.etare(tenantId),
    queryKeys.site(tenantId, siteId),
  ];
  const create = useApiMutation((options, _: undefined) => api.createRevision(options, siteId, {}), invalidate);
  const submit = useApiMutation(
    (options, revision: EtareRevision) =>
      api.submitRevision(options, revision.id, revision.row_version, {
        change_summary: (summary ?? revision.change_summary ?? '').trim(),
      }),
    invalidate,
  );
  const republish = useApiMutation((options, id: string) => api.publishRevision(options, id), invalidate);

  if (etare.isPending) return <LoadingCard lines={5} />;
  if (etare.error) return <ApiErrorAlert error={etare.error} />;
  const { revisions, publications } = etare.data;
  const active = publications.find((publication) => publication.status === 'published');
  const lastPublication = publications.find((publication) =>
    ['published', 'superseded', 'withdrawn'].includes(publication.status),
  );
  const archived = site.status === 'archived';
  const latest = revisions[0];
  const blocking = preview.data?.checks.some((check) => check.level === 'error') ?? true;
  const summaryText = summary ?? open?.change_summary ?? '';
  const failed = revisions.find(
    (revision) => revision.status === 'approved' && revision.publication?.status === 'failed',
  );
  const inProgress = revisions.find(
    (revision) => revision.publication?.status === 'queued' || revision.publication?.status === 'building',
  );
  const steps = revisionSteps(open, latest, Boolean(active));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      <div className="min-w-0 space-y-4">
        {inProgress ? (
          <Alert tone="info">
            Publication n° {inProgress.publication?.publication_number} en cours de fabrication à partir de la révision
            n° {inProgress.revision_no} validée.
          </Alert>
        ) : null}
        {failed ? (
          <Alert tone="critical">
            La fabrication de la publication de la révision n° {failed.revision_no} a échoué (
            {failed.publication?.failure_code}). La version précédente reste active.{' '}
            {permissions.has('publication:publish') ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={republish.isPending}
                onClick={() => republish.mutate(failed.id)}
              >
                Relancer la publication
              </Button>
            ) : null}
          </Alert>
        ) : null}
        {republish.error ? <ApiErrorAlert error={republish.error} /> : null}

        <SectionCard
          icon={PencilLine}
          title={open ? `Révision n° ${open.revision_no}` : 'Aucune révision en cours'}
          description={
            open
              ? `Ouverte par ${open.created_by.name} ${agoLabel(open.created_at, now)}, le ${when(open.created_at)}.`
              : 'Les données de travail sont modifiables à tout moment ; une révision les fige pour validation.'
          }
          aside={open ? <Badge tone={STATUS_TONES[open.status]}>{REVISION_STATUS_LABELS[open.status]}</Badge> : null}
          contentClassName="space-y-5 px-5 py-4"
        >
          <Steps steps={steps} />

          {!open && latest?.status === 'changes_requested' && latest.decision ? (
            <Alert tone="important">
              Corrections demandées sur la révision n° {latest.revision_no} par {latest.decision.actor.name} : «{' '}
              {latest.decision.comment} »
            </Alert>
          ) : null}
          {archived ? <Alert tone="info">Site archivé : restaurez-le pour préparer une nouvelle version.</Alert> : null}
          {!open && !archived ? (
            permissions.has('etare:edit') ? (
              <Button disabled={create.isPending} onClick={() => create.mutate(undefined)}>
                Préparer une nouvelle version
              </Button>
            ) : null
          ) : null}
          {create.error ? <ApiErrorAlert error={create.error} /> : null}

          {open?.status === 'submitted' ? (
            <Alert tone="info">
              Soumise par {open.submitted_by?.name} le {when(open.submitted_at)} : le contenu est figé (empreinte{' '}
              <code className="text-xs">{open.content_hash?.slice(0, 12)}…</code>). Un validateur qui n’y a pas
              contribué la contrôle.{' '}
              <Link href={`/validations/${open.id}`} className="font-medium underline">
                Voir la révision soumise
              </Link>
            </Alert>
          ) : null}

          {open?.status === 'draft' || !open ? (
            <>
              {preview.isPending ? <LoadingCard lines={4} /> : null}
              {preview.error ? <ApiErrorAlert error={preview.error} /> : null}
              {preview.data ? <Checks checks={preview.data.checks} /> : null}
            </>
          ) : null}

          {open?.status === 'draft' && permissions.has('etare:submit') ? (
            <form
              noValidate
              className="space-y-3 border-t border-border pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                submit.mutate(open, { onSuccess: () => setSummary(null) });
              }}
            >
              <Field
                label="Résumé des changements"
                htmlFor="revision-summary"
                hint="Lu par le validateur : ce qui change et pourquoi."
              >
                <Textarea
                  id="revision-summary"
                  rows={3}
                  maxLength={2000}
                  value={summaryText}
                  onChange={(event) => setSummary(event.target.value)}
                />
              </Field>
              {submit.error ? <ApiErrorAlert error={submit.error} /> : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={submit.isPending || blocking || summaryText.trim() === ''}>
                  {submit.isPending ? 'Soumission…' : 'Soumettre à validation'}
                </Button>
                {blocking && preview.data ? (
                  <p className="text-xs text-critical">Corrigez les points bloquants avant de soumettre.</p>
                ) : null}
              </div>
            </form>
          ) : null}
        </SectionCard>

        {preview.data && (open?.status === 'draft' || !open) ? (
          <EtareDocument snapshot={preview.data.snapshot} versionLabel="Version de travail (aperçu)" />
        ) : null}
      </div>

      <aside className="space-y-4">
        <SectionCard
          icon={FileCheck2}
          title="Version publiée"
          description="La seule consultée par les intervenants."
          contentClassName="space-y-3 px-5 py-4"
        >
          {active ? (
            <div>
              <p className="text-3xl font-bold text-foreground">n° {active.publication_number}</p>
              <p className="text-sm text-foreground">
                Publiée {agoLabel(active.published_at ?? '', now)}
                <span className="block text-xs text-muted">{when(active.published_at)}</span>
              </p>
              <p className="mt-2 text-xs text-muted">
                Empreinte {active.manifest_hash ? `${active.manifest_hash.slice(0, 12)}…` : '—'}
              </p>
            </div>
          ) : lastPublication?.status === 'withdrawn' ? (
            <WithdrawnNotice publication={lastPublication} />
          ) : (
            <p className="text-sm text-muted">Aucune version publiée : rien n’est encore diffusé sur le terrain.</p>
          )}
          {active?.has_pdf ? (
            <PublicationPdfButton publicationId={active.id} number={active.publication_number} />
          ) : null}
          {active ? <WithdrawalSection siteId={siteId} active={active} /> : null}
        </SectionCard>
        <ArchiveCard site={site} etare={etare.data} />
        <SectionCard icon={History} title="Historique" description="Chaque révision, de la plus récente à la première.">
          {revisions.length === 0 ? (
            <p className="text-sm text-muted">Aucune révision.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {revisions.map((revision) => (
                <li key={revision.id} className="relative text-sm">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-1.5 -left-[1.4375rem] size-2.5 rounded-full ring-4 ring-surface',
                      DOT_TONES[revision.status],
                    )}
                  />
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Révision n° {revision.revision_no}</span>
                    <Badge tone={STATUS_TONES[revision.status]}>{REVISION_STATUS_LABELS[revision.status]}</Badge>
                    {revision.publication ? (
                      <Badge tone={revision.publication.status === 'failed' ? 'critical' : 'neutral'}>
                        {PUBLICATION_STATUS_LABELS[revision.publication.status]} · n°{' '}
                        {revision.publication.publication_number}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {revision.submitted_by
                      ? `Soumise par ${revision.submitted_by.name} le ${when(revision.submitted_at)}`
                      : `Ouverte par ${revision.created_by.name} le ${when(revision.created_at)}`}
                    {revision.decision
                      ? ` · décision de ${revision.decision.actor.name} le ${when(revision.decision.created_at)}`
                      : ''}
                  </p>
                  {revision.change_summary ? <p className="mt-0.5 text-xs">{revision.change_summary}</p> : null}
                  {revision.publication?.withdrawal ? (
                    <p className="text-xs text-important">
                      Retirée le {when(revision.publication.withdrawal.withdrawn_at)} : «{' '}
                      {revision.publication.withdrawal.reason} »
                    </p>
                  ) : null}
                  {revision.status !== 'draft' ? (
                    <Link href={`/validations/${revision.id}`} className="text-xs text-info hover:underline">
                      Détail
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </aside>
    </div>
  );
}
