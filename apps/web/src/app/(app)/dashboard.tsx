'use client';

import type { Contribution, EtareDossierCounts, FieldReport, SiteSummary, ValidationQueueItem } from '@etare/contracts';
import { Badge, Button, Card, CardContent, cn } from '@etare/ui';
import {
  ArrowRight,
  Building2,
  CircleCheckBig,
  ClipboardCheck,
  FileCheck2,
  FilePlus2,
  Inbox,
  Layers,
  ListTodo,
  Map,
  MessageSquareWarning,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import {
  CONTRIBUTION_OPERATION_LABELS,
  CONTRIBUTION_TARGET_LABELS,
  REPORT_CATEGORY_LABELS,
  REPORT_SEVERITY_LABELS,
  SITE_STATUS_LABELS,
  SITE_TYPE_LABELS,
} from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { displayNameOf } from '@/lib/identity';
import {
  useContributions,
  useEtareCounts,
  useFieldReports,
  usePermissions,
  useSites,
  useValidations,
} from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { useTenant } from '@/providers/tenant-provider';

const TODO_ITEMS = 3;
const RECENT_SITES = 5;

const today = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Paris' });

type Tone = 'neutral' | 'pending' | 'clear';

/** One figure of the SIS: what it is, how many, where to act. Pending work stands out. */
function Tile({
  icon: Icon,
  label,
  value,
  note,
  href,
  tone = 'neutral',
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  href: string;
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-card border border-border bg-surface shadow-sm transition-colors hover:border-brand-navy/30"
    >
      <CardContent className="flex h-full flex-col gap-3 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-md',
              tone === 'pending' && 'bg-important-soft text-important',
              tone === 'clear' && 'bg-success-soft text-success',
              tone === 'neutral' && 'bg-subtle text-brand-navy',
            )}
          >
            <Icon className="size-5" />
          </span>
          <ArrowRight
            aria-hidden="true"
            className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
        <div>
          <p className={cn('text-3xl font-bold', tone === 'pending' ? 'text-important' : 'text-foreground')}>{value}</p>
          <p className="mt-0.5 text-sm font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted">{note}</p>
        </div>
        {children}
      </CardContent>
    </Link>
  );
}

/** Share of the sites with a published dossier. */
function CoverageBar({ counts }: { counts: EtareDossierCounts }) {
  const ratio = counts.sites === 0 ? 0 : Math.round((counts.published / counts.sites) * 100);
  return (
    <div
      role="progressbar"
      aria-label="Couverture ETARE"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ratio}
      className="h-1.5 w-full overflow-hidden rounded-full bg-subtle"
    >
      <div className="h-full rounded-full bg-success" style={{ width: `${ratio}%` }} />
    </div>
  );
}

function TodoGroup({
  title,
  total,
  href,
  children,
}: {
  title: string;
  total: number;
  href: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          {title} <span className="font-normal text-muted">({total})</span>
        </h3>
        {total > TODO_ITEMS ? (
          <Link href={href} className="text-xs font-medium text-info hover:underline">
            Tout voir
          </Link>
        ) : null}
      </div>
      <ul className="divide-y divide-border rounded-md border border-border">{children}</ul>
    </section>
  );
}

function TodoRow({
  href,
  title,
  detail,
  badge,
  when,
}: {
  href: string;
  title: string;
  detail: string;
  badge?: ReactNode;
  when: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-subtle">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
            <span className="truncate">{title}</span>
            {badge}
          </p>
          <p className="truncate text-xs text-muted">{detail}</p>
        </div>
        <span className="shrink-0 text-xs whitespace-nowrap text-muted">{when}</span>
      </Link>
    </li>
  );
}

