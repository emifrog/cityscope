'use client';

import type { EtareDossier, EtareDossierCounts, EtareDossierListQuery } from '@etare/contracts';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Label,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@etare/ui';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { REVISION_STATUS_LABELS } from '@/components/labels';
import { PageHeader } from '@/components/page-header';
import { useEtareDossierPages } from '@/lib/queries';

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

function RevisionCell({ dossier }: { dossier: EtareDossier }) {
  const revision = dossier.latest_revision;
  if (!revision) return <span className="text-sm text-muted">Aucune révision</span>;
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      n° {revision.revision_no}
      <Badge tone={REVISION_TONES[revision.status] ?? 'neutral'}>{REVISION_STATUS_LABELS[revision.status]}</Badge>
      <span className="text-xs text-muted">{date.format(new Date(revision.updated_at))}</span>
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
  const rawState = params.get('etat');
  const state: State = isState(rawState) ? rawState : 'all';
  const text = params.get('q')?.trim();
  const q = text && text.length >= 2 ? text : undefined;
  const pages = useEtareDossierPages({ state, ...(q ? { q } : {}) });
  const items = pages.data?.pages.flatMap((page) => page.items) ?? [];
  const counts = pages.data?.pages[0]?.counts;

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
      <PageHeader
        title="ETARE"
        description="Dossiers des sites : version publiée consultée par les intervenants et révision en préparation."
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div role="group" aria-label="Dossiers affichés" className="flex flex-wrap gap-2">
          {STATES.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={state === option.value ? 'primary' : 'secondary'}
              aria-pressed={state === option.value}
              onClick={() => go({ etat: option.value })}
            >
              {option.label}
              {counts ? ` (${counts[option.count]})` : ''}
            </Button>
          ))}
        </div>
        <form key={q ?? ''} role="search" onSubmit={search} className="flex items-end gap-2">
          <div>
            <Label htmlFor="dossier-q">Recherche</Label>
            <Input id="dossier-q" name="q" defaultValue={q ?? ''} placeholder="Nom, n° ETARE" className="mt-1" />
          </div>
          <Button type="submit" variant="secondary">
            Chercher
          </Button>
        </form>
      </div>
      {pages.isPending ? <LoadingCard lines={5} /> : null}
      {pages.error ? <ApiErrorAlert error={pages.error} /> : null}
      {pages.data && items.length === 0 ? <Alert tone="info">Aucun dossier dans cette vue.</Alert> : null}
      {items.length > 0 ? (
        <Card>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Site</TableHeaderCell>
                <TableHeaderCell>Version publiée</TableHeaderCell>
                <TableHeaderCell>Dernière révision</TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {items.map((dossier) => (
                <TableRow key={dossier.site_id}>
                  <TableCell>
                    <Link
                      href={`/sites/${dossier.site_id}?onglet=etare`}
                      className="font-medium text-info hover:underline"
                    >
                      {dossier.site_name}
                    </Link>
                    <span className="block text-xs text-muted">{dossier.etare_number ?? 'sans n° ETARE'}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {dossier.active_publication ? (
                      <>
                        n° {dossier.active_publication.publication_number}
                        <span className="block text-xs text-muted">
                          {date.format(new Date(dossier.active_publication.published_at))}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">Aucune</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RevisionCell dossier={dossier} />
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
          {pages.hasNextPage ? (
            <div className="border-t border-border p-4 text-center">
              <Button
                variant="secondary"
                onClick={() => void pages.fetchNextPage()}
                disabled={pages.isFetchingNextPage}
              >
                {pages.isFetchingNextPage ? 'Chargement…' : 'Afficher plus de dossiers'}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
