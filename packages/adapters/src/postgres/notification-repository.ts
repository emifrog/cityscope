import type { NotificationRepository, NotificationStore, NotificationToSend } from '@etare/application';
import { notificationSchema, type Notification, type NotificationListQuery } from '@etare/contracts';
import type { Pool, PoolClient } from './pool';

const iso = (value: unknown) =>
  value === null || value === undefined ? null : new Date(value as string).toISOString();

/** Notifications of the SIS for its administration (RLS: member:manage), newest first. */
const NOTIFICATION_SELECT = `
  select n.id, n.kind, n.status, n.recipient_id, u.display_name as recipient_name, u.email::text as recipient_email,
         case when n.kind in ('second_factor_recovered', 'second_factor_reset') then 'Double authentification'
              when n.invitation_id is not null then
           coalesce((select string_agg(s.name, ', ' order by lower(s.name))
                     from app.portal_invitation_site pis join app.site s on s.id = pis.site_id
                     where pis.invitation_id = n.invitation_id), 'Invitation')
         else (select c.title || ' — ' || s.name from app.contribution c join app.site s on s.id = c.site_id
               where c.id = n.contribution_id) end as about,
         n.attempts, n.last_error, n.sent_at, n.created_at
  from app.notification n
  left join app.user_account u on u.id = n.recipient_id
  where n.tenant_id = app.current_tenant_id()`;

interface NotificationRow {
  id: string;
  kind: string;
  status: string;
  recipient_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  about: string | null;
  attempts: number;
  last_error: string | null;
  sent_at: Date | null;
  created_at: Date;
}

const toNotification = (row: NotificationRow): Notification =>
  notificationSchema.parse({
    id: row.id,
    kind: row.kind,
    status: row.status,
    recipient: { id: row.recipient_id, name: row.recipient_name, email: row.recipient_email },
    about: row.about ?? '—',
    attempts: row.attempts,
    last_error: row.last_error,
    sent_at: iso(row.sent_at),
    created_at: iso(row.created_at),
  });

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly client: PoolClient) {}

  async list(query: NotificationListQuery): Promise<Notification[]> {
    const { rows } = await this.client.query<NotificationRow>(
      `${NOTIFICATION_SELECT} and ($1::text is null or n.status = $1)
       order by n.created_at desc, n.id desc limit $2`,
      [query.status ?? null, query.limit],
    );
    return rows.map(toNotification);
  }

  async get(id: string): Promise<Notification | null> {
    const { rows } = await this.client.query<NotificationRow>(`${NOTIFICATION_SELECT} and n.id = $1`, [id]);
    return rows[0] ? toNotification(rows[0]) : null;
  }

  async retry(id: string): Promise<void> {
    await this.client.query('select app.admin_retry_notification($1)', [id]);
  }
}

interface ToSendRow {
  id: string;
  kind: NotificationToSend['kind'];
  status: NotificationToSend['status'];
  recipient_email: string;
  recipient_name: string | null;
  tenant_name: string;
  invitation: { status: string; expires_at: string; access_until: string | null; sites: string[] } | null;
  contribution: { title: string; status: string; site_id: string; site_name: string } | null;
}

/** Worker side: dedicated SECURITY DEFINER functions, the worker role has no direct access to the tables. */
export class PostgresNotificationStore implements NotificationStore {
  constructor(private readonly pool: Pool) {}

  async get(id: string, tenantId: string): Promise<NotificationToSend | null> {
    const { rows } = await this.pool.query<{ notification: ToSendRow | null }>(
      'select app.worker_notification($1, $2) as notification',
      [id, tenantId],
    );
    const row = rows[0]?.notification;
    if (!row) return null;
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      recipientEmail: row.recipient_email,
      recipientName: row.recipient_name,
      tenantName: row.tenant_name,
      invitation: row.invitation
        ? {
            status: row.invitation.status,
            expiresAt: new Date(row.invitation.expires_at),
            accessUntil: row.invitation.access_until ? new Date(row.invitation.access_until) : null,
            sites: row.invitation.sites,
          }
        : null,
      contribution: row.contribution
        ? {
            title: row.contribution.title,
            status: row.contribution.status,
            siteId: row.contribution.site_id,
            siteName: row.contribution.site_name,
          }
        : null,
    };
  }

  async record(id: string, tenantId: string, error: string | null): Promise<boolean> {
    const { rows } = await this.pool.query<{ ok: boolean }>('select app.worker_record_notification($1, $2, $3) as ok', [
      id,
      tenantId,
      error,
    ]);
    return rows[0]?.ok === true;
  }
}
