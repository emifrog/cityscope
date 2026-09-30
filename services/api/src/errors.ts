import type { ApiError, ApiErrorCode } from '@etare/contracts';
import { DomainError, InvalidInput } from '@etare/domain';
import { ZodError } from 'zod';

export const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  MFA_REQUIRED: 403,
  SELF_APPROVAL_FORBIDDEN: 403,
  TENANT_REQUIRED: 400,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

function isApiErrorCode(code: string): code is ApiErrorCode {
  return code in STATUS_BY_CODE;
}

/**
 * Converts any error into the public error format. Unexpected errors never
 * expose their message or stack: the trace id links the answer to the logs.
 */
export function toApiError(error: unknown, traceId: string): { status: number; body: ApiError; expected: boolean } {
  if (error instanceof ZodError) {
    return toApiError(
      new InvalidInput(
        'Requête invalide.',
        error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      ),
      traceId,
    );
  }
  if (error instanceof DomainError && isApiErrorCode(error.code)) {
    const fields = error instanceof InvalidInput && error.fields.length > 0 ? { fields: [...error.fields] } : {};
    return {
      status: STATUS_BY_CODE[error.code],
      body: { error: { code: error.code, message: error.message, trace_id: traceId, ...fields } },
      expected: true,
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Erreur interne.', trace_id: traceId } },
    expected: false,
  };
}
