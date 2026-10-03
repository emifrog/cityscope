'use client';

import type { Asset, FieldReport, FieldReportUpdate } from '@etare/contracts';
import { FINAL_REPORT_STATUSES } from '@etare/domain';
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
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import { queryKeys, useApiMutation, useAssetUrl, useFieldReport, usePermissions, useSiteEtare } from '@/lib/queries';
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
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="text-base">Instruction</CardTitle>
          <CardDescription>
            La correction passe par une révision de travail, puis par la validation habituelle.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {update.error ? <ApiErrorAlert error={update.error} /> : null}
        <section className="space-y-2">
          <h3 className="font-semibold">Prise en charge</h3>
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
              Prendre en charge
            </Button>
          ) : null}
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">Correction</h3>
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
        </section>
        <form
          noValidate
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            decide('resolved');
          }}
        >
          <h3 className="font-semibold">Décision</h3>
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
      </CardContent>
    </Card>
  );
}

/** Detail and instruction of a field report (OPS-04, TER-04). */
export function FieldReportDetail({ id }: { id: string }) {
  const permissions = usePermissions();
  const detail = useFieldReport(id);

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

  return (
    <>
      <PageHeader
        title={`${REPORT_CATEGORY_LABELS[report.category]} — ${report.site_name}`}
        description={`Signalé par ${report.reporter.name}, reçu le ${when(report.received_at)}.`}
        actions={<Badge tone={STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Constat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex flex-wrap gap-2">
                <Badge tone={SEVERITY_TONES[report.severity]}>{REPORT_SEVERITY_LABELS[report.severity]}</Badge>
                <Badge>{REPORT_CATEGORY_LABELS[report.category]}</Badge>
              </p>
              <p className="rounded-md bg-subtle px-3 py-2 whitespace-pre-wrap">{report.description}</p>
              <p className="text-muted">Constaté le {when(report.observed_at)}.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version consultée</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                L’agent consultait la version publiée n° {report.publication.publication_number}
                {report.etare_number ? ` du dossier ${report.etare_number}` : ''}.
              </p>
              {outdated ? (
                <Alert tone="important">
                  La version publiée actuelle est la n° {report.current_publication_number} : vérifiez si l’écart est
                  déjà corrigé.
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
              <Link href={`/sites/${report.site_id}`} className="text-info hover:underline">
                Données de travail du site
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Photos ({report.photos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {report.photos.length === 0 ? (
                <p className="text-sm text-muted">Aucune photo jointe.</p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
                  {report.photos.map((asset) => (
                    <Photo key={asset.id} asset={asset} />
                  ))}
                </ul>
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
                  {REPORT_STATUS_LABELS[report.status]} par {report.decided_by?.name ?? '—'} le{' '}
                  {when(report.decided_at)}.
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
              </CardContent>
            </Card>
          ) : (
            <Instruction report={report} />
          )}
        </aside>
      </div>
    </>
  );
}
