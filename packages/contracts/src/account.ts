import { isoDateTimeSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

// ------------------------------------------------------------------ own sessions (Mon compte)
export const accountSessionSchema = z
  .object({
    id: uuidSchema,
    created_at: isoDateTimeSchema,
    /** Last sign-in or token renewal of the session. */
    last_seen_at: isoDateTimeSchema,
    /** Browser or application that opened the session, as it announced itself. */
    user_agent: z.string().nullable(),
    ip: z.string().nullable(),
    /** 'aal2': the second factor was used in this session. */
    aal: z.enum(['aal1', 'aal2']).nullable(),
    /** The session of the request. */
    is_current: z.boolean(),
  })
  .meta({ id: 'AccountSession' });
export type AccountSession = z.infer<typeof accountSessionSchema>;

export const accountSessionListSchema = z
  .object({ items: z.array(accountSessionSchema) })
  .meta({ id: 'AccountSessionList' });
export type AccountSessionList = z.infer<typeof accountSessionListSchema>;

export const sessionRevocationSchema = z
  .object({ revoked: z.number().int().nonnegative() })
  .meta({ id: 'SessionRevocation' });
export type SessionRevocation = z.infer<typeof sessionRevocationSchema>;

// ------------------------------------------------------------------ second-factor policy of the SIS
/**
 * 'privileged': sensitive actions (validate, publish, administer) need the second factor (default);
 * 'all': every access outside an enrolled terminal needs it; 'none': never (discouraged).
 * Whatever the policy, an account with a second factor uses it for every request.
 */
export const SECOND_FACTOR_POLICIES = ['privileged', 'all', 'none'] as const;
export type SecondFactorPolicy = (typeof SECOND_FACTOR_POLICIES)[number];

export const securitySettingsSchema = z
  .object({ second_factor_policy: z.enum(SECOND_FACTOR_POLICIES) })
  .meta({ id: 'SecuritySettings' });
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;
