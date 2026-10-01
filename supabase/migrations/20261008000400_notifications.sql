-- =============================================================================
-- Sprint 7 / R2 — useful notifications of the exploitant portal (POR-05, ADR-020).
--
--   * app.notification: an e-mail to send — an invitation to an existing
--     account, a question of the SIS on a proposal, the decision on a
--     proposal. Written in the transaction of the event (outbox) with its job:
--     the workflow never depends on the mail server.
--   * The worker sends it (notification.send), records each attempt and its
--     error; a dead job leaves it 'failed'. The SIS administration lists them
--     and sends one again (replay).
--   * Content stays minimal: no message body, decision motive, code nor
--     document in the e-mail — the link opens the portal, behind sign-in.
-- =============================================================================

create table app.notification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  kind text not null check (kind in ('portal_invitation', 'contribution_info_request', 'contribution_decision')),
  recipient_id uuid not null references app.user_account (id),
  invitation_id uuid references app.portal_invitation (id),
  contribution_id uuid references app.contribution (id),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or length(last_error) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  check ((kind = 'portal_invitation') = (invitation_id is not null)),
  check ((kind = 'portal_invitation') = (contribution_id is null)),
  check ((status = 'sent') = (sent_at is not null))
);
comment on table app.notification is
  'E-mail to send (POR-05), written with its event (outbox); sent by the worker, replayable by the SIS administration.';
create index notification_tenant_idx on app.notification (tenant_id, created_at desc);
call app.install_tenant_table_triggers('app.notification');

alter table app.notification enable row level security;
grant select on app.notification to etare_api;
create policy notification_select on app.notification for select to etare_api using (
  tenant_id = (select app.current_tenant_id()) and (select app.has_permission('member:manage'))
);

-- Records a notification and plans its sending, in the transaction of the event.
create function app.queue_notification(p_tenant uuid, p_kind text, p_recipient uuid, p_invitation uuid,
                                       p_contribution uuid) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app.notification (tenant_id, kind, recipient_id, invitation_id, contribution_id)
  values (p_tenant, p_kind, p_recipient, p_invitation, p_contribution)
  returning id into v_id;
  perform app.enqueue_job('notification.send', jsonb_build_object('notification_id', v_id),
                          'notification.send:' || v_id::text || ':0');
  return v_id;
end
$$;

-- A question of the SIS, then its decision, are sent to the author of the proposal.
create function app.tg_contribution_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'info_requested' and old.status <> 'info_requested' then
    perform app.queue_notification(new.tenant_id, 'contribution_info_request', new.author_id, null, new.id);
  elsif new.status in ('accepted', 'partially_accepted', 'rejected')
        and old.status not in ('accepted', 'partially_accepted', 'rejected') then
    perform app.queue_notification(new.tenant_id, 'contribution_decision', new.author_id, null, new.id);
  end if;
  return null;
end
$$;
create trigger contribution_notify after update of status on app.contribution
for each row execute function app.tg_contribution_notify();

-- An invitation to a person who already has an account (a new account receives
-- the account creation e-mail instead). Once per invitation.
create function app.notify_portal_invitation(p_invitation_id uuid) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_invitation app.portal_invitation;
begin
  if not app.has_permission('portal:invite') then
    raise exception 'portal:invite required' using errcode = '42501';
  end if;
  select i.* into v_invitation from app.portal_invitation i
  where i.id = p_invitation_id and i.tenant_id = app.current_tenant_id() and i.status = 'pending';
  if not found then
    raise exception 'PORTAL_INVITATION_UNKNOWN' using errcode = 'ETPIN';
  end if;
  return coalesce(
    (select n.id from app.notification n where n.invitation_id = v_invitation.id),
    app.queue_notification(v_invitation.tenant_id, 'portal_invitation', v_invitation.invitee_id, v_invitation.id, null));
end
$$;

