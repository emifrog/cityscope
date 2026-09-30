'use client';

import type { RiskType, RiskTypeCreateInput } from '@etare/contracts';
import {
  CATALOG_CODE_PATTERN,
  FIELD_KEY_PATTERN,
  FIELD_KINDS,
  MAX_CATALOG_FIELDS,
  RISK_ICON_KEYS,
  RISK_SEVERITIES,
  fieldKeyFromTitle,
  fieldsFromSchema,
  type CatalogField,
  type FieldKind,
  type RiskIconKey,
} from '@etare/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  cn,
} from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { FIELD_KIND_LABELS, RISK_ICON_LABELS, RISK_SEVERITY_LABELS } from '@/components/labels';
import { RiskPictogram } from '@/components/plan/risk-pictograms';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useRiskTypes } from '@/lib/queries';

interface FieldDraft {
  readonly id: number;
  readonly key: string;
  readonly title: string;
  readonly kind: FieldKind;
  readonly unit: string;
  readonly choices: string;
  readonly required: boolean;
}

let nextFieldId = 1;

const toDraft = (field: CatalogField): FieldDraft => ({
  id: nextFieldId++,
  key: field.key,
  title: field.title,
  kind: field.kind,
  unit: field.unit ?? '',
  choices: (field.choices ?? []).join(', '),
  required: field.required === true,
});

type FieldInput = NonNullable<RiskTypeCreateInput['fields']>[number];

const toField = (draft: FieldDraft): FieldInput => ({
  key: draft.key,
  title: draft.title.trim(),
  kind: draft.kind,
  ...(draft.unit.trim() ? { unit: draft.unit.trim() } : {}),
  ...(draft.kind === 'choice'
    ? {
        choices: draft.choices
          .split(',')
          .map((choice) => choice.trim())
          .filter(Boolean),
      }
    : {}),
  ...(draft.required ? { required: true } : {}),
});

function fieldProblems(drafts: readonly FieldDraft[]): Record<number, string> {
  const problems: Record<number, string> = {};
  const seen = new Set<string>();
  for (const draft of drafts) {
    const field = toField(draft);
    if (!field.title) problems[draft.id] = 'Donnez un intitulé au champ.';
    else if (!FIELD_KEY_PATTERN.test(field.key)) problems[draft.id] = 'Clé en minuscules sans accent (a-z, 0-9, _).';
    else if (seen.has(field.key)) problems[draft.id] = 'Deux champs ont la même clé.';
    else if (field.kind === 'choice' && (field.choices?.length ?? 0) < 2) {
      problems[draft.id] = 'Indiquez au moins deux choix, séparés par des virgules.';
    }
    seen.add(field.key);
  }
  return problems;
}

