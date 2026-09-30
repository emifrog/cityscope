-- =============================================================================
-- Audit journal (append-only).
--
--   * Rows are written only by SECURITY DEFINER code: the generic row trigger
--     app.tg_audit_row() and app.record_audit_event(). Application roles have
--     no INSERT/UPDATE/DELETE privilege on the table, so they cannot forge
--     the actor or rewrite history.
--   * A trigger rejects UPDATE, DELETE and TRUNCATE for everyone, including the
--     table owner. Only a superuser disabling triggers could bypass it: exporting
--     the journal to a separate retention store is planned (architecture §20).
--   * Sensitive columns are redacted by the row trigger (trigger arguments) and
--     large payloads are never copied.
-- =============================================================================

create table app.audit_event (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  tenant_id uuid references app.tenant (id),
  actor_user_id uuid,
  actor_type text not null check (actor_type in ('user', 'system', 'integration', 'worker')),
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null,
  entity_id uuid,
  outcome text not null default 'success' check (outcome in ('success', 'denied', 'error')),
  reason text,
  before_data jsonb,
  after_data jsonb,
  origin text not null check (origin in ('web', 'mobile', 'api', 'integration', 'import', 'worker', 'db')),
  trace_id uuid,
  device_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);
comment on table app.audit_event is 'Append-only audit journal: who, what, when, before/after, origin.';

create index audit_event_tenant_time_idx on app.audit_event (tenant_id, occurred_at desc);
create index audit_event_entity_idx on app.audit_event (entity_type, entity_id, occurred_at desc);

create function app.tg_audit_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'app.audit_event is append-only (% refused)', tg_op using errcode = '42501';
end
$$;

create trigger audit_event_no_update_delete before update or delete on app.audit_event
for each row execute function app.tg_audit_append_only();
create trigger audit_event_no_truncate before truncate on app.audit_event
for each statement execute function app.tg_audit_append_only();

-- Generic row audit. TG_ARGV lists columns whose values must never be copied
-- into the journal (replaced by a marker).
create function app.tg_audit_row() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_column text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;
  v_row := coalesce(v_new, v_old);

  -- Ignore no-op updates.
  if tg_op = 'UPDATE' and (v_old - 'updated_at' - 'row_version') = (v_new - 'updated_at' - 'row_version') then
    return null;
  end if;

  foreach v_column in array coalesce(tg_argv, '{}'::text[]) loop
    if v_old ? v_column then
      v_old := jsonb_set(v_old, array[v_column], '"[redacted]"'::jsonb);
    end if;
    if v_new ? v_column then
      v_new := jsonb_set(v_new, array[v_column], '"[redacted]"'::jsonb);
    end if;
  end loop;

  insert into app.audit_event (
    tenant_id, actor_user_id, actor_type, action, entity_type, entity_id,
    before_data, after_data, origin, trace_id
  ) values (
    case when tg_table_name = 'tenant' then (v_row ->> 'id')::uuid else (v_row ->> 'tenant_id')::uuid end,
    app.current_user_id(),
    app.current_actor_type(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_old,
    v_new,
    app.current_origin(),
    app.current_trace_id()
  );
  return null;
end
$$;

-- Business-level events (access denied, export, sensitive view...), stamped with
-- the verified request context: the caller cannot choose the actor or tenant.
create function app.record_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_outcome text default 'success',
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language sql volatile
security definer
set search_path = ''
as $$
  insert into app.audit_event (
    tenant_id, actor_user_id, actor_type, action, entity_type, entity_id,
    outcome, reason, origin, trace_id, metadata
  ) values (
    app.current_tenant_id(), app.current_user_id(), app.current_actor_type(), p_action, p_entity_type, p_entity_id,
    p_outcome, p_reason, app.current_origin(), app.current_trace_id(), coalesce(p_metadata, '{}'::jsonb)
  )
  returning id
$$;

grant execute on function app.record_audit_event(text, text, uuid, text, text, jsonb) to etare_api, etare_worker;

-- Helper used by later migrations to attach the row audit trigger.
create procedure app.install_audit_trigger(p_table regclass, p_redacted_columns text[] default '{}')
language plpgsql
set search_path = ''
as $$
declare
  v_args text := '';
begin
  if cardinality(p_redacted_columns) > 0 then
    select string_agg(quote_literal(c), ', ') into v_args from unnest(p_redacted_columns) as c;
  end if;
  execute format(
    'create trigger audit_row after insert or update or delete on %s for each row execute function app.tg_audit_row(%s)',
    p_table, v_args
  );
end
$$;

call app.install_audit_trigger('app.tenant');
call app.install_audit_trigger('app.user_account');
call app.install_audit_trigger('app.membership');
call app.install_audit_trigger('app.role_binding');
call app.install_audit_trigger('app.role_permission');
call app.install_audit_trigger('app.platform_admin');

alter table app.audit_event enable row level security;
grant select on app.audit_event to etare_api;

create policy audit_event_select on app.audit_event for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('audit:read')));

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
