'use client';

import type { Risk, RiskType, Zone } from '@etare/contracts';
import { RISK_SEVERITIES, ZONE_TYPES, validateObjectProperties, type ZoneType } from '@etare/domain';
import { Button, Field, Input, Select, Textarea } from '@etare/ui';
import { useState, type ReactNode } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import {
  PropertyFields,
  fromPropertyDraft,
  toPropertyDraft,
  type PropertyDraft,
} from '@/components/forms/property-fields';
import { RISK_SEVERITY_LABELS, ZONE_TYPE_LABELS } from '@/components/labels';
import { RiskPictogram } from '@/components/plan/risk-pictograms';

/** Drawing instructions, then the buttons shared by the forms of plan items. */
function FormFrame({
  title,
  hint,
  geometryReady,
  saving,
  error,
  creating,
  onSubmit,
  onCancel,
  onDelete,
  children,
}: {
  title: ReactNode;
  hint: string;
  geometryReady: boolean;
  saving: boolean;
  error: unknown;
  creating: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="text-sm font-semibold">{title}</div>
      {!geometryReady ? (
        <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">{hint}</p>
      ) : (
        <p className="text-xs text-muted">Faites glisser l’élément ou ses sommets pour le déplacer.</p>
      )}
      {error ? <ApiErrorAlert error={error} /> : null}
      <div className="grid grid-cols-2 gap-3">{children}</div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={!geometryReady || saving}>
          {saving ? 'Enregistrement…' : creating ? 'Ajouter au plan' : 'Enregistrer'}
        </Button>
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

export const SURFACE_HINT = 'Cliquez pour poser les sommets, puis sur le premier pour fermer la surface.';
export const POINT_HINT = 'Cliquez sur le plan pour placer le point.';

export interface ZoneFormValues {
  readonly name: string;
  readonly zone_type: ZoneType;
}

export function ZoneForm({
  zone,
  geometryReady,
  saving,
  error,
  onSave,
  onCancel,
  onDelete,
}: {
  zone: Zone | null;
  geometryReady: boolean;
  saving: boolean;
  error: unknown;
  onSave: (values: ZoneFormValues) => void;
  onCancel: () => void;
  onDelete?: (() => void) | undefined;
}) {
  const [name, setName] = useState(zone?.name ?? '');
  const [zoneType, setZoneType] = useState<ZoneType>(zone?.zone_type ?? 'room');
  const [problem, setProblem] = useState<string | undefined>();
  const prefix = `zone-${zone?.id ?? 'new'}`;
  return (
    <FormFrame
      title={zone ? `Zone « ${zone.name} »` : 'Nouvelle zone'}
      hint={SURFACE_HINT}
      geometryReady={geometryReady}
      saving={saving}
      error={error}
      creating={!zone}
      onCancel={onCancel}
      onDelete={onDelete}
      onSubmit={() => {
        if (!name.trim()) return setProblem('Nommez la zone.');
        setProblem(undefined);
        onSave({ name: name.trim(), zone_type: zoneType });
      }}
    >
      <Field label="Nom" htmlFor={`${prefix}-name`} error={problem} className="col-span-2">
        <Input id={`${prefix}-name`} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Type de zone" htmlFor={`${prefix}-type`} className="col-span-2">
        <Select
          id={`${prefix}-type`}
          value={zoneType}
          onChange={(event) => setZoneType(event.target.value as ZoneType)}
        >
          {ZONE_TYPES.map((type) => (
            <option key={type} value={type}>
              {ZONE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>
    </FormFrame>
  );
}

export interface RiskFormValues {
  readonly severity: number;
  readonly label: string | null;
  readonly description: string | null;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly properties: Record<string, string | number | boolean>;
}

export function RiskForm({
  type,
  risk,
  shape,
  geometryReady,
  saving,
  error,
  onSave,
  onCancel,
  onDelete,
}: {
  type: RiskType;
  risk: Risk | null;
  shape: 'point' | 'polygon';
  geometryReady: boolean;
  saving: boolean;
  error: unknown;
  onSave: (values: RiskFormValues) => void;
  onCancel: () => void;
  onDelete?: (() => void) | undefined;
}) {
  const [severity, setSeverity] = useState(risk?.severity ?? type.default_severity);
  const [label, setLabel] = useState(risk?.label ?? '');
  const [description, setDescription] = useState(risk?.description ?? '');
  const [quantity, setQuantity] = useState(risk?.quantity === null || !risk ? '' : String(risk.quantity));
  const [unit, setUnit] = useState(risk?.unit ?? '');
  const [draft, setDraft] = useState<PropertyDraft>(() =>
    toPropertyDraft(type.properties_schema, risk?.properties ?? {}),
  );
  const [issues, setIssues] = useState<Record<string, string>>({});
  const prefix = `risk-${risk?.id ?? 'new'}`;

  function submit() {
    const properties = fromPropertyDraft(type.properties_schema, draft);
    const found: Record<string, string> = Object.fromEntries(
      validateObjectProperties(type.properties_schema, properties).map((issue) => [
        issue.path.replace('properties.', ''),
        issue.message,
      ]),
    );
    const amount = quantity.trim() === '' ? null : Number(quantity.replace(',', '.'));
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) found['quantity'] = 'Quantité positive attendue.';
    if ((amount === null) !== (unit.trim() === '')) found['unit'] = 'Une quantité s’accompagne de son unité.';
    setIssues(found);
    if (Object.keys(found).length > 0) return;
    onSave({
      severity,
      label: label.trim() || null,
      description: description.trim() || null,
      quantity: amount,
      unit: unit.trim() || null,
      properties,
    });
  }

  return (
    <FormFrame
      title={
        <span className="flex items-center gap-2">
          <RiskPictogram iconKey={type.icon_key} />
          {type.name}
        </span>
      }
      hint={shape === 'point' ? POINT_HINT : SURFACE_HINT}
      geometryReady={geometryReady}
      saving={saving}
      error={error}
      creating={!risk}
      onCancel={onCancel}
      onDelete={onDelete}
      onSubmit={submit}
    >
      <Field label="Gravité" htmlFor={`${prefix}-severity`}>
        <Select
          id={`${prefix}-severity`}
          value={String(severity)}
          onChange={(event) => setSeverity(Number(event.target.value))}
        >
          {RISK_SEVERITIES.map((value) => (
            <option key={value} value={value}>
              {RISK_SEVERITY_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Libellé sur le plan" htmlFor={`${prefix}-label`} hint="Ex. O₂, Cuve">
        <Input id={`${prefix}-label`} maxLength={40} value={label} onChange={(event) => setLabel(event.target.value)} />
      </Field>
      <Field label="Quantité" htmlFor={`${prefix}-quantity`} error={issues['quantity']}>
        <Input
          id={`${prefix}-quantity`}
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </Field>
      <Field label="Unité" htmlFor={`${prefix}-unit`} error={issues['unit']} hint="Ex. bouteilles, kg, m³">
        <Input id={`${prefix}-unit`} maxLength={20} value={unit} onChange={(event) => setUnit(event.target.value)} />
      </Field>
      <PropertyFields
        prefix={prefix}
        schema={type.properties_schema}
        draft={draft}
        issues={issues}
        onChange={(property, value) => setDraft((current) => ({ ...current, [property]: value }))}
      />
      <Field label="Description et consignes" htmlFor={`${prefix}-description`} className="col-span-2">
        <Textarea
          id={`${prefix}-description`}
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      {issues[''] ? <p className="col-span-2 text-sm text-critical">{issues['']}</p> : null}
    </FormFrame>
  );
}
