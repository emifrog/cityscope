import { isoDateTimeSchema } from '@etare/schemas';
import { z } from 'zod';

const count = z.number().int().nonnegative();

/**
 * Board of a SIS (EXP-03, architecture §29 "tableau métier"): what its
 * administration must act upon. Aggregates only, read with audit:read.
 */
export const tenantSupervisionSchema = z
  .object({
    generated_at: isoDateTimeSchema,
    publications: z.object({
      in_force: count,
      published_7d: count,
      failed_7d: count,
      /** Queued or building for more than 15 minutes: the worker does not follow. */
      stuck: count,
      /** 95th percentile from the request to the publication, over 7 days (seconds). */
      duration_p95_seconds_7d: z.number().nonnegative(),
    }),
    devices: z.object({
      active: count,
      up_to_date: count,
      late: count,
      error: count,
      never_synced: count,
      /** Terminals still holding a version withdrawn since (until their next contact). */
      holding_withdrawn: count,
    }),
    receipts_7d: z.object({ installed: count, partial: count, error: count }),
    field_reports: z.object({ new: count, oldest_new_at: isoDateTimeSchema.nullable() }),
    files: z.object({ pending: count, rejected_7d: count, clean_bytes: count }),
    notifications: z.object({ pending: count, failed: count }),
    basemaps: z.object({ ready: count, failed: count, renewal_due: count }),
  })
  .meta({ id: 'TenantSupervision' });
export type TenantSupervision = z.infer<typeof tenantSupervisionSchema>;
