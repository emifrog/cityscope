'use client';

import type { TenantSupervision } from '@etare/contracts';
import { Alert, Card, CardContent } from '@etare/ui';
import {
  Bell,
  CircleCheckBig,
  FileCheck2,
  Files,
  MessageSquareWarning,
  RefreshCw,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { useSupervision } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { formatSize } from './basemaps-admin';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });

/** A duration in seconds, the way an administrator reads it. */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  if (seconds < 1) return 'moins d’1 s';
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5_400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3_600).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
}

interface Notice {
  readonly tone: 'critical' | 'important' | 'info';
  readonly text: string;
  readonly link?: { readonly href: string; readonly label: string };
}

/** What the administration of the SIS must act upon, most serious first. */
export function noticesOf(board: TenantSupervision): Notice[] {
  const notices: Notice[] = [];
  const { publications, devices, receipts_7d: receipts } = board;
  if (publications.stuck > 0) {
    notices.push({
      tone: 'critical',
      text: `${publications.stuck} version(s) attendent leur fabrication depuis plus de 15 minutes : l’exploitation de la plateforme est alertée, rien n’est perdu.`,
    });
  }
  if (publications.failed_7d > 0) {
    notices.push({
      tone: 'important',
      text: `${publications.failed_7d} publication(s) en échec cette semaine : relancez-les depuis la fiche ETARE du site (la version validée est conservée).`,
    });
  }
  const behind = devices.late + devices.error + devices.never_synced;
  if (behind > 0) {
    notices.push({
      tone: 'important',
      text: `${behind} terminal(aux) en retard, en erreur ou jamais synchronisé(s) : leurs agents risquent de consulter des ETARE dépassés.`,
      link: { href: '/administration?onglet=terminaux', label: 'Voir les terminaux' },
    });
  }
  if (receipts.error > 0) {
    notices.push({
      tone: 'important',
      text: `${receipts.error} synchronisation(s) en erreur cette semaine.`,
      link: { href: '/administration?onglet=terminaux', label: 'Voir les terminaux' },
    });
  }
  if (board.notifications.failed > 0) {
    notices.push({
      tone: 'important',
      text: `${board.notifications.failed} notification(s) aux exploitants en échec.`,
      link: { href: '/administration?onglet=notifications', label: 'Renvoyer' },
    });
  }
  if (board.basemaps.failed > 0 || board.basemaps.renewal_due > 0) {
    notices.push({
      tone: 'info',
      text: `Fonds de carte : ${board.basemaps.failed} préparation(s) en échec, ${board.basemaps.renewal_due} renouvellement(s) dû(s).`,
      link: { href: '/administration?onglet=fonds', label: 'Voir les fonds' },
    });
  }
  if (devices.holding_withdrawn > 0) {
    notices.push({
      tone: 'info',
      text: `${devices.holding_withdrawn} terminal(aux) détiennent encore une version retirée : elle sera effacée à leur prochain contact.`,
    });
  }
  if (board.field_reports.new > 0) {
    notices.push({
      tone: 'info',
      text: `${board.field_reports.new} signalement(s) terrain à traiter${
        board.field_reports.oldest_new_at
          ? `, le plus ancien reçu le ${dateTime.format(new Date(board.field_reports.oldest_new_at))}`
          : ''
      }.`,
      link: { href: '/signalements', label: 'Traiter les signalements' },
    });
  }
  if (board.files.rejected_7d > 0) {
    notices.push({
      tone: 'info',
      text: `${board.files.rejected_7d} fichier(s) refusé(s) au contrôle cette semaine (antivirus, type ou empreinte) : ils n’ont jamais été servis.`,
    });
  }
  return notices;
}

function Tile({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
          <Icon aria-hidden="true" className="size-4 text-brand-navy" />
          {title}
        </h3>
        <dl className="mt-2 space-y-1 text-sm">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, attention = false }: { label: string; value: ReactNode; attention?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={attention ? 'font-semibold text-important tabular-nums' : 'font-semibold tabular-nums'}>
        {value}
      </dd>
    </div>
  );
}

