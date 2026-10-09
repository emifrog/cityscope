-- =============================================================================
-- Reversibility export of a SIS (ADMIN-04, ADR-033)
--
--   * export:manage (second factor required): an administrator asks for the
--     export of every datum and file of the SIS; the worker builds it as ZIP
--     parts in the object storage; the administration downloads them through
--     short-lived signed URLs for 7 days; then the files are purged.
--   * app.export_run: one request, its state, its parts and every object
--     written (purged by the file maintenance). One export at a time per SIS.
--   * The worker reads the tables through app.worker_export_rows (whitelist,
--     tenant filter, secrets left out) and the files through
--     app.worker_export_files; every step is fenced by the running job.
--   * Audited: export.requested, export.ready, export.failed,
--     export.downloaded (each part), export.purged.
-- =============================================================================

insert into app.permission (code, description, requires_aal2) values
  ('export:manage', 'Demander et télécharger l''export de réversibilité du SIS', true);

insert into app.role_permission (role_id, permission_code)
select r.id, 'export:manage' from app.role r where r.code = 'SIS_ADMIN' and r.tenant_id is null
on conflict do nothing;

-- -----------------------------------------------------------------------------
create table app.export_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  status text not null default 'queued' check (status in ('queued', 'building', 'ready', 'failed', 'expired')),
  requested_by uuid not null references app.user_account (id),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz,
  -- [{index, kind: data|files|file, filename, storage_key, media_type, size_bytes, sha256}]
  parts jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  -- Every object written by the build, even an interrupted one (purge).
  storage_keys text[] not null default '{}',
  total_bytes bigint check (total_bytes is null or total_bytes >= 0),
  file_count integer check (file_count is null or file_count >= 0),
  row_count integer check (row_count is null or row_count >= 0),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  error_detail text check (error_detail is null or length(error_detail) <= 500),
  files_removed_at timestamptz,
  check (status <> 'ready' or (finished_at is not null and expires_at is not null))
);
comment on table app.export_run is
  'Reversibility export of a SIS (ADMIN-04): requested by its administration, built by the worker, downloadable 7 days.';
create unique index export_run_pending_uq on app.export_run (tenant_id) where status in ('queued', 'building');
create index export_run_tenant_idx on app.export_run (tenant_id, requested_at desc);
-- No grant: reached through the functions below only.
alter table app.export_run enable row level security;

create function app.require_export_manager() returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if app.current_tenant_id() is null or not app.has_permission('export:manage') then
    raise exception 'export:manage required' using errcode = '42501';
  end if;
  return app.current_tenant_id();
end
$$;

create function app.export_run_json(p_run app.export_run) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_run.id,
    'status', p_run.status,
    'requested_by_name', (select coalesce(u.display_name, u.email::text) from app.user_account u where u.id = p_run.requested_by),
    'requested_at', p_run.requested_at,
    'started_at', p_run.started_at,
    'finished_at', p_run.finished_at,
    'expires_at', p_run.expires_at,
    'parts', (
      select coalesce(jsonb_agg(p - 'storage_key' order by (p ->> 'index')::int), '[]'::jsonb)
      from jsonb_array_elements(p_run.parts) p
    ),
    'total_bytes', p_run.total_bytes,
    'file_count', p_run.file_count,
    'row_count', p_run.row_count,
    'error_code', p_run.error_code,
    'error_detail', p_run.error_detail
  )
$$;

-- The exports of the SIS, newest first.
create function app.export_runs() returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.export_run_json(e) order by e.requested_at desc), '[]'::jsonb)
  from (select * from app.export_run e where e.tenant_id = app.require_export_manager()
        order by e.requested_at desc limit 20) e
$$;

-- Asks for an export: one at a time per SIS; the job carries the build.
create function app.request_export() returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_export_manager();
  v_run app.export_run;
begin
  if app.current_aal() <> 'aal2' then
    raise exception 'second factor required' using errcode = 'ETMFA';
  end if;
  insert into app.export_run (tenant_id, requested_by) values (v_tenant, app.current_user_id())
  returning * into v_run;
  perform app.enqueue_job('export.build', jsonb_build_object('export_id', v_run.id), 'export.build:' || v_run.id::text);
  perform app.record_audit_event('export.requested', 'export', v_run.id, 'success', null, '{}'::jsonb);
  return app.export_run_json(v_run);
