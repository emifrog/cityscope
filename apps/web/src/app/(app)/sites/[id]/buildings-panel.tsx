'use client';

import type { Building, BuildingCreate } from '@etare/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { blankToNull, isOptionalNumber, numberOrNull } from '@/components/form-helpers';
import { RECORD_STATUS_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useBuildings, usePermissions } from '@/lib/queries';

const buildingFormSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
  code: z.string().trim().max(40),
  construction_type: z.string().trim().max(120),
  height_m: z.string().refine((v) => isOptionalNumber(v, 0, 1000), 'Hauteur entre 0 et 1000 m.'),
  floors_above: z.string().refine((v) => isOptionalNumber(v, 0, 200, true), 'Nombre entier entre 0 et 200.'),
  floors_below: z.string().refine((v) => isOptionalNumber(v, 0, 50, true), 'Nombre entier entre 0 et 50.'),
  notes: z.string().trim().max(2000),
});
type BuildingFormValues = z.infer<typeof buildingFormSchema>;

const toBuildingPayload = (values: BuildingFormValues): BuildingCreate => ({
  name: values.name.trim(),
  code: blankToNull(values.code),
  construction_type: blankToNull(values.construction_type),
  height_m: numberOrNull(values.height_m),
  floors_above: numberOrNull(values.floors_above),
  floors_below: numberOrNull(values.floors_below),
  notes: blankToNull(values.notes),
});

const buildingDefaults = (building?: Building): BuildingFormValues => ({
  name: building?.name ?? '',
  code: building?.code ?? '',
  construction_type: building?.construction_type ?? '',
  height_m: building?.height_m?.toString() ?? '',
  floors_above: building?.floors_above?.toString() ?? '',
  floors_below: building?.floors_below?.toString() ?? '',
  notes: building?.notes ?? '',
});

function BuildingForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Building | undefined;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (payload: BuildingCreate) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const prefix = initial?.id ?? 'new';
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BuildingFormValues>({
    resolver: zodResolver(buildingFormSchema),
    defaultValues: buildingDefaults(initial),
  });

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-3"
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(toBuildingPayload(values));
        if (!initial) reset(buildingDefaults());
      })}
    >
      {error ? (
        <div className="md:col-span-3">
          <ApiErrorAlert error={error} />
        </div>
      ) : null}
      <Field label="Nom" htmlFor={`${prefix}-name`} error={errors.name?.message}>
        <Input id={`${prefix}-name`} {...register('name')} />
      </Field>
      <Field label="Code" htmlFor={`${prefix}-code`} error={errors.code?.message}>
        <Input id={`${prefix}-code`} {...register('code')} />
      </Field>
      <Field label="Construction" htmlFor={`${prefix}-construction`} error={errors.construction_type?.message}>
        <Input id={`${prefix}-construction`} placeholder="Béton, bois…" {...register('construction_type')} />
      </Field>
      <Field label="Hauteur (m)" htmlFor={`${prefix}-height`} error={errors.height_m?.message}>
        <Input id={`${prefix}-height`} inputMode="decimal" {...register('height_m')} />
      </Field>
      <Field label="Niveaux hors sol" htmlFor={`${prefix}-above`} error={errors.floors_above?.message}>
        <Input id={`${prefix}-above`} inputMode="numeric" {...register('floors_above')} />
      </Field>
      <Field label="Niveaux en sous-sol" htmlFor={`${prefix}-below`} error={errors.floors_below?.message}>
        <Input id={`${prefix}-below`} inputMode="numeric" {...register('floors_below')} />
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

const levelFormSchema = z.object({
  label: z.string().trim().min(1, 'Libellé requis (ex. RDC, R+1, R-1).').max(40),
  sort_order: z
    .string()
    .refine((v) => v.trim() !== '' && isOptionalNumber(v, -20, 200, true), 'Ordre entier (0 = RDC).'),
  elevation_m: z.string().refine((v) => isOptionalNumber(v, -200, 1000), 'Altitude relative en mètres.'),
});
type LevelFormValues = z.infer<typeof levelFormSchema>;

