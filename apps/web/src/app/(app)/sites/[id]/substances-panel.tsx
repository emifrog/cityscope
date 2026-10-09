'use client';

import type { Building, Document, Substance, SubstanceCreateInput, SubstanceUpdate, Zone } from '@etare/contracts';
import {
  HAZARD_CLASSES,
  HAZARD_CLASS_LABELS,
  PHYSICAL_STATES,
  PHYSICAL_STATE_LABELS,
  type HazardClass,
} from '@etare/domain';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { applyServerFieldErrors, blankToNull, isOptionalNumber, numberOrNull } from '@/components/form-helpers';
import { api } from '@/lib/api-client';
import { openInNewTab } from '@/lib/open-link';
import {
  queryKeys,
  useApiMutation,
  useBuildings,
  useDocuments,
  usePermissions,
  useSiteSubstances,
  useSiteZones,
} from '@/lib/queries';

const quantityFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

/**
 * Form values of a substance (RISK-03): texts as typed, converted on submit. Empty selects
 * ("") mean "none"; the location is the site, a building, a level or a zone.
 */
export const substanceFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
    hazard_classes: z.array(z.enum(HAZARD_CLASSES)),
    un_number: z
      .string()
      .trim()
      .regex(/^([0-9]{4})?$/, 'Numéro ONU à quatre chiffres.'),
    physical_state: z.enum(['', ...PHYSICAL_STATES]),
    quantity: z
      .string()
      .trim()
      .refine((value) => isOptionalNumber(value, 0, 1e9), 'Quantité positive attendue.'),
    unit: z.string().trim().max(20),
    building_id: z.string(),
    level_id: z.string(),
    zone_id: z.string(),
    location_note: z.string().trim().max(200),
    fds_document_id: z.string(),
    notes: z.string().trim().max(2000),
  })
  .refine((values) => (numberOrNull(values.quantity) === null) === (values.unit.trim() === ''), {
    message: 'Une quantité s’accompagne de son unité.',
    path: ['unit'],
  });
export type SubstanceFormValues = z.infer<typeof substanceFormSchema>;

export const substanceFormDefaults = (substance?: Substance): SubstanceFormValues => ({
  name: substance?.name ?? '',
  hazard_classes: substance?.hazard_classes ?? [],
  un_number: substance?.un_number ?? '',
  physical_state: substance?.physical_state ?? '',
  quantity: substance?.quantity === null || !substance ? '' : String(substance.quantity),
  unit: substance?.unit ?? '',
  building_id: substance?.building_id ?? '',
  level_id: substance?.level_id ?? '',
  zone_id: substance?.zone_id ?? '',
  location_note: substance?.location_note ?? '',
  fds_document_id: substance?.fds_document_id ?? '',
  notes: substance?.notes ?? '',
});

export const toSubstancePayload = (values: SubstanceFormValues): SubstanceCreateInput => ({
  name: values.name.trim(),
  hazard_classes: values.hazard_classes,
  un_number: blankToNull(values.un_number),
  physical_state: values.physical_state === '' ? null : values.physical_state,
  quantity: numberOrNull(values.quantity),
  unit: blankToNull(values.unit),
  building_id: blankToNull(values.building_id),
  level_id: blankToNull(values.level_id),
  zone_id: blankToNull(values.zone_id),
  location_note: blankToNull(values.location_note),
  fds_document_id: blankToNull(values.fds_document_id),
  notes: blankToNull(values.notes),
});

/** The safety data sheets of the site: active documents classed FDS (plus the one already chosen). */
const sheetChoices = (documents: readonly Document[], chosen: string | null) =>
  documents.filter(
    (document) => document.id === chosen || (document.category === 'fds' && document.status === 'active'),
  );