end
$$;

-- A part to download (audited): its key and its name, while the export is ready and not expired.
create function app.export_part(p_export uuid, p_index integer) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_export_manager();
  v_run app.export_run;
  v_part jsonb;
begin
  select * into v_run from app.export_run e where e.id = p_export and e.tenant_id = v_tenant;
  if not found then return null; end if;
  if v_run.status <> 'ready' or v_run.expires_at < now() or v_run.files_removed_at is not null then
    raise exception 'EXPORT_NOT_AVAILABLE' using errcode = 'ETEXP';
  end if;
  select p into v_part from jsonb_array_elements(v_run.parts) p where (p ->> 'index')::int = p_index;
  if v_part is null then return null; end if;
  perform app.record_audit_event('export.downloaded', 'export', v_run.id, 'success', null,
                                 jsonb_build_object('part', p_index, 'filename', v_part ->> 'filename'));
  return v_part;
end
$$;

-- -----------------------------------------------------------------------------
-- Worker side: fenced by the running job that carries the build.
-- -----------------------------------------------------------------------------
create function app.lock_export_job(p_export uuid, p_tenant uuid, p_job_id uuid, p_attempt integer)
returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_job app.job;
begin
  select * into v_job from app.job where id = p_job_id for update;
  if not found then return false; end if;
  return coalesce(v_job.status = 'running' and v_job.attempts = p_attempt
    and v_job.lease_expires_at > clock_timestamp()
    and v_job.job_type = 'export.build'
    and v_job.tenant_id = p_tenant
    and v_job.idempotency_key = 'export.build:' || p_export::text, false);
end
$$;

create function app.worker_start_export(p_export uuid, p_tenant uuid, p_job_id uuid, p_attempt integer)
returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_run app.export_run;
begin
  if not app.lock_export_job(p_export, p_tenant, p_job_id, p_attempt) then return null; end if;
  update app.export_run e
  set status = 'building', started_at = coalesce(e.started_at, now())
  where e.id = p_export and e.tenant_id = p_tenant and e.status in ('queued', 'building')
  returning * into v_run;
  if not found then return null; end if;
  return jsonb_build_object(
    'export_id', v_run.id,
    'tenant_id', v_run.tenant_id,
    'tenant_slug', (select t.slug from app.tenant t where t.id = p_tenant),
    'tenant_name', (select t.name from app.tenant t where t.id = p_tenant),
    'requested_at', v_run.requested_at,
    'requested_by', (select coalesce(u.display_name, u.email::text) from app.user_account u where u.id = v_run.requested_by)
  );
end
$$;

-- Tables exported, with the columns left out (secrets of the platform, never business data).
create function app.export_tables() returns table (table_name text, excluded text[])
language sql immutable
set search_path = ''
as $$
  values
    ('tenant', '{}'::text[]), ('membership', '{}'), ('role', '{}'), ('role_binding', '{}'),
    ('address', '{}'), ('site', '{}'), ('building', '{}'), ('level', '{}'), ('asset', '{quarantine_key}'),
    ('plan', '{}'), ('plan_revision', '{}'), ('zone', '{}'), ('object_type', '{}'), ('risk_type', '{}'),
    ('operational_object', '{}'), ('risk_occurrence', '{}'), ('hazardous_substance', '{}'),
    ('document', '{}'), ('document_version', '{}'), ('object_photo', '{}'),
    ('etare', '{}'), ('etare_revision', '{}'), ('etare_revision_contributor', '{}'), ('approval', '{}'),
    ('publication', '{}'), ('publication_signature', '{}'), ('site_classification', '{}'), ('contact', '{}'),
    ('external_identifier', '{}'), ('site_edit', '{}'), ('sector', '{}'), ('sector_commune', '{}'), ('sector_site', '{}'),
    ('device', '{enrollment_code_hash}'), ('device_sector', '{}'), ('device_sync_state', '{}'), ('device_publication', '{}'),
    ('device_basemap', '{}'), ('device_sync_event', '{}'), ('basemap_pack', '{}'), ('basemap_pack_signature', '{}'),
    ('distribution_generation', '{}'), ('field_report', '{}'), ('field_report_photo', '{}'),
    ('portal_invitation', '{token_hash}'), ('portal_invitation_site', '{}'), ('contribution', '{}'),
    ('contribution_message', '{}'), ('contribution_attachment', '{}'), ('notification', '{}'),
    ('sensitive_habilitation', '{}'), ('access_event', '{}'), ('audit_event', '{}')
