import { isoDateTimeSchema, uuidSchema } from '@etare/schemas';
import { z } from 'zod';

// ------------------------------------------------------------------ notifications (POR-05, ADR-020)
export const NOTIFICATION_KINDS = [
  'portal_invitation',
  'contribution_info_request',
  'contribution_decision',
  // Security alerts of an account (ADR-022): recovery code used, reset by the administration.
  'second_factor_recovered',
  'second_factor_reset',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed'] as const;

export const notificationSchema = z
  .object({
    id: uuidSchema,
    kind: z.enum(NOTIFICATION_KINDS),
    status: z.enum(NOTIFICATION_STATUSES),
    recipient: z.object({ id: uuidSchema, name: z.string().nullable(), email: z.string().nullable() }),
    /** What it is about: the sites of an invitation, or the title of a proposal and its site. */
    about: z.string(),
    attempts: z.number().int().min(0),
    last_error: z.string().nullable(),
    sent_at: isoDateTimeSchema.nullable(),
    created_at: isoDateTimeSchema,
  })
  .meta({ id: 'Notification' });
export type Notification = z.infer<typeof notificationSchema>;

export const notificationListQuerySchema = z.object({
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const notificationListSchema = z.object({ items: z.array(notificationSchema) }).meta({ id: 'NotificationList' });
export type NotificationList = z.infer<typeof notificationListSchema>;
