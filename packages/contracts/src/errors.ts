import { z } from 'zod';

export const API_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'MFA_REQUIRED',
  'TENANT_REQUIRED',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'PRECONDITION_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  'INVALID_TRANSITION',
  'SELF_APPROVAL_FORBIDDEN',
  'RATE_LIMITED',
  'INTERNAL',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.enum(API_ERROR_CODES),
      message: z.string(),
      trace_id: z.string(),
      fields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    }),
  })
  .meta({
    id: 'ApiError',
    description: 'Erreur structurée : code stable, message utile, trace_id, sans détail interne.',
  });
export type ApiError = z.infer<typeof apiErrorSchema>;
