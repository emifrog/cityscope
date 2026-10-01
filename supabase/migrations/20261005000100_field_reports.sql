-- =============================================================================
-- Sprint 5 — field reports (OPS-04, ADR-017).
--
--   * app.field_report: a discrepancy observed in the field by an agent, on the
--     published version installed on an enrolled terminal. It is a proposal
--     for the Prévision service, never a change of the published version.
--     Created once per (SIS, terminal, client identifier): a replay returns
--     the same report, a different content under the same identifier is
--     refused. Instructed by the Prévision (field_report:review): taken in
--     charge, linked to the working revision that corrects it, then resolved
--     or rejected with a documented decision (final).
--   * app.field_report_photo: photos of a report, files of the controlled
--     upload chain (quarantine, verification by the worker).
--
-- Terminals reach reports through the sync_*report* functions only, after the
-- API has checked the signature of the terminal (ADR-015). The Prévision reads
-- and instructs them under RLS.
-- =============================================================================

insert into app.permission (code, description, requires_aal2) values
  ('field_report:review', 'Instruire les signalements terrain', false);

insert into app.role_permission (role_id, permission_code)
select r.id, 'field_report:review'
from app.role r
where r.tenant_id is null and r.code in ('SIS_ADMIN', 'PREVISION_EDITOR', 'PREVISION_VALIDATOR')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Reports
-- -----------------------------------------------------------------------------
create table app.field_report (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  device_id uuid not null,
  client_report_id uuid not null,
  reporter_id uuid not null references app.user_account (id),
  publication_id uuid not null,
  category text not null check (category in ('access', 'water', 'risk', 'contact', 'plan', 'other')),
  severity text not null check (severity in ('info', 'important', 'urgent')),
  description text not null check (length(btrim(description)) between 1 and 2000),
  item_type text check (item_type in ('object', 'risk', 'zone')),
  item_id uuid,
  plan_revision_id uuid,
  plan_x double precision,
  plan_y double precision,
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'new' check (status in ('new', 'triaged', 'resolved', 'rejected')),
  assigned_to uuid references app.user_account (id),
  decision_comment text check (decision_comment is null or length(btrim(decision_comment)) between 1 and 2000),
  decided_by uuid references app.user_account (id),
  decided_at timestamptz,
  resolution_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  unique (tenant_id, device_id, client_report_id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  foreign key (tenant_id, device_id) references app.device (tenant_id, id),
  foreign key (tenant_id, site_id, publication_id) references app.publication (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, resolution_revision_id) references app.etare_revision (tenant_id, site_id, id),
  check ((item_type is null) = (item_id is null)),
  check ((plan_revision_id is null) = (plan_x is null) and (plan_x is null) = (plan_y is null)),
  check (plan_x is null or (plan_x >= 0 and plan_y >= 0)),
  check ((status in ('resolved', 'rejected')) = (decided_at is not null)),
  check (status not in ('resolved', 'rejected') or (decision_comment is not null and decided_by is not null))
);
comment on table app.field_report is 'Discrepancy reported from the field on a published version (OPS-04): a proposal instructed by the Prévision, never a change of the publication.';
create index field_report_open_idx on app.field_report (tenant_id, received_at desc) where status in ('new', 'triaged');
create index field_report_site_idx on app.field_report (site_id, received_at desc);
create index field_report_revision_idx on app.field_report (resolution_revision_id) where resolution_revision_id is not null;

create table app.field_report_photo (
  report_id uuid not null,
  asset_id uuid not null unique,
  tenant_id uuid not null,
  site_id uuid not null,
  sort_order smallint not null check (sort_order between 0 and 4),
  primary key (report_id, asset_id),
  unique (report_id, sort_order),
  foreign key (tenant_id, site_id, report_id) references app.field_report (tenant_id, site_id, id),
  -- Deferred: the link is written before the file, so that the file is never taken for working data.
  foreign key (tenant_id, asset_id) references app.asset (tenant_id, id) deferrable initially deferred
);
comment on table app.field_report_photo is 'Photos of a field report: checked files of the controlled upload chain.';

-- The observation never changes; the instruction moves forward only and ends
-- with a documented decision.
create function app.tg_field_report_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'field reports are never deleted' using errcode = '42501';
  end if;
  if (new.site_id, new.device_id, new.client_report_id, new.reporter_id, new.publication_id, new.category,
      new.severity, new.description, new.item_type, new.item_id, new.plan_revision_id, new.plan_x, new.plan_y,
      new.observed_at, new.received_at, new.content_hash)
     is distinct from
     (old.site_id, old.device_id, old.client_report_id, old.reporter_id, old.publication_id, old.category,
      old.severity, old.description, old.item_type, old.item_id, old.plan_revision_id, old.plan_x, old.plan_y,
      old.observed_at, old.received_at, old.content_hash) then
    raise exception 'an observation from the field is never modified' using errcode = '23514';
  end if;
  if old.status in ('resolved', 'rejected') then
    raise exception 'FIELD_REPORT_CLOSED: a decided report is final' using errcode = '23514';
  end if;
  if new.status = 'new' and old.status <> 'new' then
    raise exception 'a report taken in charge does not go back to new' using errcode = '23514';
  end if;
  if new.status in ('resolved', 'rejected') then
    new.decided_by := app.current_user_id();
    new.decided_at := now();
  else
    new.decided_by := null;
    new.decided_at := null;
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null
     and not exists (select 1 from app.membership m
                     where m.user_id = new.assigned_to and m.tenant_id = new.tenant_id and m.status = 'active') then
    raise exception 'FIELD_REPORT_ASSIGNEE: assigned to an active member of the SIS only' using errcode = '23514';
  end if;
  if new.resolution_revision_id is distinct from old.resolution_revision_id and new.resolution_revision_id is not null
     and not exists (select 1 from app.etare_revision r
                     where r.id = new.resolution_revision_id and r.status = 'draft') then
    raise exception 'FIELD_REPORT_REVISION: a report is integrated into a draft revision' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger field_report_guard before update or delete on app.field_report
for each row execute function app.tg_field_report_guard();

call app.install_tenant_table_triggers('app.field_report');
call app.install_audit_trigger('app.field_report');

alter table app.field_report enable row level security;
alter table app.field_report_photo enable row level security;
grant select on app.field_report, app.field_report_photo to etare_api;
grant update (status, assigned_to, decision_comment, resolution_revision_id) on app.field_report to etare_api;

-- The Prévision instructs the reports of its sites; an agent sees the reports
-- they made (feedback after synchronization).
create policy field_report_select on app.field_report for select to etare_api using (
  tenant_id = (select app.current_tenant_id())
  and ((select app.has_permission('field_report:review')) or app.has_permission('field_report:review', site_id)
       or reporter_id = (select app.current_user_id()))
);
create policy field_report_update on app.field_report for update to etare_api
  using (tenant_id = (select app.current_tenant_id())
         and ((select app.has_permission('field_report:review')) or app.has_permission('field_report:review', site_id)))
  with check (tenant_id = (select app.current_tenant_id())
              and ((select app.has_permission('field_report:review')) or app.has_permission('field_report:review', site_id)));
create policy field_report_photo_select on app.field_report_photo for select to etare_api using (
  exists (select 1 from app.field_report r where r.id = report_id)
);

-- A photo of a report is not working data: its sender does not become a
-- contributor of the next revision (separation of duties, ADR-013). Only the
-- report functions can write app.field_report_photo, so this cannot be forged.
create or replace function app.tg_record_site_edit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  -- Migrations and seeds have no verified actor: they are not authorship.
  if app.current_user_id() is null or v_site is null then
    return null;
  end if;
  -- System-maintained columns (e.g. the active publication pointer set when a
  -- validator publishes) are not an edit of the working data.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['updated_at', 'row_version', 'active_publication_id'])
       = (to_jsonb(old) - array['updated_at', 'row_version', 'active_publication_id']) then
    return null;
  end if;
  if tg_table_name = 'asset' and exists (select 1 from app.field_report_photo ph where ph.asset_id = new.id) then
    return null;
  end if;
  insert into app.site_edit (tenant_id, site_id, user_id)
  values (new.tenant_id, v_site, app.current_user_id())
  on conflict (site_id, user_id) do update set last_edited_at = clock_timestamp();
  return null;