function validationRows(items: readonly ValidationQueueItem[], now: number) {
  return items
    .slice(0, TODO_ITEMS)
    .map((item) => (
      <TodoRow
        key={item.revision_id}
        href={`/validations/${item.revision_id}`}
        title={item.site_name}
        detail={`Révision n° ${item.revision_no} soumise par ${item.submitted_by.name}${item.change_summary ? ` · ${item.change_summary}` : ''}`}
        when={agoLabel(item.submitted_at, now)}
      />
    ));
}

function reportRows(items: readonly FieldReport[], now: number) {
  return items
    .slice(0, TODO_ITEMS)
    .map((report) => (
      <TodoRow
        key={report.id}
        href={`/signalements/${report.id}`}
        title={report.site_name}
        detail={`${REPORT_CATEGORY_LABELS[report.category]} · ${report.description}`}
        badge={
          report.severity === 'urgent' ? (
            <Badge tone="critical">{REPORT_SEVERITY_LABELS.urgent}</Badge>
          ) : report.severity === 'important' ? (
            <Badge tone="important">{REPORT_SEVERITY_LABELS.important}</Badge>
          ) : null
        }
        when={agoLabel(report.received_at, now)}
      />
    ));
}

function contributionRows(items: readonly Contribution[], now: number) {
  return items
    .slice(0, TODO_ITEMS)
    .map((contribution) => (
      <TodoRow
        key={contribution.id}
        href={`/contributions/${contribution.id}`}
        title={contribution.site_name}
        detail={`${CONTRIBUTION_OPERATION_LABELS[contribution.operation]} · ${CONTRIBUTION_TARGET_LABELS[contribution.target_type]} · ${contribution.title}`}
        badge={contribution.conflict ? <Badge tone="important">Conflit</Badge> : null}
        when={agoLabel(contribution.created_at, now)}
      />
    ));
}

