'use client';

import type { PortalContribution } from '@etare/contracts';
import { FINAL_CONTRIBUTION_STATUSES, type ContributionStatus } from '@etare/domain';
import { Alert, Badge, Button, Field, Textarea } from '@etare/ui';
import { useState } from 'react';
import { ContributionValues } from '@/components/contribution-values';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CONTRIBUTION_OPERATION_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  CONTRIBUTION_TARGET_LABELS,
  SCAN_STATUS_LABELS,
} from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, usePortalContributions } from '@/lib/queries';

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

export const CONTRIBUTION_STATUS_TONES: Readonly<
  Record<ContributionStatus, 'info' | 'important' | 'success' | 'neutral' | 'critical'>
> = {
  submitted: 'info',
  in_review: 'info',
  info_requested: 'important',
  accepted: 'success',
  partially_accepted: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
};

function Outcome({ contribution }: { contribution: PortalContribution }) {
  if (contribution.status === 'withdrawn')
    return <p className="text-sm text-muted">Vous avez retiré cette proposition.</p>;
  if (!FINAL_CONTRIBUTION_STATUSES.has(contribution.status)) return null;
  return (
    <div className="space-y-1 rounded-md bg-subtle px-3 py-2 text-sm">
      <p className="font-semibold">Réponse du SIS</p>
      {contribution.decision_comment ? <p className="whitespace-pre-wrap">{contribution.decision_comment}</p> : null}
      {contribution.resolution ? (
        <p className="text-muted">
          Intégrée à la révision n° {contribution.resolution.revision_no} du dossier
          {contribution.resolution.publication_number
            ? `, publiée en version n° ${contribution.resolution.publication_number}.`
            : ' : elle sera visible ici après sa validation et sa publication par le SIS.'}
        </p>
      ) : null}
    </div>
  );
}

function ContributionCard({ contribution }: { contribution: PortalContribution }) {
  const [answer, setAnswer] = useState('');
  const invalidate = (tenantId: string) => [queryKeys.portalContributions(tenantId)];
  const reply = useApiMutation(
    (options, body: string) => api.replyPortalContribution(options, contribution.id, body),
    invalidate,
  );
  const withdraw = useApiMutation(
    (options, _: undefined) => api.withdrawPortalContribution(options, contribution.id),
    invalidate,
  );
  const open = !FINAL_CONTRIBUTION_STATUSES.has(contribution.status);

  return (
    <li className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{contribution.title}</p>
          <p className="text-xs text-muted">
            {CONTRIBUTION_OPERATION_LABELS[contribution.operation]} ·{' '}
            {CONTRIBUTION_TARGET_LABELS[contribution.target_type]} · envoyée le{' '}
            {dateTime.format(new Date(contribution.created_at))}
            {contribution.publication_number ? ` sur la version n° ${contribution.publication_number}` : ''}
          </p>
        </div>
        <Badge tone={CONTRIBUTION_STATUS_TONES[contribution.status]}>
          {CONTRIBUTION_STATUS_LABELS[contribution.status]}
        </Badge>
      </div>
      <p className="text-sm whitespace-pre-wrap">{contribution.description}</p>
      <ContributionValues
        base={contribution.base_value}
        proposed={contribution.proposed_value}
        removal={contribution.operation === 'delete'}
      />
      {contribution.files.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {contribution.files.map((file, index) => (
            <li key={index}>
              <Badge tone={file.scan_status === 'rejected' ? 'critical' : 'neutral'}>
                {file.filename} · {SCAN_STATUS_LABELS[file.scan_status]}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {contribution.messages.length > 0 ? (
        <ol className="space-y-2 border-l-2 border-border pl-3 text-sm">
          {contribution.messages.map((message) => (
            <li key={message.id}>
              <p className="text-xs text-muted">
                {message.side === 'sis' ? (message.author_name ?? 'Le SIS') : 'Vous'} ·{' '}
                {dateTime.format(new Date(message.created_at))}
                {message.kind === 'info_request' ? ' · demande de précision' : ''}
              </p>
              <p className="whitespace-pre-wrap">{message.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
      <Outcome contribution={contribution} />
      {contribution.status === 'info_requested' ? (
        <Alert tone="important">Le SIS vous demande une précision : répondez ci-dessous.</Alert>
      ) : null}
      {open ? (
        <form
          noValidate
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (answer.trim()) reply.mutate(answer.trim(), { onSuccess: () => setAnswer('') });
          }}
        >
          <Field label="Message au SIS" htmlFor={`answer-${contribution.id}`}>
            <Textarea
              id={`answer-${contribution.id}`}
              rows={2}
              maxLength={4000}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
            />
          </Field>
          {reply.error ? <ApiErrorAlert error={reply.error} /> : null}
          {withdraw.error ? <ApiErrorAlert error={withdraw.error} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" variant="secondary" disabled={reply.isPending || !answer.trim()}>
              Envoyer
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate(undefined)}
            >
              Retirer la proposition
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/** Proposals of the exploitant on this site, with the exchange and the outcome (POR-03). */
export function MyContributions({ siteId }: { siteId: string }) {
  const contributions = usePortalContributions(siteId);
  if (contributions.isPending) return <LoadingCard lines={2} />;
  if (contributions.error) return <ApiErrorAlert error={contributions.error} />;
  if (contributions.data.length === 0) {
    return <p className="text-sm text-muted">Vous n’avez encore rien proposé pour ce site.</p>;
  }
  return (
    <ul className="space-y-3">
      {contributions.data.map((contribution) => (
        <ContributionCard key={contribution.id} contribution={contribution} />
      ))}
    </ul>
  );
}
