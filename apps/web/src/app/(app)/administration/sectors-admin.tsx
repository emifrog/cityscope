'use client';

import type { Sector, SectorCommune, SectorSave } from '@etare/contracts';
import { Alert, Badge, Button, Card, Field, Input } from '@etare/ui';
import { MapPinned, Plus } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { SectionCard } from '@/components/section-card';
import { SitePicker } from '@/components/site-picker';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useSectorCommunes, useSectors } from '@/lib/queries';

const INSEE = /^[0-9][0-9AB][0-9]{3}$/;
const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** Communes of the sites of the SIS, ticked; a commune without site yet is added by its INSEE code. */
function CommunePicker({
  selected,
  onChange,
}: {
  selected: readonly SectorCommune[];
  onChange: (next: SectorCommune[]) => void;
}) {
  const communes = useSectorCommunes();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const chosen = new Set(selected.map((commune) => commune.insee_code));
  const shown = (communes.data?.items ?? []).filter(
    (commune) => q.length === 0 || commune.label.toLowerCase().includes(q) || commune.insee_code.startsWith(q),
  );
  const toggle = (commune: SectorCommune) =>
    onChange(
      chosen.has(commune.insee_code)
        ? selected.filter((item) => item.insee_code !== commune.insee_code)
        : [...selected, { insee_code: commune.insee_code, label: commune.label }],
    );
  const typedCode = query.trim().toUpperCase();
  const canAddCode =
    INSEE.test(typedCode) && !chosen.has(typedCode) && !shown.some((item) => item.insee_code === typedCode);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">Communes</legend>
      <p className="text-xs text-muted">
        Tous les sites de ces communes (code INSEE de leur adresse) font partie du secteur, y compris ceux créés plus
        tard.
      </p>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Communes choisies">
          {selected.map((commune) => (
            <li key={commune.insee_code}>
              <Button type="button" size="sm" variant="secondary" onClick={() => toggle(commune)}>
                {commune.label} ({commune.insee_code}) <span aria-hidden="true">×</span>
                <span className="sr-only">(retirer)</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        aria-label="Rechercher une commune"
        placeholder="Rechercher une commune ou saisir un code INSEE"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {communes.error ? <ApiErrorAlert error={communes.error} /> : null}
      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        {shown.map((commune) => (
          <li key={commune.insee_code}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-brand-accent"
                checked={chosen.has(commune.insee_code)}
                onChange={() => toggle(commune)}
              />
              <span>
                {commune.label} <span className="text-muted">({commune.insee_code})</span>
                <span className="text-muted"> · {plural(commune.site_count, 'site', 'sites')}</span>
              </span>
            </label>
          </li>
        ))}
        {communes.isSuccess && shown.length === 0 ? (
          <li className="text-sm text-muted">Aucune commune parmi les sites du SIS.</li>
        ) : null}
      </ul>
      {canAddCode ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            onChange([...selected, { insee_code: typedCode, label: typedCode }]);
            setQuery('');
          }}
        >
          Ajouter la commune {typedCode} (aucun site pour l’instant)
        </Button>
      ) : null}
    </fieldset>
  );
}