/** Breakdown of the dossiers of the SIS, each line proportional to the sites. */
function DossierBreakdown({ counts }: { counts: EtareDossierCounts }) {
  const rows: readonly { label: string; value: number; href: string; color: string }[] = [
    { label: 'Publiés', value: counts.published, href: '/etare?etat=published', color: 'bg-success' },
    { label: 'À valider', value: counts.to_validate, href: '/etare?etat=to_validate', color: 'bg-important' },
    { label: 'En cours de rédaction', value: counts.in_progress, href: '/etare?etat=in_progress', color: 'bg-info' },
    { label: 'Sans version publiée', value: counts.unpublished, href: '/etare?etat=unpublished', color: 'bg-muted' },
  ];
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <Link href={row.href} className="group block">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground group-hover:underline">{row.label}</span>
              <span className="font-semibold text-foreground tabular-nums">{row.value}</span>
            </div>
            <div aria-hidden="true" className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div
                className={cn('h-full rounded-full', row.color)}
                style={{ width: `${counts.sites === 0 ? 0 : Math.round((row.value / counts.sites) * 100)}%` }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentSites({ sites, now }: { sites: readonly SiteSummary[]; now: number }) {
  if (sites.length === 0) return <p className="text-sm text-muted">Aucun site visible dans ce SIS.</p>;
  const recent = [...sites].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, RECENT_SITES);
  return (
    <ul className="divide-y divide-border">
      {recent.map((site) => (
        <li key={site.id}>
          <Link href={`/sites/${site.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-subtle">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{site.name}</p>
              <p className="truncate text-xs text-muted">
                {SITE_TYPE_LABELS[site.site_type]}
                {site.address?.city ? ` · ${site.address.city}` : ''}
                {site.etare_number ? ` · n° ${site.etare_number}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={site.status === 'active' ? 'success' : 'neutral'}>{SITE_STATUS_LABELS[site.status]}</Badge>
              <span className="hidden text-xs whitespace-nowrap text-muted sm:inline">
                {agoLabel(site.updated_at, now)}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Shortcut({ href, icon: Icon, label, hint }: { href: string; icon: LucideIcon; label: string; hint: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-subtle">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-md bg-subtle text-brand-navy"
        >
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block truncate text-xs text-muted">{hint}</span>
        </span>
      </Link>
    </li>
  );
}

export function Dashboard() {
  const { me, activeTenant, loading, error } = useTenant();
  const permissions = usePermissions();
  const readsEtare = permissions.has('etare:read');
  const reviewsReports = permissions.has('field_report:review');
  const reviewsContributions = permissions.has('contribution:review');
  const sites = useSites({}, 10);
  const counts = useEtareCounts(readsEtare);
  const queue = useValidations(readsEtare);
  const reports = useFieldReports({ view: 'open', limit: TODO_ITEMS }, reviewsReports);
  const contributions = useContributions({ view: 'open', limit: TODO_ITEMS }, reviewsContributions);
  // One instant for the whole render: the relative dates stay coherent between the lists.
  const [now] = useState(() => Date.now());

  if (loading) return <LoadingCard lines={4} />;
  if (error) return <ApiErrorAlert error={error} />;
  if (!activeTenant) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted">
            Votre compte n’est rattaché à aucun SIS. Contactez l’administrateur de votre service.
          </p>
        </CardContent>
      </Card>
    );
  }

  const name = me ? displayNameOf(me.user.display_name, me.user.email) : '';
  const date = today.format(new Date(now));
  const firstPage = sites.data?.pages[0];
  const siteCount =
    readsEtare && counts.data
      ? String(counts.data.sites)
      : firstPage
        ? `${firstPage.items.length}${firstPage.next_cursor ? '+' : ''}`
        : '—';
  const toValidate = readsEtare ? queue.data?.length : undefined;
  const openReports = reviewsReports ? reports.data?.open_count : undefined;
  const openContributions = reviewsContributions ? contributions.data?.open_count : undefined;
  const pendingTone = (value: number | undefined): Tone =>
    value === undefined ? 'neutral' : value > 0 ? 'pending' : 'clear';
  const hasTodo = (toValidate ?? 0) + (openReports ?? 0) + (openContributions ?? 0) > 0;
  const todoKnown = toValidate !== undefined || openReports !== undefined || openContributions !== undefined;
  const todoLoading =
    (readsEtare && queue.isPending) ||
    (reviewsReports && reports.isPending) ||
    (reviewsContributions && contributions.isPending);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {date.charAt(0).toUpperCase() + date.slice(1)} · {activeTenant.tenant_name}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Bonjour, {name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/carte">
              <Map aria-hidden="true" className="size-4" />
              Carte
            </Link>
          </Button>
          {permissions.has('site:write') ? (
            <Button asChild size="sm">
              <Link href="/sites/nouveau">
                <FilePlus2 aria-hidden="true" className="size-4" />
                Nouveau site
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] sm:gap-4">
        <Tile icon={Building2} label="Sites suivis" value={siteCount} note="Hors archives" href="/sites" />
        {readsEtare ? (
          <Tile
            icon={FileCheck2}
            label="ETARE publiés"
            value={counts.data ? String(counts.data.published) : '—'}
            note={counts.data ? `sur ${counts.data.sites} site${counts.data.sites > 1 ? 's' : ''}` : 'Dossiers ETARE'}
            href="/etare?etat=published"
          >
            {counts.data ? <CoverageBar counts={counts.data} /> : null}
          </Tile>
        ) : null}
        {readsEtare ? (
          <Tile
            icon={ClipboardCheck}
            label="À valider"
            value={toValidate === undefined ? '—' : String(toValidate)}
            note={toValidate === 0 ? 'Rien en attente' : 'Révisions soumises'}
            href="/validations"
            tone={pendingTone(toValidate)}
          />
        ) : null}
        {reviewsReports ? (
          <Tile
            icon={MessageSquareWarning}
            label="Signalements à traiter"
            value={openReports === undefined ? '—' : String(openReports)}
            note={openReports === 0 ? 'Rien en attente' : 'Remontés par les intervenants'}
            href="/signalements"
            tone={pendingTone(openReports)}
          />
        ) : null}
        {reviewsContributions ? (
          <Tile
            icon={Inbox}
            label="Contributions à traiter"
            value={openContributions === undefined ? '—' : String(openContributions)}
            note={openContributions === 0 ? 'Rien en attente' : 'Proposées par les exploitants'}
            href="/contributions"
            tone={pendingTone(openContributions)}
          />
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="space-y-4">
          {todoKnown || todoLoading ? (
            <SectionCard
              icon={ListTodo}
              title="À faire"
              description="Ce qui attend une décision dans votre SIS, du plus ancien au plus récent."
              contentClassName="space-y-5 px-5 py-4"
            >
              {todoLoading && !todoKnown ? <LoadingCard lines={3} /> : null}
              {queue.error ? <ApiErrorAlert error={queue.error} /> : null}
              {reports.error ? <ApiErrorAlert error={reports.error} /> : null}
              {contributions.error ? <ApiErrorAlert error={contributions.error} /> : null}
              {todoKnown && !hasTodo ? (
                <div className="flex items-center gap-3 rounded-md bg-success-soft px-4 py-3 text-sm text-success">
                  <CircleCheckBig aria-hidden="true" className="size-5 shrink-0" />
                  Rien à traiter pour le moment : la base opérationnelle est à jour.
                </div>
              ) : null}
              {toValidate ? (
                <TodoGroup title="Révisions à valider" total={toValidate} href="/validations">
                  {validationRows(queue.data ?? [], now)}
                </TodoGroup>
              ) : null}
              {openReports ? (
                <TodoGroup title="Signalements du terrain" total={openReports} href="/signalements">
                  {reportRows(reports.data?.items ?? [], now)}
                </TodoGroup>
              ) : null}
              {openContributions ? (
                <TodoGroup title="Contributions des exploitants" total={openContributions} href="/contributions">
                  {contributionRows(contributions.data?.items ?? [], now)}
                </TodoGroup>
              ) : null}
            </SectionCard>
          ) : null}

          <SectionCard
            icon={Building2}
            title="Sites modifiés récemment"
            description="Données de travail, limitées à votre SIS et à vos droits."
            aside={
              <Button asChild variant="secondary" size="sm">
                <Link href="/sites">Tous les sites</Link>
              </Button>
            }
            contentClassName="px-5 py-2"
          >
            {sites.isPending ? <LoadingCard /> : null}
            {sites.error ? <ApiErrorAlert error={sites.error} /> : null}
            {firstPage ? <RecentSites sites={firstPage.items} now={now} /> : null}
          </SectionCard>
        </div>

        <div className="space-y-4">
          {readsEtare ? (
            <SectionCard icon={Layers} title="Dossiers ETARE" description="État des dossiers du SIS, par site.">
              {counts.isPending ? <LoadingCard lines={3} /> : null}
              {counts.error ? <ApiErrorAlert error={counts.error} /> : null}
              {counts.data ? <DossierBreakdown counts={counts.data} /> : null}
            </SectionCard>
          ) : null}

          <SectionCard icon={Map} title="Accès rapides" contentClassName="px-3 py-2">
            <ul className="space-y-0.5">
              <Shortcut href="/carte" icon={Map} label="Carte" hint="Les sites du SIS sur le fond de plan" />
              {readsEtare ? (
                <Shortcut href="/etare" icon={FileCheck2} label="Dossiers ETARE" hint="Toutes les versions publiées" />
              ) : null}
              {permissions.has('portal:invite') ? (
                <Shortcut href="/exploitants" icon={Users} label="Exploitants" hint="Portail et invitations" />
              ) : null}
              {permissions.has('member:manage') ? (
                <Shortcut
                  href="/administration"
                  icon={ClipboardCheck}
                  label="Administration"
                  hint="Membres, terminaux, catalogues"
                />
              ) : null}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
