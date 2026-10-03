'use client';

import type { EtareCheck, EtareRevision, SiteDetail } from '@etare/contracts';
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
  cn,
} from '@etare/ui';
import Link from 'next/link';
import { useState } from 'react';
import { EtareDocument } from '@/components/etare/etare-document';
import { PublicationPdfButton } from '@/components/etare/publication-pdf-button';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PUBLICATION_STATUS_LABELS, REVISION_STATUS_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useEtarePreview, usePermissions, useSiteEtare } from '@/lib/queries';
import { ArchiveCard, WithdrawalSection, WithdrawnNotice } from './lifecycle-cards';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

const CHECK_STYLES: Readonly<Record<EtareCheck['level'], { mark: string; tone: string; label: string }>> = {
  ok: { mark: '✓', tone: 'text-success', label: 'conforme' },
  warning: { mark: '!', tone: 'text-important', label: 'à vérifier' },
  error: { mark: '✕', tone: 'text-critical', label: 'bloquant' },
};

const STATUS_TONES: Readonly<Record<EtareRevision['status'], 'neutral' | 'info' | 'success' | 'important'>> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  changes_requested: 'important',
  superseded: 'neutral',
};

function Checks({ checks }: { checks: readonly EtareCheck[] }) {
  return (
    <ul className="space-y-1.5" aria-label="Contrôle avant validation">
      {checks.map((check) => {
        const style = CHECK_STYLES[check.level];
        return (
          <li key={check.code} className="flex gap-2 text-sm">
            <span aria-hidden="true" className={cn('w-4 shrink-0 text-center font-bold', style.tone)}>
              {style.mark}
            </span>
            <span>
              <span className="font-medium">{check.label}</span>
              <span className="sr-only"> ({style.label})</span> — <span className="text-muted">{check.detail}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
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

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{open ? `Révision n° ${open.revision_no}` : 'Aucune révision en cours'}</CardTitle>
              <CardDescription>
                {open
                  ? `${REVISION_STATUS_LABELS[open.status]} — ouverte par ${open.created_by.name} le ${when(open.created_at)}`
                  : 'Les données de travail sont modifiables à tout moment ; une révision les fige pour validation.'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!open && latest?.status === 'changes_requested' && latest.decision ? (
              <Alert tone="important">
                Corrections demandées sur la révision n° {latest.revision_no} par {latest.decision.actor.name} : «{' '}
                {latest.decision.comment} »
              </Alert>
            ) : null}
            {archived ? (
              <Alert tone="info">Site archivé : restaurez-le pour préparer une nouvelle version.</Alert>
            ) : null}
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
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Contrôle avant validation</h3>
                {preview.isPending ? <LoadingCard lines={4} /> : null}
                {preview.error ? <ApiErrorAlert error={preview.error} /> : null}
                {preview.data ? <Checks checks={preview.data.checks} /> : null}
              </div>
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
                <Button type="submit" disabled={submit.isPending || blocking || summaryText.trim() === ''}>
                  {submit.isPending ? 'Soumission…' : 'Soumettre à validation'}
                </Button>
                {blocking && preview.data ? (
                  <p className="text-xs text-critical">Corrigez les points bloquants avant de soumettre.</p>
                ) : null}
              </form>
            ) : null}
          </CardContent>
        </Card>

        {preview.data && (open?.status === 'draft' || !open) ? (
          <EtareDocument snapshot={preview.data.snapshot} versionLabel="Version de travail (aperçu)" />
        ) : null}
      </div>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version publiée</CardTitle>
          </CardHeader>
          <CardContent>
            {active ? (
              <p className="text-sm">
                Version n° {active.publication_number}, publiée le {when(active.published_at)}. C’est la seule consultée
                par les intervenants.
                <span className="mt-1 block text-xs text-muted">
                  Manifeste {active.manifest_hash ? `${active.manifest_hash.slice(0, 12)}…` : '—'}
                </span>
              </p>
            ) : lastPublication?.status === 'withdrawn' ? (
              <WithdrawnNotice publication={lastPublication} />
            ) : (
              <p className="text-sm text-muted">Aucune version publiée : rien n’est encore diffusé sur le terrain.</p>
            )}
            {active?.has_pdf ? (
              <div className="mt-3">
                <PublicationPdfButton publicationId={active.id} number={active.publication_number} />
              </div>
            ) : null}
            {active ? (
              <div className="mt-3">
                <WithdrawalSection siteId={siteId} active={active} />
              </div>
            ) : null}
          </CardContent>
        </Card>
        <ArchiveCard site={site} etare={etare.data} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historique</CardTitle>
          </CardHeader>
          <CardContent>
            {revisions.length === 0 ? (
              <p className="text-sm text-muted">Aucune révision.</p>
            ) : (
              <ol className="space-y-3">
                {revisions.map((revision) => (
                  <li key={revision.id} className="text-sm">
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
                    {revision.change_summary ? <p className="text-xs">{revision.change_summary}</p> : null}
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
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
