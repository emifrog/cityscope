import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError } from '@/lib/api-client';

/** Empty form text becomes null (clears the value); other values are trimmed. */
export function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function numberOrNull(value: string | undefined): number | null {
  const trimmed = value?.trim().replace(',', '.') ?? '';
  return trimmed === '' ? null : Number(trimmed);
}

/** A numeric text field: empty, or a number within bounds (French decimal comma accepted). */
export function isOptionalNumber(value: string, min: number, max: number, integer = false): boolean {
  const number = numberOrNull(value);
  return (
    number === null ||
    (Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isInteger(number)))
  );
}

/**
 * Shows the field errors returned by the API (server-side validation) next to
 * the matching inputs. Returns true when at least one field was mapped.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldMap: Readonly<Record<string, Path<T>>> = {},
): boolean {
  if (!(error instanceof ApiRequestError) || error.fields.length === 0) return false;
  let mapped = false;
  for (const field of error.fields) {
    const target = fieldMap[field.path] ?? (field.path as Path<T>);
    setError(target, { type: 'server', message: field.message });
    mapped = true;
  }
  return mapped;
}

export function isStaleVersion(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'PRECONDITION_FAILED';
}
