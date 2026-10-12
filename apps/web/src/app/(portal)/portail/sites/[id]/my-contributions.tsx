'use client';

import type { PortalContribution } from '@etare/contracts';
import { FINAL_CONTRIBUTION_STATUSES, type ContributionStatus } from '@etare/domain';
import { Alert, Badge, Button, Field, Textarea, cn } from '@etare/ui';
import { BadgeCheck, MessageSquareDashed, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { CONTRIBUTION_TARGET_ICONS } from '@/components/contribution-target-icon';
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
import { agoLabel } from '@/lib/relative-time';

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

/** Colour of the pictogram box: waiting, answer expected, decided. */
const BOXES: Readonly<Record<ContributionStatus, string>> = {
  submitted: 'bg-info-soft text-info',
  in_review: 'bg-info-soft text-info',
  info_requested: 'bg-important-soft text-important',
  accepted: 'bg-success-soft text-success',
  partially_accepted: 'bg-success-soft text-success',
  rejected: 'bg-subtle text-muted',
  withdrawn: 'bg-subtle text-muted',
};

function Outcome({ contribution }: { contribution: PortalContribution }) {
  if (contribution.status === 'withdrawn')
    return <p className="text-sm text-muted">Vous avez retiré cette proposition.</p>;
  if (!FINAL_CONTRIBUTION_STATUSES.has(contribution.status)) return null;
  const accepted = contribution.status !== 'rejected';
  return (
    <div className={cn('space-y-1 rounded-md px-3 py-2 text-sm', accepted ? 'bg-success-soft/50' : 'bg-subtle')}>
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <BadgeCheck aria-hidden="true" className="size-4" />
        Réponse du SIS : {CONTRIBUTION_STATUS_LABELS[contribution.status].toLowerCase()}
      </p>
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

function ContributionRow({ contribution, now }: { contribution: PortalContribution; now: number }) {
  const [answer, setAnswer] = useState('');
  const [replying, setReplying] = useState(contribution.status === 'info_requested');
  const [withdrawing, setWithdrawing] = useState(false);
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
  const Icon = CONTRIBUTION_TARGET_ICONS[contribution.target_type];

  return (
    <li className="grid gap-3 rounded-md border border-border p-4 md:grid-cols-[auto_minmax(0,1fr)]">
      <span
        aria-hidden="true"
        className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', BOXES[contribution.status])}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 space-y-3">
        <div>
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{contribution.title}</span>
            <Badge tone={CONTRIBUTION_STATUS_TONES[contribution.status]}>
              {CONTRIBUTION_STATUS_LABELS[contribution.status]}
            </Badge>
          </p>
          <p className="mt-1 text-xs text-muted">
            {CONTRIBUTION_OPERATION_LABELS[contribution.operation]} ·{' '}
            {CONTRIBUTION_TARGET_LABELS[contribution.target_type]} · envoyée {agoLabel(contribution.created_at, now)},
            le {dateTime.format(new Date(contribution.created_at))}
            {contribution.publication_number ? ` · sur la version n° ${contribution.publication_number}` : ''}
          </p>
        </div>
        <p className="text-sm whitespace-pre-wrap text-foreground">{contribution.description}</p>
        <ContributionValues
          base={contribution.base_value}
          proposed={contribution.proposed_value}
          removal={contribution.operation === 'delete'}
        />
        {contribution.files.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-xs" aria-label="Pièces jointes">
            {contribution.files.map((file, index) => (
              <li key={index}>
                <Badge tone={file.scan_status === 'rejected' ? 'critical' : 'neutral'} className="gap-1">
                  <Paperclip aria-hidden="true" className="size-3" />
                  {file.filename} · {SCAN_STATUS_LABELS[file.scan_status]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        {contribution.messages.length > 0 ? (
          <ol className="space-y-2 text-sm" aria-label="Échanges avec le SIS">
            {contribution.messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  'max-w-[85%] rounded-md px-3 py-2',
                  message.side === 'sis' ? 'bg-info-soft/60' : 'ml-auto bg-subtle',
                )}
              >
                <p className="text-xs text-muted">
                  {message.side === 'sis' ? (message.author_name ?? 'Le SIS') : 'Vous'} ·{' '}
                  {agoLabel(message.created_at, now)}
                  {message.kind === 'info_request' ? ' · demande de précision' : ''}
                </p>
                <p className="whitespace-pre-wrap text-foreground">{message.body}</p>
              </li>
            ))}
          </ol>
        ) : null}
        <Outcome contribution={contribution} />
        {contribution.status === 'info_requested' ? (
          <Alert tone="important">Le SIS vous demande une précision : répondez ci-dessous.</Alert>
        ) : null}
        {reply.error ? <ApiErrorAlert error={reply.error} /> : null}
        {withdraw.error ? <ApiErrorAlert error={withdraw.error} /> : null}
        {open && replying ? (
          <form
            noValidate
            className="space-y-2 rounded-md bg-subtle/60 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (answer.trim()) {
                reply.mutate(answer.trim(), {
                  onSuccess: () => {
                    setAnswer('');
                    setReplying(false);
                  },
                });
              }
            }}
          >
            <Field label="Message au SIS" htmlFor={`answer-${contribution.id}`}>
              <Textarea
                id={`answer-${contribution.id}`}
                rows={3}
                maxLength={4000}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={reply.isPending || !answer.trim()}>
                {reply.isPending ? 'Envoi…' : 'Envoyer'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setReplying(false)}>
                Annuler
              </Button>
            </div>
          </form>
        ) : null}
        {open && withdrawing ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-subtle/60 p-3 text-sm">
            <p>Retirer cette proposition ? Le SIS ne l’instruira plus.</p>
            <Button size="sm" variant="danger" disabled={withdraw.isPending} onClick={() => withdraw.mutate(undefined)}>
              {withdraw.isPending ? 'Retrait…' : 'Retirer'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setWithdrawing(false)}>
              Annuler
            </Button>
          </div>
        ) : null}
        {open && !replying && !withdrawing ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setReplying(true)}>
              Écrire au SIS
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWithdrawing(true)}>
              Retirer la proposition
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** Proposals of the exploitant on this site, with the exchange and the outcome (POR-03). */
export function MyContributions({ siteId, now }: { siteId: string; now: number }) {
  const contributions = usePortalContributions(siteId);
  if (contributions.isPending) return <LoadingCard lines={2} />;
  if (contributions.error) return <ApiErrorAlert error={contributions.error} />;
  if (contributions.data.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <MessageSquareDashed aria-hidden="true" className="size-4 shrink-0" />
        Vous n’avez encore rien proposé pour ce site.
      </p>
    );
  }
  return (
    <ul className="space-y-3" aria-label="Vos propositions">
      {contributions.data.map((contribution) => (
        <ContributionRow key={contribution.id} contribution={contribution} now={now} />
      ))}
    </ul>
  );
}