end
$$;

-- -----------------------------------------------------------------------------
-- Terminal entry points (after the API checked the signature of the request)
-- -----------------------------------------------------------------------------

-- Canonical content of a report as received: what the acknowledgement hash covers.
create function app.field_report_content(p_report jsonb, p_photos jsonb) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'client_report_id', p_report ->> 'client_report_id',
    'site_id', p_report ->> 'site_id',
    'publication_id', p_report ->> 'publication_id',
    'category', p_report ->> 'category',
    'severity', p_report ->> 'severity',
    'description', p_report ->> 'description',
    'observed_at', to_char((p_report ->> 'observed_at')::timestamptz at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'item_type', p_report ->> 'item_type',
    'item_id', p_report ->> 'item_id',
    'plan_revision_id', p_report ->> 'plan_revision_id',
    'plan_x', (p_report ->> 'plan_x')::double precision,
    'plan_y', (p_report ->> 'plan_y')::double precision,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('sha256', f ->> 'sha256', 'size_bytes', (f ->> 'size_bytes')::bigint,
                                          'mime_type', f ->> 'mime_type') order by n)
      from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) with ordinality as photos(f, n)), '[]'::jsonb)
  )
$$;

-- Records a report sent by a terminal, once. p_photos carries the pending
-- assets prepared by the API (identifiers and storage keys of the SIS).
create function app.sync_submit_report(p_device_id uuid, p_report jsonb, p_photos jsonb)
returns table (report_id uuid, created boolean)
language plpgsql volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_site uuid := (p_report ->> 'site_id')::uuid;
  v_publication app.publication;
  v_snapshot jsonb;
  v_hash text;
  v_existing app.field_report;
  v_id uuid;
  v_photo jsonb;
  v_order integer := 0;
  v_asset uuid;
  v_plan jsonb;
