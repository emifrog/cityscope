'use client';

import type { Asset, FieldReport, FieldReportUpdate } from '@etare/contracts';
import { FINAL_REPORT_STATUSES } from '@etare/domain';
import { Alert, Badge, Button, Field, Textarea, cn } from '@etare/ui';
import { BadgeCheck, Camera, ChevronRight, ClipboardCheck, FileCheck2 } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  OBJECT_STATUS_LABELS,
  RECORD_STATUS_LABELS,
  REJECTION_REASON_LABELS,
  REPORT_CATEGORY_LABELS,
  REPORT_ITEM_LABELS,
  REPORT_SEVERITY_LABELS,
  REPORT_STATUS_LABELS,
  REVISION_STATUS_LABELS,
  SCAN_STATUS_LABELS,
} from '@/components/labels';
import { REPORT_CATEGORY_ICONS } from '@/components/report-category-icon';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { queryKeys, useApiMutation, useAssetUrl, useFieldReport, usePermissions, useSiteEtare } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { useTenant } from '@/providers/tenant-provider';
import { SEVERITY_TONES, STATUS_TONES } from '../field-reports-list';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const when = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : '—');

/** State of the designated element in the working data, in words. */
function itemState(status: string | null): string {
  if (status === null) return 'n’existe plus dans les données de travail';
  const label =
    (OBJECT_STATUS_LABELS as Readonly<Record<string, string>>)[status] ??
    (RECORD_STATUS_LABELS as Readonly<Record<string, string>>)[status] ??
    status;
  return `état actuel : ${label.toLowerCase()}`;
}