export function SubstanceForm({
  initial,
  buildings,
  zones,
  documents,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Substance | undefined;
  buildings: readonly Building[];
  zones: readonly Zone[];
  documents: readonly Document[];
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (payload: SubstanceCreateInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const prefix = initial?.id ?? 'new-substance';
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<SubstanceFormValues>({
    resolver: zodResolver(substanceFormSchema),
    defaultValues: substanceFormDefaults(initial),
  });
  const classes = useWatch({ control, name: 'hazard_classes' });
  const buildingId = useWatch({ control, name: 'building_id' });
  const levelId = useWatch({ control, name: 'level_id' });
  const activeBuildings = buildings.filter((building) => building.status === 'active' || building.id === buildingId);
  const levels = (buildings.find((building) => building.id === buildingId)?.levels ?? []).filter(
    (level) => level.status === 'active' || level.id === levelId,
  );
  const levelZones = zones.filter(
    (zone) => zone.level_id === levelId && (zone.status === 'active' || zone.id === initial?.zone_id),
  );
  const sheets = sheetChoices(documents, initial?.fds_document_id ?? null);

  const toggleClass = (code: HazardClass, checked: boolean) =>
    setValue(
      'hazard_classes',
      checked
        ? HAZARD_CLASSES.filter((known) => known === code || classes.includes(known))
        : classes.filter((known) => known !== code),
      { shouldDirty: true },
    );

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-3"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(toSubstancePayload(values));
          if (!initial) reset(substanceFormDefaults());
        } catch (failure) {
          applyServerFieldErrors(failure, setError);
        }
      })}
    >
      {error ? (
        <div className="md:col-span-3">
          <ApiErrorAlert error={error} />
        </div>
      ) : null}
      <Field label="Nom du produit" htmlFor={`${prefix}-name`} error={errors.name?.message} className="md:col-span-2">
        <Input id={`${prefix}-name`} placeholder="Acide chlorhydrique 33 %…" {...register('name')} />
      </Field>
      <Field
        label="Numéro ONU"
        htmlFor={`${prefix}-un`}
        error={errors.un_number?.message}
        hint="Quatre chiffres, ex. 1789."
      >
        <Input id={`${prefix}-un`} inputMode="numeric" maxLength={4} {...register('un_number')} />
      </Field>
      <fieldset className="md:col-span-3">
        <legend className="text-sm font-medium">Classes de danger (pictogrammes CLP)</legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-3">
          {HAZARD_CLASSES.map((code) => (
            <label key={code} htmlFor={`${prefix}-${code}`} className="flex items-center gap-2 text-sm">
              <input
                id={`${prefix}-${code}`}
                type="checkbox"
                className="size-4 accent-brand-accent"
                checked={classes.includes(code)}
                onChange={(event) => toggleClass(code, event.target.checked)}
              />
              {code} · {HAZARD_CLASS_LABELS[code]}
            </label>
          ))}
        </div>
        {errors.hazard_classes?.message ? (
          <p role="alert" className="mt-1 text-sm text-critical">
            {errors.hazard_classes.message}
          </p>
        ) : null}
      </fieldset>
      <Field label="État physique" htmlFor={`${prefix}-state`} error={errors.physical_state?.message}>
        <Select id={`${prefix}-state`} {...register('physical_state')}>
          <option value="">Non précisé</option>
          {PHYSICAL_STATES.map((state) => (
            <option key={state} value={state}>
              {PHYSICAL_STATE_LABELS[state]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Quantité" htmlFor={`${prefix}-quantity`} error={errors.quantity?.message}>
        <Input id={`${prefix}-quantity`} inputMode="decimal" {...register('quantity')} />
      </Field>
      <Field label="Unité" htmlFor={`${prefix}-unit`} error={errors.unit?.message} hint="Ex. kg, L, m³, bouteilles">
        <Input id={`${prefix}-unit`} maxLength={20} {...register('unit')} />
      </Field>
      <Field label="Bâtiment" htmlFor={`${prefix}-building`} error={errors.building_id?.message}>
        <Select
          id={`${prefix}-building`}
          {...register('building_id', {
            onChange: () => {
              setValue('level_id', '');
              setValue('zone_id', '');
            },
          })}
        >
          <option value="">Tout le site</option>
          {activeBuildings.map((building) => (
            <option key={building.id} value={building.id}>
              {building.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Niveau" htmlFor={`${prefix}-level`} error={errors.level_id?.message}>
        <Select
          id={`${prefix}-level`}
          disabled={!buildingId}
          {...register('level_id', { onChange: () => setValue('zone_id', '') })}
        >
          <option value="">Tout le bâtiment</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Zone" htmlFor={`${prefix}-zone`} error={errors.zone_id?.message}>
        <Select id={`${prefix}-zone`} disabled={!levelId} {...register('zone_id')}>
          <option value="">Tout le niveau</option>
          {levelZones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Précision de localisation"
        htmlFor={`${prefix}-location`}
        error={errors.location_note?.message}
        className="md:col-span-3"
      >
        <Input
          id={`${prefix}-location`}
          placeholder="Armoire ventilée, cuve enterrée…"
          {...register('location_note')}
        />
      </Field>
      <Field
        label="Fiche de données de sécurité"
        htmlFor={`${prefix}-fds`}
        error={errors.fds_document_id?.message}
        hint="Un document du site classé « FDS » (onglet Documents)."
        className="md:col-span-3"
      >
        <Select id={`${prefix}-fds`} {...register('fds_document_id')}>
          <option value="">Aucune</option>
          {sheets.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor={`${prefix}-notes`} error={errors.notes?.message} className="md:col-span-3">
        <Textarea id={`${prefix}-notes`} {...register('notes')} />
      </Field>
      <div className="flex gap-2 md:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Enregistrement…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Names of the building, level and zone of a substance; "Tout le site" when none is set. */
function locationOf(substance: Substance, buildings: readonly Building[], zones: readonly Zone[]): string {
  const building = buildings.find((candidate) => candidate.id === substance.building_id);
  const level = buildings
    .flatMap((candidate) => candidate.levels)
    .find((candidate) => candidate.id === substance.level_id);
  const zone = zones.find((candidate) => candidate.id === substance.zone_id);
  return (
    [
      substance.building_id ? (building?.name ?? 'Bâtiment inconnu') : null,
      substance.level_id ? (level?.label ?? 'Niveau inconnu') : null,
      substance.zone_id ? (zone?.name ?? 'Zone inconnue') : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Tout le site'
  );
}

function SubstanceCard({
  siteId,
  substance,
  buildings,
  zones,
  documents,
  canWrite,
  downloading,
  onOpen,
}: {
  siteId: string;
  substance: Substance;
  buildings: readonly Building[];
  zones: readonly Zone[];
  documents: readonly Document[];
  canWrite: boolean;
  downloading: boolean;
  onOpen: (assetId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const update = useApiMutation(
    (options, patch: SubstanceUpdate) => api.updateSubstance(options, substance.id, substance.row_version, patch),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'substances')],
  );
  const archived = substance.status === 'archived';
  const sheet = documents.find((document) => document.id === substance.fds_document_id);
  const sheetAsset = sheet?.versions[0]?.asset;
  const details = [
    substance.un_number ? `ONU ${substance.un_number}` : null,
    substance.physical_state ? PHYSICAL_STATE_LABELS[substance.physical_state] : null,
    substance.quantity !== null ? `${quantityFormat.format(substance.quantity)} ${substance.unit ?? ''}`.trim() : null,
  ].filter(Boolean);

  return (
    <Card className={archived ? 'opacity-70' : undefined}>
      <CardContent className="space-y-3">
        {editing ? (
          <SubstanceForm
            initial={substance}
            buildings={buildings}
            zones={zones}
            documents={documents}
            submitLabel="Enregistrer"
            pending={update.isPending}
            error={update.error}
            onSubmit={async (payload) => {
              await update.mutateAsync(payload);
              setEditing(false);
            }}
            onCancel={() => {
              update.reset();
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{substance.name}</p>
                {details.length > 0 ? <p className="text-sm text-muted">{details.join(' · ')}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {substance.hazard_classes.map((code) => (
                  <Badge key={code} tone="important" title={code}>
                    {HAZARD_CLASS_LABELS[code]}
                  </Badge>
                ))}
                {archived ? <Badge>Archivée</Badge> : null}
              </div>
            </div>
            <p className="text-sm">
              <span className="text-muted">Localisation : </span>
              {locationOf(substance, buildings, zones)}
              {substance.location_note ? <span className="text-muted"> · {substance.location_note}</span> : null}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {substance.fds_document_id ? (
                <>
                  <span>
                    <span className="text-muted">FDS : </span>
                    {substance.fds_title ?? sheet?.title ?? 'document du site'}
                  </span>
                  {sheetAsset?.scan_status === 'clean' ? (
                    <Button size="sm" variant="secondary" disabled={downloading} onClick={() => onOpen(sheetAsset.id)}>
                      <ExternalLink aria-hidden="true" className="size-4" />
                      Ouvrir
                    </Button>
                  ) : null}
                </>
              ) : (
                <Badge tone="critical">FDS absente</Badge>
              )}
            </div>
            {substance.notes ? <p className="text-sm whitespace-pre-line text-muted">{substance.notes}</p> : null}
            {update.error ? <ApiErrorAlert error={update.error} /> : null}
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ status: archived ? 'active' : 'archived' })}
                >
                  {archived ? 'Réactiver' : 'Archiver'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Hazardous substances of a site and their FDS (RISK-03), as published in the ETARE. */
export function SubstancesPanel({ siteId }: { siteId: string }) {
  const canWrite = usePermissions().has('site:write');
  const substances = useSiteSubstances(siteId);
  const buildings = useBuildings(siteId);
  const zones = useSiteZones(siteId);
  const documents = useDocuments(siteId);
  const [adding, setAdding] = useState(false);
  const create = useApiMutation(
    (options, input: SubstanceCreateInput) => api.createSiteSubstance(options, siteId, input),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'substances')],
  );
  const download = useApiMutation(
    (options, assetId: string) => api.getAssetDownload(options, assetId),
    () => [],
  );
  const open = (assetId: string) => download.mutate(assetId, { onSuccess: (ticket) => openInNewTab(ticket.url) });

  if (substances.isPending) return <LoadingCard lines={3} />;
  if (substances.error) return <ApiErrorAlert error={substances.error} />;

  const context = { buildings: buildings.data ?? [], zones: zones.data ?? [], documents: documents.data ?? [] };
  const active = substances.data.filter((substance) => substance.status === 'active');
  const archived = substances.data.filter((substance) => substance.status === 'archived');
  const card = (substance: Substance) => (
    <SubstanceCard
      key={`${substance.id}-${substance.row_version}`}
      siteId={siteId}
      substance={substance}
      canWrite={canWrite}
      downloading={download.isPending}
      onOpen={open}
      {...context}
    />
  );

  return (
    <div className="space-y-4">
      {canWrite ? (
        adding ? (
          <Card>
            <CardHeader>
              <CardTitle>Nouvelle matière dangereuse</CardTitle>
            </CardHeader>
            <CardContent>
              <SubstanceForm
                {...context}
                submitLabel="Ajouter la matière"
                pending={create.isPending}
                error={create.error}
                onSubmit={async (payload) => {
                  await create.mutateAsync(payload);
                  setAdding(false);
                }}
                onCancel={() => {
                  create.reset();
                  setAdding(false);
                }}
              />
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setAdding(true)}>Déclarer une matière dangereuse</Button>
        )
      ) : null}
      {download.error ? <ApiErrorAlert error={download.error} /> : null}
      {buildings.error ? <ApiErrorAlert error={buildings.error} /> : null}
      {zones.error ? <ApiErrorAlert error={zones.error} /> : null}
      {documents.error ? <ApiErrorAlert error={documents.error} /> : null}
      {active.length === 0 ? (
        <p className="text-sm text-muted">Aucune matière dangereuse déclarée sur ce site.</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">{active.map(card)}</div>
      {archived.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-info">Matières archivées ({archived.length})</summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">{archived.map(card)}</div>
        </details>
      ) : null}
    </div>
  );
}
