'use client';

import { propertyDefinitions, type PropertyDefinition } from '@etare/domain';
import { Field, Input, Select } from '@etare/ui';

/** Values being typed: text as typed (numbers included), checkboxes as booleans. */
export type PropertyDraft = Record<string, string | boolean>;

export const toPropertyDraft = (schema: unknown, values: Readonly<Record<string, unknown>>): PropertyDraft =>
  Object.fromEntries(
    Object.entries(propertyDefinitions(schema)).map(([name, definition]) => {
      const value = values[name];
      if (definition.type === 'boolean') return [name, value === true];
      return [name, value === undefined || value === null ? '' : String(value)];
    }),
  );

/** Empty inputs are left out; numbers accept a decimal comma. */
export function fromPropertyDraft(schema: unknown, draft: PropertyDraft): Record<string, string | number | boolean> {
  const properties: Record<string, string | number | boolean> = {};
  for (const [name, definition] of Object.entries(propertyDefinitions(schema))) {
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

/** Inputs of the properties declared by a catalogue entry (object or risk type), in a two-column grid. */
export function PropertyFields({
  prefix,
  schema,
  draft,
  issues,
  onChange,
}: {
  prefix: string;
  schema: unknown;
  draft: PropertyDraft;
  issues: Readonly<Record<string, string>>;
  onChange: (name: string, value: string | boolean) => void;
}) {
  return Object.entries(propertyDefinitions(schema)).map(([property, definition]) => (
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
        onChange={(value) => onChange(property, value)}
      />
    </Field>
  ));
}