function BuildingCard({ siteId, building, canWrite }: { siteId: string; building: Building; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const invalidate = (tenantId: string) => [
    queryKeys.siteRecords(tenantId, siteId, 'buildings'),
    queryKeys.site(tenantId, siteId),
  ];
  const update = useApiMutation(
    (options, patch: Parameters<typeof api.updateBuilding>[3]) =>
      api.updateBuilding(options, building.id, building.row_version, patch),
    invalidate,
  );
  const addLevel = useApiMutation(
    (options, input: Parameters<typeof api.createLevel>[2]) => api.createLevel(options, building.id, input),
    invalidate,
  );
  const archiveLevel = useApiMutation(
    (options, level: { id: string; row_version: number; status: 'active' | 'archived' }) =>
      api.updateLevel(options, level.id, level.row_version, { status: level.status }),
    invalidate,
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LevelFormValues>({
    resolver: zodResolver(levelFormSchema),
    defaultValues: { label: '', sort_order: '', elevation_m: '' },
  });

  const archived = building.status === 'archived';
  return (
    <Card className={archived ? 'opacity-70' : undefined}>
      <CardHeader>
        <div>
          <CardTitle>
            {building.name}
            {building.code ? <span className="ml-2 text-sm font-normal text-muted">({building.code})</span> : null}
          </CardTitle>
          <p className="text-sm text-muted">
            {[
              building.floors_above !== null ? `R+${building.floors_above}` : null,
              building.floors_below ? `${building.floors_below} sous-sol(s)` : null,
              building.height_m !== null ? `${building.height_m} m` : null,
              building.construction_type,
            ]
              .filter(Boolean)
              .join(' · ') || 'Caractéristiques non renseignées'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={archived ? 'neutral' : 'success'}>{RECORD_STATUS_LABELS[building.status]}</Badge>
          {canWrite && !editing ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
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
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <BuildingForm
            initial={building}
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
        ) : update.error ? (
          <ApiErrorAlert error={update.error} />
        ) : null}
        {building.notes && !editing ? <p className="text-sm whitespace-pre-line">{building.notes}</p> : null}

        <div>
          <h3 className="mb-2 text-sm font-semibold">Niveaux</h3>
          {building.levels.length === 0 ? <p className="text-sm text-muted">Aucun niveau.</p> : null}
          <ul className="divide-y divide-border rounded-md border border-border">
            {building.levels.map((level) => (
              <li key={level.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className={level.status === 'archived' ? 'text-muted line-through' : undefined}>
                  <strong>{level.label}</strong>
                  {level.elevation_m !== null ? <span className="text-muted"> · {level.elevation_m} m</span> : null}
                </span>
                {canWrite ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={archiveLevel.isPending}
                    onClick={() =>
                      archiveLevel.mutate({
                        id: level.id,
                        row_version: level.row_version,
                        status: level.status === 'archived' ? 'active' : 'archived',
                      })
                    }
                  >
                    {level.status === 'archived' ? 'Réactiver' : 'Archiver'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {archiveLevel.error ? <ApiErrorAlert error={archiveLevel.error} /> : null}
          {canWrite && !archived ? (
            <form
              noValidate
              className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
              onSubmit={handleSubmit(async (values) => {
                await addLevel.mutateAsync({
                  label: values.label.trim(),
                  sort_order: numberOrNull(values.sort_order) ?? 0,
                  elevation_m: numberOrNull(values.elevation_m),
                });
                reset();
              })}
            >
              <Field label="Libellé" htmlFor={`${building.id}-level-label`} error={errors.label?.message}>
                <Input id={`${building.id}-level-label`} placeholder="RDC" {...register('label')} />
              </Field>
              <Field label="Ordre" htmlFor={`${building.id}-level-order`} error={errors.sort_order?.message}>
                <Input
                  id={`${building.id}-level-order`}
                  inputMode="numeric"
                  placeholder="0"
                  {...register('sort_order')}
                />
              </Field>
              <Field
                label="Altitude (m)"
                htmlFor={`${building.id}-level-elevation`}
                error={errors.elevation_m?.message}
              >
                <Input id={`${building.id}-level-elevation`} inputMode="decimal" {...register('elevation_m')} />
              </Field>
              <Button type="submit" size="sm" variant="secondary" disabled={addLevel.isPending}>
                Ajouter le niveau
              </Button>
              {addLevel.error ? (
                <div className="md:col-span-4">
                  <ApiErrorAlert error={addLevel.error} />
                </div>
              ) : null}
            </form>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function BuildingsPanel({ siteId }: { siteId: string }) {
  const permissions = usePermissions();
  const canWrite = permissions.has('site:write');
  const buildings = useBuildings(siteId);
  const [adding, setAdding] = useState(false);
  const create = useApiMutation(
    (options, input: BuildingCreate) => api.createBuilding(options, siteId, input),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'buildings'), queryKeys.site(tenantId, siteId)],
  );

  if (buildings.isPending) return <LoadingCard lines={4} />;
  if (buildings.error) return <ApiErrorAlert error={buildings.error} />;

  return (
    <div className="space-y-4">
      {canWrite ? (
        adding ? (
          <Card>
            <CardHeader>
              <CardTitle>Nouveau bâtiment</CardTitle>
            </CardHeader>
            <CardContent>
              <BuildingForm
                submitLabel="Ajouter le bâtiment"
                pending={create.isPending}
                error={create.error}
                onSubmit={async (payload) => {
                  await create.mutateAsync(payload);
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setAdding(true)}>Ajouter un bâtiment</Button>
        )
      ) : null}
      {buildings.data.length === 0 ? <p className="text-sm text-muted">Aucun bâtiment pour ce site.</p> : null}
      {buildings.data.map((building) => (
        <BuildingCard
          key={`${building.id}-${building.row_version}`}
          siteId={siteId}
          building={building}
          canWrite={canWrite}
        />
      ))}
    </div>
  );
}
