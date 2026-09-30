'use client';

import type { ObjectType, OperationalObject } from '@etare/contracts';
import {
  CRITICALITIES,
  OBJECT_STATUSES,
  propertyDefinitions,
  validateObjectProperties,
  type Criticality,
  type ObjectStatus,
  type PropertyDefinition,
} from '@etare/domain';
import { Button, Field, Input, Select, Textarea } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import { CRITICALITY_LABELS, OBJECT_STATUS_LABELS } from '@/components/labels';

export interface ObjectFormValues {
  readonly label: string | null;
  readonly name: string | null;
  readonly criticality: Criticality;
  readonly status: ObjectStatus;
  readonly instructions: string | null;
  readonly properties: Record<string, string | number | boolean>;
}

type Draft = Record<string, string | boolean>;

const toDraft = (definitions: Readonly<Record<string, PropertyDefinition>>, values: Record<string, unknown>): Draft =>
  Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => {
      const value = values[name];
      if (definition.type === 'boolean') return [name, value === true];
      return [name, value === undefined || value === null ? '' : String(value)];
    }),
  );

/** Empty inputs are left out; numbers accept a decimal comma. */
function fromDraft(definitions: Readonly<Record<string, PropertyDefinition>>, draft: Draft) {
  const properties: Record<string, string | number | boolean> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    const value = draft[name];
    if (definition.type === 'boolean') {
      if (value === true) properties[name] = true;
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') continue;
    const isNumber = definition.type === 'number' || definition.type === 'integer';
    const numeric = Number(text.replace(',', '.'));
    properties[name] = isNumber
      ? numeric
      : definition.oneOf?.some((choice) => choice.const === numeric)
        ? numeric
        : text;
  }
  return properties;
}

function PropertyInput({
  id,
  definition,
  value,
  onChange,
}: {
  id: string;
  definition: PropertyDefinition;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}) {
  if (definition.type === 'boolean') {
    return (
      <input
        id={id}
        type="checkbox"
        className="size-4 accent-brand-accent"
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (definition.oneOf) {
    return (
      <Select id={id} value={String(value)} onChange={(event) => onChange(event.target.value)}>
        <option value="">—</option>
        {definition.oneOf.map((choice) => (
          <option key={String(choice.const)} value={String(choice.const)}>
            {choice.title ?? String(choice.const)}
          </option>
        ))}
      </Select>
    );
  }
  const numeric = definition.type === 'number' || definition.type === 'integer';
  return (
    <Input
      id={id}
      type={definition.format === 'date' ? 'date' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      maxLength={definition.maxLength}
      value={String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  );
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
}: {
  type: ObjectType;
  object: OperationalObject | null;
  geometryReady: boolean;
  saving: boolean;
  error: unknown;
  onSave: (values: ObjectFormValues) => void;
  onCancel: () => void;
  onVerify?: (() => void) | undefined;
}) {
  const definitions = propertyDefinitions(type.properties_schema);
  const [label, setLabel] = useState(object?.label ?? '');
  const [name, setName] = useState(object?.name ?? '');
  const [criticality, setCriticality] = useState<Criticality>(object?.criticality ?? 'info');
  const [status, setStatus] = useState<ObjectStatus>(object?.status ?? 'active');
  const [instructions, setInstructions] = useState(object?.instructions ?? '');
  const [draft, setDraft] = useState<Draft>(() => toDraft(definitions, object?.properties ?? {}));
  const [issues, setIssues] = useState<Record<string, string>>({});
  const prefix = `object-${object?.id ?? 'new'}`;

  function submit() {
    const properties = fromDraft(definitions, draft);
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
          {type.geometry_kind === 'point'
            ? 'Cliquez sur la carte pour placer le point.'
            : type.geometry_kind === 'line'
              ? 'Cliquez pour poser les points de la ligne, double-cliquez pour la terminer.'
              : 'Cliquez pour poser les sommets, puis sur le premier pour fermer la surface.'}
        </p>
      ) : (
        <p className="text-xs text-muted">Faites glisser l’objet ou ses sommets pour le déplacer.</p>
      )}
      {error ? <ApiErrorAlert error={error} /> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Libellé sur la carte" htmlFor={`${prefix}-label`} hint="Ex. PEI 2, P1">
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
        {Object.entries(definitions).map(([property, definition]) => (
          <Field
            key={property}
            label={`${definition.title ?? property}${definition.unit ? ` (${definition.unit})` : ''}`}
            htmlFor={`${prefix}-${property}`}
            error={issues[property]}
            className={definition.type === 'string' && !definition.oneOf ? 'col-span-2' : undefined}
          >
            <PropertyInput
              id={`${prefix}-${property}`}
              definition={definition}
              value={draft[property] ?? ''}
              onChange={(value) => setDraft((current) => ({ ...current, [property]: value }))}
            />
          </Field>
        ))}
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
      </div>
    </form>
  );
}
