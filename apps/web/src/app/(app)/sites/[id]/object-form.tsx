'use client';

import type { ObjectType, OperationalObject } from '@etare/contracts';
import {
  CRITICALITIES,
  OBJECT_STATUSES,
  validateObjectProperties,
  type Criticality,
  type ObjectStatus,
} from '@etare/domain';
import { Button, Field, Input, Select, Textarea } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import {
  PropertyFields,
  fromPropertyDraft,
  toPropertyDraft,
  type PropertyDraft,
} from '@/components/forms/property-fields';
import { CRITICALITY_LABELS, OBJECT_STATUS_LABELS } from '@/components/labels';

export interface ObjectFormValues {
  readonly label: string | null;
  readonly name: string | null;
  readonly criticality: Criticality;
  readonly status: ObjectStatus;
  readonly instructions: string | null;
  readonly properties: Record<string, string | number | boolean>;
}

const SURFACE_NAMES = { carte: 'la carte', plan: 'le plan' } as const;

/** How to draw each kind of geometry, on the map or on a plan. */
export function drawingHint(kind: ObjectType['geometry_kind'], surface: 'carte' | 'plan') {
  return kind === 'point'
    ? `Cliquez sur ${SURFACE_NAMES[surface]} pour placer le point.`
    : kind === 'line'
      ? 'Cliquez pour poser les points de la ligne, double-cliquez pour la terminer.'
      : 'Cliquez pour poser les sommets, puis sur le premier pour fermer la surface.';
}

/** Form of an operational object: common fields, then the properties declared by its type. */
export function ObjectForm({
  type,
  object,
  geometryReady,
  saving,
  error,
  onSave,
  onCancel,
  onVerify,
  onDelete,
  surface = 'carte',
}: {
  type: ObjectType;
  object: OperationalObject | null;
  geometryReady: boolean;
  saving: boolean;
  error: unknown;
  onSave: (values: ObjectFormValues) => void;
  onCancel: () => void;
  onVerify?: (() => void) | undefined;
  /** Archives the object (deletion of working data is an explicit transition). */
  onDelete?: (() => void) | undefined;
  surface?: 'carte' | 'plan';
}) {
  const [label, setLabel] = useState(object?.label ?? '');
  const [name, setName] = useState(object?.name ?? '');
  const [criticality, setCriticality] = useState<Criticality>(object?.criticality ?? 'info');
  const [status, setStatus] = useState<ObjectStatus>(object?.status ?? 'active');
  const [instructions, setInstructions] = useState(object?.instructions ?? '');
  const [draft, setDraft] = useState<PropertyDraft>(() =>
    toPropertyDraft(type.properties_schema, object?.properties ?? {}),
  );
  const [issues, setIssues] = useState<Record<string, string>>({});
  const prefix = `object-${object?.id ?? 'new'}`;

  function submit() {
    const properties = fromPropertyDraft(type.properties_schema, draft);
    const found = validateObjectProperties(type.properties_schema, properties);
    setIssues(Object.fromEntries(found.map((issue) => [issue.path.replace('properties.', ''), issue.message])));
    if (found.length > 0) return;
    onSave({
      label: label.trim() || null,
      name: name.trim() || null,
      criticality,
      status,
      instructions: instructions.trim() || null,
      properties,
    });
  }

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-sm font-semibold">{type.name}</p>
      {!geometryReady ? (
        <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
          {drawingHint(type.geometry_kind, surface)}
        </p>
      ) : (
        <p className="text-xs text-muted">Faites glisser l’objet ou ses sommets pour le déplacer.</p>
      )}
      {error ? <ApiErrorAlert error={error} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Libellé sur ${SURFACE_NAMES[surface]}`} htmlFor={`${prefix}-label`} hint="Ex. PEI 2, P1">
          <Input
            id={`${prefix}-label`}
            maxLength={40}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Field label="Criticité" htmlFor={`${prefix}-criticality`}>
          <Select
            id={`${prefix}-criticality`}
            value={criticality}
            onChange={(event) => setCriticality(event.target.value as Criticality)}
          >
            {CRITICALITIES.map((value) => (
              <option key={value} value={value}>
                {CRITICALITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nom" htmlFor={`${prefix}-name`} className="col-span-2">
          <Input id={`${prefix}-name`} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="État" htmlFor={`${prefix}-status`} className="col-span-2">
          <Select
            id={`${prefix}-status`}
            value={status}
            onChange={(event) => setStatus(event.target.value as ObjectStatus)}
          >
            {OBJECT_STATUSES.filter((value) => object !== null || value !== 'archived').map((value) => (
              <option key={value} value={value}>
                {OBJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <PropertyFields
          prefix={prefix}
          schema={type.properties_schema}
          draft={draft}
          issues={issues}
          onChange={(property, value) => setDraft((current) => ({ ...current, [property]: value }))}
        />
        <Field label="Consignes" htmlFor={`${prefix}-instructions`} className="col-span-2">
          <Textarea
            id={`${prefix}-instructions`}
            rows={3}
            maxLength={2000}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </Field>
      </div>
      {issues[''] ? <p className="text-sm text-critical">{issues['']}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!geometryReady || saving}>
          {saving ? 'Enregistrement…' : object ? 'Enregistrer' : 'Placer le point'}
        </Button>
        {onVerify ? (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onVerify}>
            Marquer comme vérifié
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
        {onDelete ? (
          <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onDelete}>
            Supprimer
          </Button>
        ) : null}
      </div>
    </form>
  );
}