-- Sends a notification again (lost or failed e-mail). Administration of the SIS only.
create function app.admin_retry_notification(p_notification_id uuid) returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_notification app.notification;
begin
  if not app.has_permission('member:manage') then
    raise exception 'member:manage required' using errcode = '42501';
  end if;
  select n.* into v_notification from app.notification n
  where n.id = p_notification_id and n.tenant_id = app.current_tenant_id()
  for update;
  if not found then
    raise exception 'NOTIFICATION_UNKNOWN' using errcode = 'ETNTN';
  end if;
  if v_notification.status = 'pending' then
    raise exception 'NOTIFICATION_PENDING: already waiting to be sent' using errcode = 'ETNTP';
  end if;
  update app.notification set status = 'pending', sent_at = null where id = v_notification.id;
  perform app.enqueue_job('notification.send', jsonb_build_object('notification_id', v_notification.id),
                          'notification.send:' || v_notification.id::text || ':' || v_notification.attempts::text);
end
$$;

-- -----------------------------------------------------------------------------
-- Worker side (etare_worker only)
-- -----------------------------------------------------------------------------

-- What the e-mail needs, and nothing more (no message body nor decision motive).
create function app.worker_notification(p_notification_id uuid, p_tenant uuid) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', n.id,
    'kind', n.kind,
    'status', n.status,
    'recipient_email', u.email::text,
    'recipient_name', u.display_name,
    'tenant_name', t.name,
    'invitation', case when n.invitation_id is null then null else (
      select jsonb_build_object(
               'status', i.status,
               'expires_at', i.expires_at,
               'access_until', i.access_until,
               'sites', coalesce((select jsonb_agg(s.name order by lower(s.name))
                                  from app.portal_invitation_site pis
                                  join app.site s on s.id = pis.site_id
                                  where pis.invitation_id = i.id), '[]'::jsonb))
      from app.portal_invitation i where i.id = n.invitation_id) end,
    'contribution', case when n.contribution_id is null then null else (
      select jsonb_build_object('title', c.title, 'status', c.status, 'site_id', c.site_id, 'site_name', s.name)
      from app.contribution c join app.site s on s.id = c.site_id where c.id = n.contribution_id) end)
  from app.notification n
  join app.user_account u on u.id = n.recipient_id
  join app.tenant t on t.id = n.tenant_id
  where n.id = p_notification_id and n.tenant_id = p_tenant
$$;

-- One attempt: sent (no error) or failed with its error (the job retries).
create function app.worker_record_notification(p_notification_id uuid, p_tenant uuid, p_error text)
returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  update app.notification
  set attempts = attempts + 1,
      status = case when p_error is null then 'sent' else status end,
      sent_at = case when p_error is null then now() else sent_at end,
      last_error = case when p_error is null then null else left(p_error, 300) end
  where id = p_notification_id and tenant_id = p_tenant and status = 'pending';
  return found;
end
$$;

-- A sending abandoned by the queue (attempts exhausted, permanent error) is failed.
create function app.fail_notification_on_dead_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.job_type = 'notification.send' then
    perform set_config('app.actor_type', 'worker', true);
    perform set_config('app.origin', 'worker', true);
    update app.notification n
    set status = 'failed', last_error = coalesce(n.last_error, left(coalesce(new.last_error_code, 'NOTIFICATION_JOB_DEAD'), 300))
    where n.tenant_id = new.tenant_id and n.id::text = new.payload ->> 'notification_id' and n.status = 'pending';
  end if;
  return new;
end
$$;
create trigger job_notification_terminal_failure after update of status on app.job
for each row when (new.status = 'dead' and old.status is distinct from new.status)
execute function app.fail_notification_on_dead_job();

grant execute on function
  app.notify_portal_invitation(uuid),
  app.admin_retry_notification(uuid)
to etare_api;
grant execute on function
  app.worker_notification(uuid, uuid),
  app.worker_record_notification(uuid, uuid, text)
to etare_worker;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