function Photo({ asset }: { asset: Asset }) {
  const clean = asset.scan_status === 'clean';
  // Reduced image in the list (CAP-03); the larger preview is fetched only when opened.
  const image = useAssetUrl(clean ? asset.id : null, 'thumbnail');
  const open = useApiMutation(
    (options, id: string) => api.getAssetDownload(options, id, 'preview'),
    () => [],
  );
  return (
    <li className="overflow-hidden rounded-md border border-border">
      <div className="flex aspect-[4/3] items-center justify-center bg-subtle">
        {clean && image.data ? (
          <button
            type="button"
            className="size-full"
            title="Ouvrir la photo"
            disabled={open.isPending}
            onClick={() => open.mutate(asset.id, { onSuccess: (ticket) => openInNewTab(ticket.url) })}
          >
            {/* Short-lived signed URL of a checked file: next/image cannot optimize it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.data.url} alt={asset.filename} className="size-full object-cover" />
          </button>
        ) : (
          <Badge tone={asset.scan_status === 'rejected' ? 'critical' : 'info'}>
            {SCAN_STATUS_LABELS[asset.scan_status]}
          </Badge>
        )}
      </div>
      {asset.scan_status === 'rejected' ? (
        <p className="px-2 py-1 text-xs text-critical">
          Refusée : {REJECTION_REASON_LABELS[asset.rejection_reason ?? ''] ?? 'fichier non conforme'}.
        </p>
      ) : null}
    </li>
  );
}

/** One of the three steps of the instruction, numbered, done or not. */
function Step({
  number,
  title,
  done,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          done ? 'bg-success text-white' : 'border border-border bg-surface text-muted',
        )}
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {children}
      </div>
    </section>
  );
}

function Instruction({ report }: { report: FieldReport }) {
  const { me } = useTenant();
  const permissions = usePermissions();
  const etare = useSiteEtare(report.site_id);
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const update = useApiMutation(
    (options, patch: FieldReportUpdate) => api.updateFieldReport(options, report.id, report.row_version, patch),
    (tenantId) => [queryKeys.fieldReports(tenantId)],
  );
  const openRevision = useApiMutation(
    (options, _: undefined) =>
      api.createRevision(options, report.site_id, { change_summary: 'Correction issue d’un signalement terrain' }),
    (tenantId) => [queryKeys.siteRecords(tenantId, report.site_id, 'etare'), queryKeys.etare(tenantId)],
  );
  const draft = etare.data?.revisions.find((revision) => revision.status === 'draft');

  function decide(status: 'resolved' | 'rejected') {
    if (!comment.trim()) {
      setProblem('Motivez la décision : l’agent la lira sur sa tablette.');
      return;
    }
    setProblem(null);
    update.mutate({ status, decision_comment: comment.trim() });
  }

  return (
    <SectionCard
      icon={ClipboardCheck}
      title="Instruction"
      description="La correction passe par une révision de travail, puis par la validation habituelle."
      contentClassName="space-y-5 px-5 py-4 text-sm"
    >
      {update.error ? <ApiErrorAlert error={update.error} /> : null}
      <Step number={1} title="Prise en charge" done={report.assigned_to !== null}>
        {report.assigned_to ? (
          <p>Pris en charge par {report.assigned_to.name}.</p>
        ) : (
          <p className="text-muted">Personne ne suit encore ce signalement.</p>
        )}
        {me && report.assigned_to?.id !== me.user.id ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={update.isPending}
            onClick={() => update.mutate({ status: 'triaged', assigned_to: me.user.id })}
          >
            {report.assigned_to ? 'Reprendre à mon compte' : 'Prendre en charge'}
          </Button>
        ) : null}
      </Step>
      <Step number={2} title="Correction" done={report.resolution !== null}>
        {report.resolution ? (
          <p>
            Intégré à la révision n° {report.resolution.revision_no} (
            {(REVISION_STATUS_LABELS as Readonly<Record<string, string>>)[
              report.resolution.revision_status
            ]?.toLowerCase() ?? report.resolution.revision_status}
            ).
          </p>
        ) : draft ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={update.isPending}
            onClick={() => update.mutate({ resolution_revision_id: draft.id })}
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
        <Link href={`/sites/${report.site_id}?onglet=etare`} className="block text-info hover:underline">
          Dossier ETARE du site
        </Link>
      </Step>
      <Step number={3} title="Décision" done={false}>
        <form
          noValidate
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            decide('resolved');
          }}
        >
          <Field label="Motif, lu par l’agent" htmlFor="report-decision" error={problem ?? undefined}>
            <Textarea
              id="report-decision"
              rows={3}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>
          <p className="text-xs text-muted">
            « Traité » signifie une décision documentée (correction intégrée, visite de vérification programmée…), pas
            nécessairement une correction déjà publiée. La décision est définitive.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={update.isPending}>
              Clore : traité
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={update.isPending}
              onClick={() => decide('rejected')}
            >
              Rejeter
            </Button>
          </div>
        </form>
      </Step>
    </SectionCard>
  );
}

/** Detail and instruction of a field report (OPS-04, TER-04). */
export function FieldReportDetail({ id }: { id: string }) {
  const permissions = usePermissions();
  const detail = useFieldReport(id);
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());

  if (!permissions.has('field_report:review')) {
    return <Alert tone="info">Les signalements sont instruits par la Prévision et l’administration du SIS.</Alert>;
  }
  if (detail.isPending) return <LoadingCard lines={6} />;
  if (detail.error) return <ApiErrorAlert error={detail.error} />;
  const report = detail.data;
  const decided = FINAL_REPORT_STATUSES.has(report.status);
  const outdated =
    report.current_publication_number !== null &&
    report.current_publication_number !== report.publication.publication_number;
  const CategoryIcon = REPORT_CATEGORY_ICONS[report.category];

  return (
    <>
      <header className="mb-5">
        <nav aria-label="Fil d’Ariane" className="mb-3 flex items-center gap-1 text-sm text-muted">
          <Link href="/signalements" className="hover:text-foreground hover:underline">
            Signalements
          </Link>
          <ChevronRight aria-hidden="true" className="size-4" />
          <span className="truncate text-foreground">{report.site_name}</span>
        </nav>
        <div className="flex flex-wrap items-start gap-4">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-14 shrink-0 items-center justify-center rounded-card',
              report.severity === 'urgent'
                ? 'bg-critical text-white'
                : report.severity === 'important'
                  ? 'bg-important text-white'
                  : 'bg-brand-navy text-white',
            )}
          >
            <CategoryIcon className="size-7" />
          </span>
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="text-2xl font-bold break-words text-foreground">
              {REPORT_CATEGORY_LABELS[report.category]} · {report.site_name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Signalé par {report.reporter.name} {agoLabel(report.received_at, now)}, le {when(report.received_at)}.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>
              <Badge tone={SEVERITY_TONES[report.severity]}>{REPORT_SEVERITY_LABELS[report.severity]}</Badge>
              {report.etare_number ? <Badge>N° ETARE {report.etare_number}</Badge> : null}
            </div>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href={`/sites/${report.site_id}`}>
              <FileCheck2 aria-hidden="true" className="size-4" />
              Fiche du site
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <div className="min-w-0 space-y-4">
          <SectionCard
            icon={CategoryIcon}
            title="Constat"
            description={`Constaté sur place ${agoLabel(report.observed_at, now)}, le ${when(report.observed_at)}.`}
            contentClassName="space-y-3 px-5 py-4 text-sm"
          >
            <p className="rounded-md bg-subtle px-3 py-2 whitespace-pre-wrap">{report.description}</p>
          </SectionCard>

          <SectionCard
            icon={FileCheck2}
            title="Version consultée"
            description="Ce que l’agent avait sous les yeux, et ce qu’en disent les données de travail."
            contentClassName="space-y-3 px-5 py-4 text-sm"
          >
            <p>
              L’agent consultait la version publiée n° {report.publication.publication_number}
              {report.etare_number ? ` du dossier ${report.etare_number}` : ''}.
            </p>
            {outdated ? (
              <Alert tone="important">
                La version publiée actuelle est la n° {report.current_publication_number} : vérifiez si l’écart est déjà
                corrigé.
              </Alert>
            ) : null}
            {report.item ? (
              <p>
                {REPORT_ITEM_LABELS[report.item.type]} visé : <span className="font-medium">{report.item.label}</span>{' '}
                <span className="text-muted">({itemState(report.item.current_status)})</span>
              </p>
            ) : (
              <p className="text-muted">Aucun élément désigné : le constat porte sur le site.</p>
            )}
            {report.plan_position ? (
              <p>
                Position sur le plan « {report.plan_position.plan_title ?? 'plan'} » (
                {Math.round(report.plan_position.x)}, {Math.round(report.plan_position.y)} px).{' '}
                <Link href={`/sites/${report.site_id}?onglet=plans`} className="text-info hover:underline">
                  Plans du site
                </Link>
              </p>
            ) : null}
            <Link href={`/sites/${report.site_id}`} className="inline-block text-info hover:underline">
              Données de travail du site
            </Link>
          </SectionCard>

          <SectionCard icon={Camera} title={`Photos (${report.photos.length})`}>
            {report.photos.length === 0 ? (
              <p className="text-sm text-muted">Aucune photo jointe.</p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                {report.photos.map((asset) => (
                  <Photo key={asset.id} asset={asset} />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-4">
          {decided ? (
            <SectionCard icon={BadgeCheck} title="Décision" contentClassName="space-y-2 px-5 py-4 text-sm">
              <p>
                <span className="font-medium text-foreground">{REPORT_STATUS_LABELS[report.status]}</span> par{' '}
                {report.decided_by?.name ?? '—'} le {when(report.decided_at)}.
              </p>
              {report.decision_comment ? (
                <p className="rounded-md bg-subtle px-3 py-2 whitespace-pre-wrap">{report.decision_comment}</p>
              ) : null}
              {report.resolution ? (
                <p>
                  Correction intégrée à la révision n° {report.resolution.revision_no}
                  {report.resolution.publication_number
                    ? `, publiée en version n° ${report.resolution.publication_number}.`
                    : ', pas encore publiée.'}
                </p>
              ) : null}
            </SectionCard>
          ) : (
            <Instruction report={report} />
          )}
        </aside>
      </div>
    </>
  );
}