$$;

-- Rows of a table of the SIS, by pages ordered by identifier; national catalogue rows included.
create function app.worker_export_rows(p_export uuid, p_tenant uuid, p_table text, p_offset integer, p_limit integer)
returns setof jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_excluded text[];
  v_order text;
begin
  if not exists (select 1 from app.export_run e where e.id = p_export and e.tenant_id = p_tenant and e.status = 'building') then
    raise exception 'EXPORT_NOT_BUILDING' using errcode = '42501';
  end if;
  select t.excluded into v_excluded from app.export_tables() t where t.table_name = p_table;
  if v_excluded is null then
    raise exception 'EXPORT_TABLE_UNKNOWN: %', p_table using errcode = '22023';
  end if;
  -- Pages ordered by the primary key: stable whatever the writes made meanwhile.
  select string_agg(quote_ident(a.attname), ', ' order by k.ordinality) into v_order
  from pg_index i
  join unnest(i.indkey) with ordinality as k(attnum, ordinality) on true
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = ('app.' || quote_ident(p_table))::regclass and i.indisprimary;
  if p_table = 'tenant' then
    return query select to_jsonb(t) from app.tenant t where t.id = p_tenant;
  elsif p_table = 'membership' then
    return query
      select (to_jsonb(m) || jsonb_build_object('email', u.email, 'display_name', u.display_name, 'account_status', u.status))
      from app.membership m join app.user_account u on u.id = m.user_id
      where m.tenant_id = p_tenant order by m.id limit p_limit offset p_offset;
  elsif p_table in ('role', 'object_type', 'risk_type') then
    return query execute format(
      'select to_jsonb(t) - $4 from app.%I t where t.tenant_id = $1 or t.tenant_id is null order by %s limit $2 offset $3',
      p_table, coalesce(v_order, 'ctid')) using p_tenant, p_limit, p_offset, v_excluded;
  else
    return query execute format(
      'select to_jsonb(t) - $4 from app.%I t where t.tenant_id = $1 order by %s limit $2 offset $3',
      p_table, coalesce(v_order, 'ctid')) using p_tenant, p_limit, p_offset, v_excluded;
  end if;
end
$$;

-- Files of the SIS: verified assets and the PDF of each publication that kept one.
create function app.worker_export_files(p_export uuid, p_tenant uuid)
returns table (kind text, storage_key text, filename text, media_type text, size_bytes bigint, sha256 text)
language sql stable
security definer
set search_path = ''
as $$
  select 'asset', a.storage_key, a.filename, a.mime_type, a.size_bytes, a.sha256
  from app.asset a
  where a.tenant_id = p_tenant and a.scan_status = 'clean'
    and exists (select 1 from app.export_run e where e.id = p_export and e.tenant_id = p_tenant and e.status = 'building')
  union all
  select 'publication', p.pdf_storage_key,
         'ETARE-' || coalesce(s.etare_number, s.id::text) || '-v' || p.publication_number || '.pdf',
         'application/pdf', null, null
  from app.publication p join app.site s on s.id = p.site_id
  where p.tenant_id = p_tenant and p.pdf_storage_key is not null
    and exists (select 1 from app.export_run e where e.id = p_export and e.tenant_id = p_tenant and e.status = 'building')
  order by 2
$$;

create function app.worker_record_export_object(p_export uuid, p_tenant uuid, p_key text) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  if p_key not like 'tenants/' || p_tenant::text || '/exports/' || p_export::text || '/%' then
    raise exception 'EXPORT_KEY_INVALID' using errcode = '23514';
  end if;
  update app.export_run e
  set storage_keys = array_append(array_remove(e.storage_keys, p_key), p_key)
  where e.id = p_export and e.tenant_id = p_tenant and e.status = 'building';
  return found;
