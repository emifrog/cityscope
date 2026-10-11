'use client';

import type { EtareDossier, EtareDossierCounts, EtareDossierListQuery } from '@etare/contracts';
import { Badge, Button, Card, Input, Table, TableCell, TableHead, TableHeaderCell, TableRow, cn } from '@etare/ui';
import { ClipboardCheck, FileCheck2, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { dossierStage } from '@/components/etare/dossier-stage';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { REVISION_STATUS_LABELS } from '@/components/labels';
import { SegmentedControl } from '@/components/segmented-control';
import { useEtareDossierPages, usePermissions } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';

const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

const REVISION_TONES: Readonly<Record<string, 'neutral' | 'info' | 'success' | 'important'>> = {
  draft: 'neutral',
  submitted: 'info',
  approved: 'success',
  changes_requested: 'important',
  superseded: 'neutral',
};

type State = EtareDossierListQuery['state'];
const STATES: readonly { value: State; label: string; count: keyof EtareDossierCounts }[] = [
  { value: 'all', label: 'Tous', count: 'sites' },
  { value: 'to_validate', label: 'À valider', count: 'to_validate' },
  { value: 'in_progress', label: 'En préparation', count: 'in_progress' },
  { value: 'published', label: 'Publiés', count: 'published' },
  { value: 'unpublished', label: 'Sans version publiée', count: 'unpublished' },
];
const isState = (value: string | null): value is State => STATES.some((state) => state.value === value);

function StageCell({ dossier }: { dossier: EtareDossier }) {
  const stage = dossierStage(dossier);
  return (
    <span className="flex items-center gap-2 text-sm whitespace-nowrap text-foreground">
      <span aria-hidden="true" className={cn('inline-block size-2.5 shrink-0 rounded-full', stage.dot)} />
      {stage.label}
    </span>
  );
}

function PublicationCell({ dossier, now }: { dossier: EtareDossier; now: number }) {
  const publication = dossier.active_publication;
  if (!publication) return <span className="text-sm text-muted">Aucune</span>;
  return (
    <span className="text-sm">
      <span className="font-medium text-foreground">n° {publication.publication_number}</span>
      <span className="block text-xs text-muted">
        {agoLabel(publication.published_at, now)} · {date.format(new Date(publication.published_at))}
      </span>
    </span>
  );
}

function RevisionCell({ dossier, now }: { dossier: EtareDossier; now: number }) {
  const revision = dossier.latest_revision;
  if (!revision) return <span className="text-sm text-muted">Aucune révision</span>;
  return (
    <span className="text-sm">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">n° {revision.revision_no}</span>
        <Badge tone={REVISION_TONES[revision.status] ?? 'neutral'}>{REVISION_STATUS_LABELS[revision.status]}</Badge>
      </span>
      <span className="block text-xs text-muted">
        {agoLabel(revision.updated_at, now)} · {date.format(new Date(revision.updated_at))}
      </span>
    </span>
  );
}

/**
 * ETARE dossiers of the SIS (MET-01): every site, by name, filtered by state
 * and text, with exact counts over the whole SIS. Filters live in the URL.
 */
export function EtareDossiers() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const permissions = usePermissions();
  const rawState = params.get('etat');
  const state: State = isState(rawState) ? rawState : 'all';
  const text = params.get('q')?.trim();
  const q = text && text.length >= 2 ? text : undefined;
  const pages = useEtareDossierPages({ state, ...(q ? { q } : {}) });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = pages.data?.pages[0]?.counts;
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const filtered = state !== 'all' || Boolean(q);
  const canApprove = permissions.has('etare:approve');

  const go = (next: { etat?: State; q?: string }) => {
    const search = new URLSearchParams();
    const nextState = next.etat ?? state;
    const nextText = next.q ?? q ?? '';
    if (nextState !== 'all') search.set('etat', nextState);
    if (nextText) search.set('q', nextText);
    router.replace(search.size ? `${pathname}?${search}` : pathname);
  };

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go({ q: String(new FormData(event.currentTarget).get('q') ?? '').trim() });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dossiers ETARE</h1>
          <p className="mt-1 text-sm text-muted">
            Un dossier par site : la version publiée que consultent les intervenants, et la révision en préparation.
          </p>
        </div>
        {counts && counts.to_validate > 0 ? (
          <Button asChild variant={canApprove ? 'primary' : 'secondary'} size="sm">
            <Link href="/validations">
              <ClipboardCheck aria-hidden="true" className="size-4" />
              {counts.to_validate} révision{counts.to_validate > 1 ? 's' : ''} à valider
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Dossiers affichés"
          value={state}
          onChange={(etat) => go({ etat })}
          options={STATES.map((option) => ({
            value: option.value,
            label: option.label,
            count: counts ? counts[option.count] : undefined,
          }))}
        />
        <form key={q ?? ''} role="search" onSubmit={search} className="flex flex-1 items-center gap-2 sm:max-w-md">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">Recherche</span>
            <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              id="dossier-q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="Nom du site, n° ETARE…"
              className="pl-9"
            />
          </label>
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>
      </div>

      {pages.isPending ? <LoadingCard lines={5} /> : null}
      {pages.error ? <ApiErrorAlert error={pages.error} /> : null}
      {pages.data && items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
          >
            <FileCheck2 className="size-6" />
          </span>
          <p className="font-semibold text-foreground">
            {filtered ? 'Aucun dossier dans cette vue.' : 'Aucun site, donc aucun dossier pour le moment.'}
          </p>
          {filtered ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={pathname}>Tous les dossiers</Link>
            </Button>
          ) : null}
        </Card>
      ) : null}
      {items.length > 0 ? (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Site</TableHeaderCell>
                <TableHeaderCell>État du dossier</TableHeaderCell>
                <TableHeaderCell>Version publiée</TableHeaderCell>
                <TableHeaderCell>Dernière révision</TableHeaderCell>
                <TableHeaderCell className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {items.map((dossier) => {
                const stage = dossierStage(dossier);
                return (
                  <TableRow key={dossier.site_id} className="hover:bg-subtle/60">
                    <TableCell className="min-w-48">
                      <Link
                        href={`/sites/${dossier.site_id}?onglet=etare`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {dossier.site_name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {dossier.etare_number ? `N° ETARE ${dossier.etare_number}` : 'Sans n° ETARE'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StageCell dossier={dossier} />
                    </TableCell>
                    <TableCell>
                      <PublicationCell dossier={dossier} now={now} />
                    </TableCell>
                    <TableCell>
                      <RevisionCell dossier={dossier} now={now} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {stage.stage === 'to_validate' && dossier.latest_revision ? (
                        <Button asChild size="sm" variant={canApprove ? 'primary' : 'secondary'}>
                          <Link href={`/validations/${dossier.latest_revision.id}`}>
                            {canApprove ? 'Valider' : 'Voir la révision'}
                          </Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/sites/${dossier.site_id}?onglet=etare`}>Dossier</Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted" aria-live="polite">
              {items.length} dossier{items.length > 1 ? 's' : ''} affiché{items.length > 1 ? 's' : ''}
              {pages.hasNextPage ? ', d’autres suivent' : ''}
            </p>
            {pages.hasNextPage ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void pages.fetchNextPage()}
                disabled={pages.isFetchingNextPage}
              >
                {pages.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de dossiers'}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}
    </>
  );
}