begin
  if not (app.has_permission('field_report:create') or app.has_permission('field_report:create', v_site)) then
    raise exception 'field_report:create required' using errcode = '42501';
  end if;

  v_hash := encode(extensions.digest(convert_to(app.field_report_content(p_report, p_photos)::text, 'UTF8'), 'sha256'), 'hex');
  select * into v_existing from app.field_report r
  where r.tenant_id = v_tenant and r.device_id = p_device_id
    and r.client_report_id = (p_report ->> 'client_report_id')::uuid;
  if found then
    if v_existing.content_hash <> v_hash or v_existing.reporter_id is distinct from app.current_user_id() then
      raise exception 'FIELD_REPORT_REPLAY: another report already uses this identifier' using errcode = 'ETRPM';
    end if;
    return query select v_existing.id, false;
    return;
  end if;

  -- The version consulted: a signed publication of this site, readable by the agent.
  select * into v_publication from app.publication p
  where p.id = (p_report ->> 'publication_id')::uuid and p.tenant_id = v_tenant and p.site_id = v_site
    and p.status in ('published', 'superseded', 'withdrawn') and p.manifest_signature is not null;
  if not found or not (app.has_permission('publication:read') or app.has_permission('publication:read', v_site)) then
    raise exception 'FIELD_REPORT_PUBLICATION: unknown version for this site' using errcode = 'ETRPB';
  end if;
  select r.snapshot into v_snapshot from app.etare_revision r where r.id = v_publication.revision_id;

  -- The element and the position designate what the agent saw in that version.
  if p_report ->> 'item_id' is not null and not exists (
    select 1 from jsonb_array_elements(v_snapshot -> (case p_report ->> 'item_type'
                                                        when 'object' then 'objects' when 'risk' then 'risks'
                                                        when 'zone' then 'zones' end)) e
    where e ->> 'id' = p_report ->> 'item_id') then
    raise exception 'FIELD_REPORT_ITEM: element absent from the version consulted' using errcode = 'ETRPI';
  end if;
  if p_report ->> 'plan_revision_id' is not null then
    select pl -> 'background' into v_plan from jsonb_array_elements(v_snapshot -> 'plans') pl
    where pl -> 'background' ->> 'revision_id' = p_report ->> 'plan_revision_id';
    if v_plan is null or (p_report ->> 'plan_x')::double precision > (v_plan ->> 'width')::double precision
       or (p_report ->> 'plan_y')::double precision > (v_plan ->> 'height')::double precision then
      raise exception 'FIELD_REPORT_ITEM: position outside the plans of the version consulted' using errcode = 'ETRPI';
    end if;
  end if;
  if (p_report ->> 'observed_at')::timestamptz > now() + interval '5 minutes' then
    raise exception 'FIELD_REPORT_TIME: observation dated in the future' using errcode = 'ETRPI';
  end if;
  if jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
    raise exception 'FIELD_REPORT_PHOTOS: five photos at most' using errcode = 'ETRPI';
  end if;

  insert into app.field_report (tenant_id, site_id, device_id, client_report_id, reporter_id, publication_id,
                                category, severity, description, item_type, item_id, plan_revision_id, plan_x,
                                plan_y, observed_at, content_hash)
  values (v_tenant, v_site, p_device_id, (p_report ->> 'client_report_id')::uuid, app.current_user_id(),
          v_publication.id, p_report ->> 'category', p_report ->> 'severity', btrim(p_report ->> 'description'),
          p_report ->> 'item_type', (p_report ->> 'item_id')::uuid, (p_report ->> 'plan_revision_id')::uuid,
          (p_report ->> 'plan_x')::double precision, (p_report ->> 'plan_y')::double precision,
          (p_report ->> 'observed_at')::timestamptz, v_hash)
  returning id into v_id;

  for v_photo in select f from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) f loop
    v_asset := (v_photo ->> 'asset_id')::uuid;
    if v_photo ->> 'mime_type' not in ('image/png', 'image/jpeg', 'image/webp')
       or (v_photo ->> 'size_bytes')::bigint > 15 * 1024 * 1024
       or v_photo ->> 'storage_key' not like 'tenants/' || v_tenant::text || '/assets/' || v_asset::text || '/%'
       or v_photo ->> 'quarantine_key' not like 'tenants/' || v_tenant::text || '/quarantine/' || v_asset::text || '/%' then
      raise exception 'FIELD_REPORT_PHOTOS: a photo is an image of 15 MB at most' using errcode = 'ETRPI';
    end if;
    -- The link first: the authorship trigger of app.asset then sees a report photo.
    insert into app.field_report_photo (report_id, asset_id, tenant_id, site_id, sort_order)
    values (v_id, v_asset, v_tenant, v_site, v_order);
    insert into app.asset (id, tenant_id, site_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256)
    values (v_asset, v_tenant, v_site, v_photo ->> 'storage_key', v_photo ->> 'quarantine_key',
            v_photo ->> 'filename', v_photo ->> 'mime_type', (v_photo ->> 'size_bytes')::bigint, v_photo ->> 'sha256');
    v_order := v_order + 1;
  end loop;

  return query select v_id, true;