end
$$;

create function app.worker_complete_export(
  p_export uuid, p_tenant uuid, p_parts jsonb, p_total_bytes bigint, p_file_count integer, p_row_count integer
) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform 1 from app.export_run e where e.id = p_export and e.tenant_id = p_tenant and e.status = 'building'
  for update;
  if not found then return false; end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  perform set_config('app.tenant_id', p_tenant::text, true);
  update app.export_run e
  set status = 'ready', finished_at = now(), expires_at = now() + interval '7 days', parts = p_parts,
      total_bytes = p_total_bytes, file_count = p_file_count, row_count = p_row_count,
      error_code = null, error_detail = null
  where e.id = p_export;
  perform app.record_audit_event('export.ready', 'export', p_export, 'success', null,
                                 jsonb_build_object('parts', jsonb_array_length(p_parts), 'total_bytes', p_total_bytes,
                                                    'file_count', p_file_count, 'row_count', p_row_count));
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

create function app.worker_fail_export(p_export uuid, p_tenant uuid, p_code text, p_detail text) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  perform set_config('app.tenant_id', p_tenant::text, true);
  update app.export_run e
  set status = 'failed', finished_at = now(), error_code = left(p_code, 64), error_detail = left(p_detail, 500)
  where e.id = p_export and e.tenant_id = p_tenant and e.status in ('queued', 'building');
  if not found then
    perform set_config('app.tenant_id', '', true);
    return false;
  end if;
  perform app.record_audit_event('export.failed', 'export', p_export, 'error', left(p_code, 64),
                                 jsonb_build_object('detail', left(p_detail, 500)));
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

-- A dead job leaves no export "building" forever.
create function app.fail_export_on_dead_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.job_type = 'export.build' then
    perform app.worker_fail_export((new.payload ->> 'export_id')::uuid, new.tenant_id,
                                   coalesce(new.last_error_code, 'EXPORT_JOB_DEAD'), 'Préparation interrompue.');
  end if;
  return new;
end
$$;
create trigger job_export_terminal_failure after update of status on app.job
for each row when (new.status = 'dead' and old.status is distinct from new.status)
execute function app.fail_export_on_dead_job();

-- Expired exports (7 days) and failed ones (a day later): their objects are removed, then recorded.
create function app.worker_exports_to_purge(p_limit integer)
returns table (export_id uuid, tenant_id uuid, storage_keys text[])
language sql stable
security definer
set search_path = ''
as $$
  select e.id, e.tenant_id, e.storage_keys
  from app.export_run e
  where e.files_removed_at is null and cardinality(e.storage_keys) > 0
    and ((e.status = 'ready' and e.expires_at < now())
         or (e.status = 'failed' and e.finished_at < now() - interval '1 day'))
  order by e.requested_at
  limit least(greatest(p_limit, 1), 100)
$$;

create function app.worker_mark_export_removed(p_export uuid) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_run app.export_run;
begin
  update app.export_run e
  set files_removed_at = now(), status = case when e.status = 'ready' then 'expired' else e.status end
  where e.id = p_export and e.files_removed_at is null
  returning * into v_run;
  if not found then return false; end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  perform set_config('app.tenant_id', v_run.tenant_id::text, true);
  perform app.record_audit_event('export.purged', 'export', v_run.id, 'success', null,
                                 jsonb_build_object('objects', cardinality(v_run.storage_keys)));
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function app.require_export_manager(), app.export_runs(), app.request_export(), app.export_part(uuid, integer)
to etare_api;
grant execute on function
  app.worker_start_export(uuid, uuid, uuid, integer),
  app.worker_export_rows(uuid, uuid, text, integer, integer),
  app.worker_export_files(uuid, uuid),
  app.worker_record_export_object(uuid, uuid, text),
  app.worker_complete_export(uuid, uuid, jsonb, bigint, integer, integer),
  app.worker_fail_export(uuid, uuid, text, text),
  app.worker_exports_to_purge(integer),
  app.worker_mark_export_removed(uuid)
to etare_worker;

revoke all on all routines in schema app from public;