function Board({ board }: { board: TenantSupervision }) {
  const { publications, devices, receipts_7d: receipts } = board;
  const total = receipts.installed + receipts.partial + receipts.error;
  const notices = noticesOf(board);
  return (
    <div className="space-y-4">
      {notices.length === 0 ? (
        <div className="flex items-center gap-3 rounded-md bg-success-soft px-4 py-3 text-sm text-success">
          <CircleCheckBig aria-hidden="true" className="size-5 shrink-0" />
          Rien ne demande d’action pour l’instant.
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Points d’attention">
          {notices.map((notice) => (
            <li key={notice.text}>
              <Alert tone={notice.tone}>
                {notice.text}
                {notice.link ? (
                  <>
                    {' '}
                    <Link className="font-semibold underline" href={notice.link.href}>
                      {notice.link.label}
                    </Link>
                  </>
                ) : null}
              </Alert>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Tile icon={FileCheck2} title="Publications">
          <Figure label="Versions en vigueur" value={publications.in_force} />
          <Figure label="Publiées en 7 jours" value={publications.published_7d} />
          <Figure label="Délai de publication (95 %)" value={formatDuration(publications.duration_p95_seconds_7d)} />
          <Figure label="En échec en 7 jours" value={publications.failed_7d} attention={publications.failed_7d > 0} />
        </Tile>
        <Tile icon={Smartphone} title="Terminaux">
          <Figure label="Enrôlés" value={devices.active} />
          <Figure label="À jour" value={devices.up_to_date} />
          <Figure label="En retard (plus de 7 jours)" value={devices.late} attention={devices.late > 0} />
          <Figure label="En erreur" value={devices.error} attention={devices.error > 0} />
          <Figure label="Jamais synchronisés" value={devices.never_synced} attention={devices.never_synced > 0} />
        </Tile>
        <Tile icon={RefreshCw} title="Synchronisations en 7 jours">
          <Figure label="Installées" value={receipts.installed} />
          <Figure label="Partielles" value={receipts.partial} />
          <Figure label="En erreur" value={receipts.error} attention={receipts.error > 0} />
          <Figure
            label="Taux de réussite"
            value={total === 0 ? '—' : `${Math.round((receipts.installed / total) * 100)} %`}
          />
        </Tile>
        <Tile icon={MessageSquareWarning} title="Signalements terrain">
          <Figure label="À traiter" value={board.field_reports.new} attention={board.field_reports.new > 0} />
          <Figure
            label="Le plus ancien"
            value={
              board.field_reports.oldest_new_at ? dateTime.format(new Date(board.field_reports.oldest_new_at)) : '—'
            }
          />
        </Tile>
        <Tile icon={Files} title="Fichiers">
          <Figure label="En cours de contrôle" value={board.files.pending} />
          <Figure label="Refusés en 7 jours" value={board.files.rejected_7d} attention={board.files.rejected_7d > 0} />
          <Figure
            label="Volume vérifié"
            value={board.files.clean_bytes > 0 ? formatSize(board.files.clean_bytes) : '—'}
          />
        </Tile>
        <Tile icon={Bell} title="Notifications et fonds de carte">
          <Figure label="Notifications en attente" value={board.notifications.pending} />
          <Figure
            label="Notifications en échec"
            value={board.notifications.failed}
            attention={board.notifications.failed > 0}
          />
          <Figure label="Fonds en vigueur" value={board.basemaps.ready} />
          <Figure
            label="Renouvellements dus"
            value={board.basemaps.renewal_due}
            attention={board.basemaps.renewal_due > 0}
          />
        </Tile>
      </div>
    </div>
  );
}

/** Supervision of the SIS (EXP-03): what needs action, then the figures of the week. */
export function SupervisionAdmin() {
  const supervision = useSupervision();
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  return (
    <div className="space-y-4">
      {supervision.data ? (
        <p className="text-xs text-muted">
          Chiffres mis à jour {agoLabel(supervision.data.generated_at, now)}, le{' '}
          {dateTime.format(new Date(supervision.data.generated_at))}.
        </p>
      ) : null}
      {supervision.isPending ? <LoadingCard lines={4} /> : null}
      {supervision.error ? <ApiErrorAlert error={supervision.error} /> : null}
      {supervision.data ? <Board board={supervision.data} /> : null}
    </div>
  );
}