end
$$;

-- Photos of a report of this terminal and this agent, with their state: the
-- API issues upload URLs for those still waiting for their file.
create function app.sync_report_photos(p_device_id uuid, p_report_id uuid)
returns table (asset_id uuid, quarantine_key text, mime_type text, sha256 text, scan_status text)
language plpgsql stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
begin
  return query
  select a.id, a.quarantine_key, a.mime_type, a.sha256, a.scan_status
  from app.field_report r
  join app.field_report_photo ph on ph.report_id = r.id
  join app.asset a on a.id = ph.asset_id
  where r.id = p_report_id and r.tenant_id = v_tenant and r.device_id = p_device_id
    and r.reporter_id = app.current_user_id()
  order by ph.sort_order;
end
$$;

-- The terminal has sent the files: plan their verification (idempotent).
create function app.sync_report_uploaded(p_device_id uuid, p_report_id uuid) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_asset uuid;
  v_count integer := 0;
begin
  if not exists (select 1 from app.field_report r
                 where r.id = p_report_id and r.tenant_id = v_tenant and r.device_id = p_device_id
                   and r.reporter_id = app.current_user_id()) then
    raise exception 'FIELD_REPORT_UNKNOWN' using errcode = 'ETRPU';
  end if;
  for v_asset in
    select a.id from app.field_report_photo ph join app.asset a on a.id = ph.asset_id
    where ph.report_id = p_report_id and a.scan_status = 'pending'
  loop
    perform app.enqueue_job('asset.verify', jsonb_build_object('asset_id', v_asset), 'asset.verify:' || v_asset::text);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- What became of the reports this agent sent from this terminal (feedback).
create function app.sync_reports(p_device_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'report_id', r.id,
             'client_report_id', r.client_report_id,
             'status', r.status,
             'decision_comment', r.decision_comment,
             'decided_at', r.decided_at,
             'received_at', r.received_at,
             'photos', (select jsonb_build_object(
                                 'pending', count(*) filter (where a.scan_status = 'pending'),
                                 'clean', count(*) filter (where a.scan_status = 'clean'),
                                 'rejected', count(*) filter (where a.scan_status = 'rejected'))
                        from app.field_report_photo ph join app.asset a on a.id = ph.asset_id
                        where ph.report_id = r.id),
             'resolution', case when r.resolution_revision_id is null then null else (
               select jsonb_build_object(
                        'revision_no', rev.revision_no,
                        'publication_number', (select max(p.publication_number) from app.publication p
                                               where p.revision_id = rev.id
                                                 and p.status in ('published', 'superseded')))
               from app.etare_revision rev where rev.id = r.resolution_revision_id) end)
           order by r.received_at desc)
    from app.field_report r
    where r.tenant_id = v_tenant and r.device_id = p_device_id and r.reporter_id = app.current_user_id()
      and r.received_at > now() - interval '90 days'), '[]'::jsonb);
end
$$;

grant execute on function
  app.sync_submit_report(uuid, jsonb, jsonb),
  app.sync_report_photos(uuid, uuid),
  app.sync_report_uploaded(uuid, uuid),
  app.sync_reports(uuid)
to etare_api;

revoke all on all routines in schema app from public;