function RiskTypeForm({ type, onDone }: { type: RiskType | null; onDone: () => void }) {
  const [code, setCode] = useState(type?.code ?? '');
  const [name, setName] = useState(type?.name ?? '');
  const [severity, setSeverity] = useState(type?.default_severity ?? 3);
  const [icon, setIcon] = useState<RiskIconKey>((type?.icon_key as RiskIconKey | undefined) ?? 'risk-generic');
  const [fields, setFields] = useState<FieldDraft[]>(() => fieldsFromSchema(type?.properties_schema).map(toDraft));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [fieldIssues, setFieldIssues] = useState<Record<number, string>>({});
  const save = useApiMutation(
    (options, _: undefined) => {
      const payload = { name: name.trim(), default_severity: severity, icon_key: icon, fields: fields.map(toField) };
      return type
        ? api.updateRiskType(options, type.id, type.row_version, payload)
        : api.createRiskType(options, { code, ...payload });
    },
    (tenantId) => [queryKeys.riskTypes(tenantId)],
  );
  const prefix = `risk-type-${type?.id ?? 'new'}`;

  function update(id: number, patch: Partial<FieldDraft>) {
    setFields((current) => current.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  function submit() {
    const found: Record<string, string> = {};
    if (!type && !CATALOG_CODE_PATTERN.test(code)) found['code'] = 'Code en majuscules sans accent (A-Z, 0-9, _).';
    if (!name.trim()) found['name'] = 'Nommez le type de risque.';
    const issues = fieldProblems(fields);
    setProblems(found);
    setFieldIssues(issues);
    if (Object.keys(found).length > 0 || Object.keys(issues).length > 0) return;
    save.mutate(undefined, { onSuccess: onDone });
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="Code"
          htmlFor={`${prefix}-code`}
          error={problems['code']}
          hint={type ? 'Le code ne change plus une fois créé.' : 'Ex. CUVE_FIOUL'}
        >
          <Input
            id={`${prefix}-code`}
            value={code}
            maxLength={40}
            disabled={type !== null}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </Field>
        <Field label="Nom" htmlFor={`${prefix}-name`} error={problems['name']}>
          <Input id={`${prefix}-name`} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Gravité par défaut" htmlFor={`${prefix}-severity`}>
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
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Pictogramme</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {RISK_ICON_KEYS.map((key) => (
            <label
              key={key}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-center text-xs',
                icon === key ? 'border-brand-accent ring-2 ring-brand-accent' : 'border-border hover:bg-subtle',
              )}
            >
              <input
                type="radio"
                name={`${prefix}-icon`}
                value={key}
                checked={icon === key}
                onChange={() => setIcon(key)}
                className="sr-only"
              />
              <RiskPictogram iconKey={key} />
              {RISK_ICON_LABELS[key]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Champs propres à ce risque</legend>
        <p className="text-xs text-muted">
          Renseignés pour chaque risque de ce type (ex. volume d’une cuve). Modifier les champs ne change pas les
          valeurs déjà saisies.
        </p>
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_10rem_7rem]"
          >
            <Field label="Intitulé" htmlFor={`${prefix}-field-${field.id}-title`} error={fieldIssues[field.id]}>
              <Input
                id={`${prefix}-field-${field.id}-title`}
                value={field.title}
                maxLength={80}
                onChange={(event) =>
                  update(field.id, {
                    title: event.target.value,
                    // The key follows the title until the type is saved with it.
                    ...(fieldsFromSchema(type?.properties_schema).some((saved) => saved.key === field.key)
                      ? {}
                      : { key: fieldKeyFromTitle(event.target.value) }),
                  })
                }
              />
            </Field>
            <Field label="Clé" htmlFor={`${prefix}-field-${field.id}-key`}>
              <Input
                id={`${prefix}-field-${field.id}-key`}
                value={field.key}
                maxLength={40}
                onChange={(event) => update(field.id, { key: event.target.value })}
              />
            </Field>
            <Field label="Type" htmlFor={`${prefix}-field-${field.id}-kind`}>
              <Select
                id={`${prefix}-field-${field.id}-kind`}
                value={field.kind}
                onChange={(event) => update(field.id, { kind: event.target.value as FieldKind })}
              >
                {FIELD_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {FIELD_KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unité" htmlFor={`${prefix}-field-${field.id}-unit`}>
              <Input
                id={`${prefix}-field-${field.id}-unit`}
                value={field.unit}
                maxLength={20}
                disabled={field.kind === 'boolean' || field.kind === 'choice'}
                onChange={(event) => update(field.id, { unit: event.target.value })}
              />
            </Field>
            {field.kind === 'choice' ? (
              <Field
                label="Choix (séparés par des virgules)"
                htmlFor={`${prefix}-field-${field.id}-choices`}
                className="sm:col-span-4"
              >
                <Input
                  id={`${prefix}-field-${field.id}-choices`}
                  value={field.choices}
                  onChange={(event) => update(field.id, { choices: event.target.value })}
                />
              </Field>
            ) : null}
            <div className="flex items-center justify-between gap-2 sm:col-span-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-accent"
                  checked={field.required}
                  onChange={(event) => update(field.id, { required: event.target.checked })}
                />
                Obligatoire
              </label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setFields((current) => current.filter((candidate) => candidate.id !== field.id))}
              >
                Retirer le champ {index + 1}
              </Button>
            </div>
          </div>
        ))}
        {fields.length < MAX_CATALOG_FIELDS ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              setFields((current) => [
                ...current,
                { id: nextFieldId++, key: '', title: '', kind: 'text', unit: '', choices: '', required: false },
              ])
            }
          >
            Ajouter un champ
          </Button>
        ) : null}
      </fieldset>

      {save.error ? <ApiErrorAlert error={save.error} /> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Enregistrement…' : type ? 'Enregistrer' : 'Ajouter au catalogue'}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={save.isPending} onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function RiskTypeRow({ type, onEdit }: { type: RiskType; onEdit?: (() => void) | undefined }) {
  const status = useApiMutation(
    (options, next: 'active' | 'deprecated') =>
      api.updateRiskType(options, type.id, type.row_version, { status: next }),
    (tenantId) => [queryKeys.riskTypes(tenantId)],
  );
  const fieldCount = fieldsFromSchema(type.properties_schema).length;
  return (
    <li className={cn('flex flex-wrap items-center gap-3 py-2', type.status === 'deprecated' && 'opacity-60')}>
      <RiskPictogram iconKey={type.icon_key} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {type.name} <span className="text-xs font-normal text-muted">{type.code}</span>
        </p>
        <p className="text-xs text-muted">
          Gravité par défaut {type.default_severity}
          {fieldCount > 0
            ? ` · ${fieldCount} champ${fieldCount > 1 ? 's' : ''} propre${fieldCount > 1 ? 's' : ''}`
            : ''}
        </p>
      </div>
      {type.status === 'deprecated' ? <Badge tone="neutral">Retiré</Badge> : null}
      {onEdit ? (
        <div className="flex gap-2">
          {type.status === 'active' ? (
            <Button size="sm" variant="secondary" onClick={onEdit}>
              Modifier
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={status.isPending}
            onClick={() => status.mutate(type.status === 'active' ? 'deprecated' : 'active')}
          >
            {type.status === 'active' ? 'Retirer' : 'Réactiver'}
          </Button>
        </div>
      ) : null}
      {status.error ? <ApiErrorAlert error={status.error} /> : null}
    </li>
  );
}

/**
 * Risk catalogue of the SIS (RISK-01): the national types, read-only, and the
 * types the SIS adds with their pictogram, default severity and own fields.
 * A retired type is no longer offered; its occurrences remain.
 */
export function RiskCatalogAdmin() {
  const types = useRiskTypes(true);
  const [editing, setEditing] = useState<RiskType | 'new' | null>(null);

  if (types.isPending) return <LoadingCard lines={5} />;
  if (types.error) return <ApiErrorAlert error={types.error} />;
  const own = types.data.filter((type) => type.owner === 'sis');
  const national = types.data.filter((type) => type.owner === 'national');

  return (
    <div className="space-y-4">
      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing === 'new' ? 'Nouveau type de risque' : `Modifier « ${editing.name} »`}</CardTitle>
          </CardHeader>
          <CardContent>
            <RiskTypeForm
              key={editing === 'new' ? 'new' : editing.id}
              type={editing === 'new' ? null : editing}
              onDone={() => setEditing(null)}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Types propres au SIS ({own.length})</CardTitle>
            <CardDescription>Proposés aux rédacteurs avec le catalogue national.</CardDescription>
          </div>
          {!editing ? <Button onClick={() => setEditing('new')}>Ajouter un type de risque</Button> : null}
        </CardHeader>
        <CardContent>
          {own.length === 0 ? (
            <Alert tone="info">Aucun type propre : le catalogue national suffit pour l’instant.</Alert>
          ) : (
            <ul className="divide-y divide-border">
              {own.map((type) => (
                <RiskTypeRow key={type.id} type={type} onEdit={() => setEditing(type)} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Catalogue national ({national.length})</CardTitle>
          <CardDescription>Données de référence communes à tous les SIS : non modifiables.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {national.map((type) => (
              <RiskTypeRow key={type.id} type={type} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