function SectorForm({ sector, onDone }: { sector: Sector | null; onDone: () => void }) {
  const [name, setName] = useState(sector?.name ?? '');
  const [code, setCode] = useState(sector?.code ?? '');
  const [description, setDescription] = useState(sector?.description ?? '');
  const [communes, setCommunes] = useState<SectorCommune[]>(sector?.communes ?? []);
  const [sites, setSites] = useState<ReadonlyMap<string, string>>(
    new Map((sector?.sites ?? []).map((site) => [site.id, site.name])),
  );
  const save = useApiMutation(
    (options, input: SectorSave) =>
      sector ? api.updateSector(options, sector.id, sector.row_version, input) : api.createSector(options, input),
    (tenantId) => [queryKeys.sectors(tenantId), queryKeys.devices(tenantId), queryKeys.members(tenantId)],
  );
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(
          {
            name: name.trim(),
            code: code.trim() || null,
            description: description.trim() || null,
            communes,
            site_ids: [...sites.keys()],
          },
          { onSuccess: onDone },
        );
      }}
    >
      {save.error ? <ApiErrorAlert error={save.error} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Nom" htmlFor="sector-name" hint="Ex. CIS Nice Centre, Groupement Est">
          <Input id="sector-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Code (facultatif)" htmlFor="sector-code">
          <Input id="sector-code" value={code} maxLength={30} onChange={(event) => setCode(event.target.value)} />
        </Field>
        <Field label="Description (facultative)" htmlFor="sector-description">
          <Input
            id="sector-description"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
      <CommunePicker selected={communes} onChange={setCommunes} />
      <SitePicker legend="Sites ajoutés un à un (hors de ces communes)" selected={sites} onChange={setSites} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || name.trim().length === 0}>
          {save.isPending ? 'Enregistrement…' : sector ? 'Enregistrer le secteur' : 'Créer le secteur'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function SectorRow({ sector }: { sector: Sector }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const archive = useApiMutation(
    (options) => api.archiveSector(options, sector.id, sector.row_version),
    (tenantId) => [queryKeys.sectors(tenantId)],
  );
  const used = sector.member_count + sector.device_count > 0;
  return (
    <li className="px-5 py-4">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-subtle text-brand-navy"
        >
          <MapPinned className="size-5" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{sector.name}</span>
            {sector.code ? <Badge>{sector.code}</Badge> : null}
            <Badge tone="info">{plural(sector.site_count, 'site', 'sites')}</Badge>
          </p>
          {sector.description ? <p className="text-sm text-muted">{sector.description}</p> : null}
          <p className="flex flex-wrap gap-1">
            {sector.communes.length > 0 ? (
              sector.communes.map((commune) => <Badge key={commune.insee_code}>{commune.label}</Badge>)
            ) : (
              <span className="text-xs text-muted">Aucune commune</span>
            )}
            {sector.sites.length > 0 ? (
              <Badge tone="neutral">+ {plural(sector.sites.length, 'site ajouté', 'sites ajoutés')}</Badge>
            ) : null}
          </p>
          <p className="text-xs text-muted">
            {plural(sector.member_count, 'membre', 'membres')} et {plural(sector.device_count, 'terminal', 'terminaux')}{' '}
            affectés
          </p>
        </div>
        <div className="flex flex-wrap gap-1 md:justify-end">
          <Button size="sm" variant="secondary" onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
            Modifier
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={used}
            title={used ? 'Affectez d’abord ailleurs ses membres et terminaux.' : undefined}
            onClick={() => setConfirming(true)}
          >
            Archiver
          </Button>
        </div>
      </div>
      {archive.error ? (
        <div className="mt-3">
          <ApiErrorAlert error={archive.error} />
        </div>
      ) : null}
      {confirming ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-subtle/60 p-4">
          <p className="text-sm">Archiver « {sector.name} » ? Il ne pourra plus être affecté.</p>
          <Button size="sm" variant="danger" disabled={archive.isPending} onClick={() => archive.mutate()}>
            Archiver
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      ) : null}
      {editing ? (
        <div className="mt-3 rounded-md bg-subtle/60 p-4">
          <SectorForm sector={sector} onDone={() => setEditing(false)} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Sectors of the SIS (PER-01, ADR-025): groups of sites by commune and site by
 * site, perimeter of the terminals and of the members limited to part of the SIS.
 */
export function SectorsAdmin() {
  const sectors = useSectors();
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {sectors.isPending ? <LoadingCard lines={4} /> : null}
      {sectors.error ? <ApiErrorAlert error={sectors.error} /> : null}
      {sectors.data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="info" className="px-3 py-1 text-sm">
                {plural(sectors.data.items.length, 'secteur', 'secteurs')}
              </Badge>
              {sectors.data.sites_outside_sectors > 0 ? (
                <Badge tone="important" className="px-3 py-1 text-sm">
                  {plural(sectors.data.sites_outside_sectors, 'site hors secteur', 'sites hors secteur')}
                </Badge>
              ) : null}
            </div>
            {!creating ? (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Créer un secteur
              </Button>
            ) : null}
          </div>
          {sectors.data.sites_outside_sectors > 0 ? (
            <Alert tone="important">
              {plural(sectors.data.sites_outside_sectors, 'site n’est', 'sites ne sont')} dans aucun secteur : les
              tablettes et les membres limités à des secteurs ne les reçoivent pas.
            </Alert>
          ) : null}
          {creating ? (
            <SectionCard
              icon={MapPinned}
              title="Créer un secteur"
              description="Un secteur regroupe les sites de ses communes et des sites ajoutés un à un ; un site peut appartenir à plusieurs secteurs."
            >
              <SectorForm sector={null} onDone={() => setCreating(false)} />
            </SectionCard>
          ) : null}
          {sectors.data.items.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
              >
                <MapPinned className="size-6" />
              </span>
              <p className="font-semibold text-foreground">
                Aucun secteur : chaque tablette et chaque membre ont accès à tout le SIS.
              </p>
              <p className="text-sm text-muted">
                Facultatif. Un secteur sert à limiter des tablettes ou des membres à une partie du SIS.
              </p>
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-border" aria-label="Secteurs du SIS">
                {sectors.data.items.map((sector) => (
                  <SectorRow key={`${sector.id}-${sector.row_version}`} sector={sector} />
                ))}
              </ul>
              <p className="border-t border-border px-5 py-3 text-xs text-muted">
                Une tablette reçoit les sites communs à ses secteurs et au périmètre de l’agent connecté. Un changement
                s’applique à la prochaine synchronisation ; ce qui sort du périmètre est retiré avec un motif.
              </p>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
