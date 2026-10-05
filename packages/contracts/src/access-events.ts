import { SENSITIVITY_LEVELS } from '@etare/domain';
import { cursorSchema, isoDateTimeSchema, pageLimitSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

/**
 * Journal of the accesses to sensitive sites (PER-02, ADR-025, cahier des
 * charges §6.3 and §7): consultations, exports and offline downloads, from
 * the back-office and from the tablets.
 */
export const ACCESS_ACTIONS = ['view', 'export', 'download_offline'] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

export const accessEventSchema = z
  .object({
    id: uuidSchema,
    occurred_at: isoDateTimeSchema,
    /** When the server received it: later than occurred_at for an event of a tablet sent at its next contact. */
    recorded_at: isoDateTimeSchema,
    action: z.enum(ACCESS_ACTIONS),
    origin: z.string(),
    sensitivity: z.enum(SENSITIVITY_LEVELS).exclude(['normal']),
    site_id: uuidSchema,
    site_name: z.string(),
    user_name: z.string().nullable(),
    device_name: z.string().nullable(),
    publication_number: z.number().int().positive().nullable(),
  })
  .meta({ id: 'AccessEvent' });
export type AccessEvent = z.infer<typeof accessEventSchema>;

export const accessEventListQuerySchema = z
  .object({ site_id: uuidSchema.optional(), cursor: cursorSchema.optional(), limit: pageLimitSchema })
  .meta({ id: 'AccessEventListQuery' });
export type AccessEventListQuery = z.infer<typeof accessEventListQuerySchema>;

export const accessEventListSchema = z
  .object({ items: z.array(accessEventSchema), next_cursor: z.string().nullable() })
  .meta({ id: 'AccessEventList' });
export type AccessEventList = z.infer<typeof accessEventListSchema>;

/** Consultations of sensitive sites made offline on a tablet, sent at its next contact (idempotent). */
export const syncAccessEventsSchema = z
  .object({
    events: z
      .array(
        z.object({
          /** Generated on the tablet: the same event sent twice is recorded once. */
          client_event_id: uuidSchema,
          site_id: uuidSchema,
          publication_id: uuidSchema,
          action: z.literal('view'),
          occurred_at: isoDateTimeSchema,
        }),
      )
      .min(1)
      .max(200),
  })
  .meta({ id: 'SyncAccessEvents' });
export type SyncAccessEvents = z.infer<typeof syncAccessEventsSchema>;

export const syncAccessEventsResultSchema = z
  .object({ received: z.number().int().nonnegative() })
  .meta({ id: 'SyncAccessEventsResult' });
export type SyncAccessEventsResult = z.infer<typeof syncAccessEventsResultSchema>;
