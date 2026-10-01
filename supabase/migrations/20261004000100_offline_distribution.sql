-- =============================================================================
-- Sprint 4 — offline distribution (OFF-01 to OFF-04, ADMIN-02, ADR-015).
--
--   * publication.manifest_signature: Ed25519 signature of the canonical
--     manifest, written by the worker with the build, immutable afterwards;
--   * app.device: terminals declared by the SIS administration, enrolled once
--     with a one-time code (only its SHA-256 is stored) and the Ed25519 public
--     key generated on the terminal, then possibly revoked (final);
--   * app.distribution_generation: monotonic catalogue generation per SIS,
--     bumped whenever the set of published versions changes;
--   * app.device_sync_state / app.device_publication: what each terminal was
--     announced and what it reports as installed (receipts).
--
-- The API reads terminals for the administration under RLS (device:manage,
-- second factor). Terminals reach their data through the sync_* functions
-- only: offline:download, a terminal of the current SIS that is enrolled and
-- not revoked, publications that are published, signed and not sensitive.
-- The proof that the request comes from the terminal (signature with its key)
-- is checked by the API before any of these functions is called.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Offline download for the back-office roles as well (cahier des charges §3.1).
-- -----------------------------------------------------------------------------
insert into app.role_permission (role_id, permission_code)
select r.id, 'offline:download'
from app.role r
where r.tenant_id is null and r.code in ('SIS_ADMIN', 'PREVISION_EDITOR', 'PREVISION_VALIDATOR')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Signed manifests
-- -----------------------------------------------------------------------------
alter table app.publication add column manifest_signature jsonb;
alter table app.publication add constraint publication_manifest_signature_format check (
  manifest_signature is null or (
    jsonb_typeof(manifest_signature) = 'object'
    and manifest_signature - 'algorithm' - 'key_id' - 'signature' = '{}'::jsonb
    and manifest_signature ->> 'algorithm' = 'Ed25519'
    and manifest_signature ->> 'key_id' ~ '^[A-Za-z0-9._:-]{1,64}$'
    and manifest_signature ->> 'signature' ~ '^[A-Za-z0-9+/]{86}==$'
  )
);
comment on column app.publication.manifest_signature is
  'Detached Ed25519 signature of the canonical manifest (worker key), set with the build; null = not distributable offline.';

-- The signature is written in the same update as the build result, never afterwards.
create function app.tg_publication_signature_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.manifest_signature is distinct from old.manifest_signature
     and not (old.status = 'building' and new.status = 'ready') then
    raise exception 'PUBLICATION_IMMUTABLE: the manifest signature is written with the build' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger publication_signature_guard before update on app.publication
for each row execute function app.tg_publication_signature_guard();

-- Same fenced entry point as before, plus the signature (deploy with the worker).
drop function app.worker_complete_publication(uuid, jsonb, jsonb, text, text, text, uuid, integer);

create function app.worker_complete_publication(
  p_publication_id uuid, p_payload jsonb, p_manifest jsonb, p_manifest_hash text, p_template_version text,
  p_pdf_storage_key text, p_manifest_signature jsonb, p_job_id uuid, p_attempt integer
) returns text
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_publication app.publication;
  v_pdf_hash text;
begin
  if not app.lock_publication_job(p_publication_id, p_job_id, p_attempt) then return null; end if;
  -- Bind the immutable storage object to the PDF listed in the manifest.
  select f ->> 'sha256' into v_pdf_hash
  from jsonb_array_elements(p_manifest -> 'files') f where f ->> 'path' = 'etare.pdf';
  if (v_pdf_hash is null) <> (p_pdf_storage_key is null) or
     (v_pdf_hash is not null and (v_pdf_hash !~ '^[a-f0-9]{64}$' or p_pdf_storage_key <>
       'tenants/' || (select tenant_id::text from app.publication where id = p_publication_id) ||
       '/publications/' || p_publication_id::text || '/etare-' || v_pdf_hash || '.pdf')) then
    raise exception 'PDF_STORAGE_KEY_MISMATCH' using errcode = '23514';
  end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);

  update app.publication
  set status = 'ready', payload = p_payload, manifest = p_manifest, manifest_hash = p_manifest_hash,
      template_version = p_template_version, pdf_storage_key = p_pdf_storage_key,
      manifest_signature = p_manifest_signature, ready_at = now()
  where id = p_publication_id and status = 'building'
  returning * into v_publication;
  if not found then
    return null;
  end if;

  -- Serialized per site with the numbering of new publications.
  perform pg_advisory_xact_lock(hashtextextended('app.publication:' || v_publication.site_id::text, 0));
  if exists (
    select 1 from app.publication p
    where p.site_id = v_publication.site_id and p.id <> v_publication.id
      and p.status in ('published', 'superseded', 'withdrawn')
      and p.publication_number > v_publication.publication_number
  ) then
    -- An obsolete build never replaces a newer publication.
    update app.publication set status = 'superseded', superseded_at = now() where id = v_publication.id;
    return 'superseded';
  end if;

  update app.publication set status = 'superseded', superseded_at = now()
  where site_id = v_publication.site_id and status = 'published' and id <> v_publication.id;
  update app.publication
  set status = 'published', published_at = now(), published_by = v_publication.requested_by
  where id = v_publication.id;
  return 'published';
end
$$;

grant execute on function
  app.worker_complete_publication(uuid, jsonb, jsonb, text, text, text, jsonb, uuid, integer)
to etare_worker;

-- -----------------------------------------------------------------------------
-- Catalogue generations: one monotonic counter per SIS
-- -----------------------------------------------------------------------------
create table app.distribution_generation (
  tenant_id uuid primary key references app.tenant (id),
  generation bigint not null default 0 check (generation >= 0),
  changed_at timestamptz not null default now()
);
comment on table app.distribution_generation is
  'Catalogue generation of a SIS: increases whenever a version becomes or stops being published (architecture §11).';

insert into app.distribution_generation (tenant_id, generation) select id, 1 from app.tenant;

create function app.tg_publication_distribution_generation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.status = 'published') <> (new.status = 'published') then
    insert into app.distribution_generation as g (tenant_id, generation, changed_at)
    values (new.tenant_id, 1, now())
    on conflict (tenant_id) do update set generation = g.generation + 1, changed_at = now();
  end if;
  return null;
end
$$;
create trigger publication_distribution_generation after update of status on app.publication
for each row execute function app.tg_publication_distribution_generation();

-- -----------------------------------------------------------------------------
-- Terminals
-- -----------------------------------------------------------------------------
create table app.device (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  name text not null check (length(btrim(name)) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  platform text check (platform in ('android', 'ios')),
  -- Raw Ed25519 public key (32 bytes, base64), generated on the terminal.
  public_key text check (public_key ~ '^[A-Za-z0-9+/]{43}=$'),
  enrollment_code_hash text check (enrollment_code_hash ~ '^[0-9a-f]{64}$'),
  enrollment_expires_at timestamptz,
  enrolled_at timestamptz,
  enrolled_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revocation_reason text check (length(revocation_reason) between 3 and 500),
  created_by uuid not null default app.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, id),
  constraint device_pending_state check (
    status <> 'pending' or (enrollment_code_hash is not null and enrollment_expires_at is not null and public_key is null)
  ),
  constraint device_active_state check (
    status <> 'active' or (public_key is not null and platform is not null and enrolled_at is not null
                           and enrolled_by is not null and enrollment_code_hash is null)
  ),
  constraint device_revoked_state check (
    status <> 'revoked' or (revoked_at is not null and revoked_by is not null and revocation_reason is not null
                            and enrollment_code_hash is null)
  )
);
comment on table app.device is
  'Terminal of a SIS (ADMIN-02): enrolled once with a one-time code and its own Ed25519 key, revocation is final (OFF-04).';
create unique index device_public_key_uq on app.device (public_key) where public_key is not null;
create unique index device_name_uq on app.device (tenant_id, lower(name)) where status <> 'revoked';
create index device_tenant_idx on app.device (tenant_id, status);

call app.install_tenant_table_triggers('app.device');

-- Lifecycle: pending -> active | revoked, active -> revoked. Identity and enrollment are final.
create function app.tg_device_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'terminals are never deleted (revoke them)' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('active', 'revoked'))
    or (old.status = 'active' and new.status = 'revoked')
  ) then
    raise exception 'invalid terminal transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  if old.status <> 'pending' and (new.public_key, new.platform, new.enrolled_at, new.enrolled_by)
     is distinct from (old.public_key, old.platform, old.enrolled_at, old.enrolled_by) then
    raise exception 'the enrollment of a terminal is final' using errcode = '23514';
  end if;
  if old.status = 'revoked' and to_jsonb(new) - array['updated_at', 'row_version']
     is distinct from to_jsonb(old) - array['updated_at', 'row_version'] then
    raise exception 'a revoked terminal never changes' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger device_guard before update or delete on app.device
for each row execute function app.tg_device_guard();

call app.install_audit_trigger('app.device', array['enrollment_code_hash']);

-- What the terminal was announced and what it installed (not audited: updated at every contact).
create table app.device_sync_state (
  device_id uuid primary key,
  tenant_id uuid not null,
  app_version text check (app_version ~ '^[0-9A-Za-z.+-]{1,32}$'),
  last_user_id uuid,
  last_seen_at timestamptz,
  catalog_generation bigint check (catalog_generation >= 0),
  catalog_at timestamptz,
  installed_generation bigint check (installed_generation >= 0),
  last_sync_at timestamptz,
  last_status text check (last_status in ('installed', 'partial', 'error')),
  last_error_code text check (last_error_code ~ '^[A-Z0-9_]{1,64}$'),
  foreign key (tenant_id, device_id) references app.device (tenant_id, id)
);
comment on table app.device_sync_state is 'Last contact, announced catalogue and last installation receipt of a terminal.';

create table app.device_publication (
  device_id uuid not null,
  tenant_id uuid not null,
  site_id uuid not null,
  publication_id uuid not null,
  installed_at timestamptz not null default now(),
  primary key (device_id, site_id),
  foreign key (tenant_id, device_id) references app.device (tenant_id, id),
  foreign key (tenant_id, site_id, publication_id) references app.publication (tenant_id, site_id, id)
);
comment on table app.device_publication is
  'Publications reported as active on a terminal: finds the terminals still holding a given version.';
create index device_publication_publication_idx on app.device_publication (publication_id);

-- -----------------------------------------------------------------------------
-- Grants and RLS: the administration reads; every write goes through functions.
-- -----------------------------------------------------------------------------
alter table app.device enable row level security;
alter table app.device_sync_state enable row level security;
alter table app.device_publication enable row level security;
alter table app.distribution_generation enable row level security;

grant select on app.device, app.device_sync_state, app.device_publication, app.distribution_generation to etare_api;

create policy device_select on app.device for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('device:manage')));
create policy device_sync_state_select on app.device_sync_state for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('device:manage')));
create policy device_publication_select on app.device_publication for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('device:manage')));
create policy distribution_generation_select on app.distribution_generation for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('device:manage')));

-- -----------------------------------------------------------------------------
-- Administration functions (device:manage, second factor through has_permission)
-- -----------------------------------------------------------------------------
create function app.require_device_manager() returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if app.current_tenant_id() is null or not app.has_permission('device:manage') then
    raise exception 'device:manage required' using errcode = '42501';
  end if;
  return app.current_tenant_id();
end
$$;

create function app.admin_create_device(p_name text, p_code_hash text, p_expires_at timestamptz) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_device_manager();
  v_id uuid;
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'invalid enrollment expiry' using errcode = '22023';
  end if;
  insert into app.device (tenant_id, name, enrollment_code_hash, enrollment_expires_at, created_by)
  values (v_tenant, btrim(p_name), p_code_hash, p_expires_at, app.current_user_id())
  returning id into v_id;
  return v_id;
end
$$;

create function app.admin_renew_device_code(
  p_device_id uuid, p_expected_version integer, p_code_hash text, p_expires_at timestamptz
) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_device_manager();
  v_device app.device;
  v_version integer;
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'invalid enrollment expiry' using errcode = '22023';
  end if;
  select * into v_device from app.device d where d.id = p_device_id and d.tenant_id = v_tenant for update;
  if not found then raise exception 'terminal not found' using errcode = 'ETD04'; end if;
  if v_device.row_version <> p_expected_version then raise exception 'stale terminal' using errcode = 'ETD12'; end if;
  if v_device.status <> 'pending' then
    raise exception 'only a terminal waiting for its enrollment gets a new code' using errcode = 'ETD09';
  end if;
  update app.device set enrollment_code_hash = p_code_hash, enrollment_expires_at = p_expires_at
  where id = p_device_id
  returning row_version into v_version;
  return v_version;
end
$$;

create function app.admin_revoke_device(p_device_id uuid, p_expected_version integer, p_reason text) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_device_manager();
  v_device app.device;
  v_version integer;
begin
  select * into v_device from app.device d where d.id = p_device_id and d.tenant_id = v_tenant for update;
  if not found then raise exception 'terminal not found' using errcode = 'ETD04'; end if;
  if v_device.row_version <> p_expected_version then raise exception 'stale terminal' using errcode = 'ETD12'; end if;
  if v_device.status = 'revoked' then raise exception 'terminal already revoked' using errcode = 'ETD09'; end if;
  update app.device
  set status = 'revoked', revoked_at = now(), revoked_by = app.current_user_id(),
      revocation_reason = btrim(p_reason), enrollment_code_hash = null
  where id = p_device_id
  returning row_version into v_version;
  return v_version;
end
$$;

-- -----------------------------------------------------------------------------
-- Terminal functions (offline:download)
-- -----------------------------------------------------------------------------
create function app.require_offline_download() returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if app.current_tenant_id() is null or not app.has_permission('offline:download') then
    raise exception 'offline:download required' using errcode = '42501';
  end if;
  return app.current_tenant_id();
end
$$;

-- Binds a pending terminal of the current SIS to the key generated on the device.
-- The code is single-use: the first enrollment consumes it.
create function app.enroll_device(p_code_hash text, p_public_key text, p_platform text, p_app_version text)
returns table (device_id uuid, device_name text, tenant_id uuid, tenant_name text)
language plpgsql volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_offline_download();
  v_device app.device;
begin
  update app.device d
  set status = 'active', public_key = p_public_key, platform = p_platform, enrolled_at = now(),
      enrolled_by = app.current_user_id(), enrollment_code_hash = null, enrollment_expires_at = null
  where d.tenant_id = v_tenant and d.status = 'pending'
    and d.enrollment_code_hash = p_code_hash and d.enrollment_expires_at > now()
  returning * into v_device;
  if not found then
    raise exception 'unknown, used or expired enrollment code' using errcode = 'ETENR';
  end if;
  insert into app.device_sync_state (device_id, tenant_id, app_version, last_user_id, last_seen_at)
  values (v_device.id, v_tenant, p_app_version, app.current_user_id(), now());
  return query select v_device.id, v_device.name, t.id, t.name from app.tenant t where t.id = v_tenant;
end
$$;

-- Status and key of a terminal of the current SIS, for the API to check the proof of a request.
create function app.sync_device(p_device_id uuid) returns table (status text, public_key text)
language plpgsql stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_offline_download();
begin
  return query select d.status, d.public_key from app.device d where d.id = p_device_id and d.tenant_id = v_tenant;
end
$$;

-- Enrolled, not revoked terminal of the current SIS (defence in depth: the API checked it first).
create function app.require_sync_device(p_device_id uuid) returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_offline_download();
  v_status text;
begin
  select d.status into v_status from app.device d where d.id = p_device_id and d.tenant_id = v_tenant;
  if v_status is null or v_status = 'pending' then
    raise exception 'DEVICE_NOT_ENROLLED' using errcode = 'ETDNE';
  end if;
  if v_status = 'revoked' then
    raise exception 'DEVICE_REVOKED' using errcode = 'ETDRV';
  end if;
  return v_tenant;
end
$$;

-- Publications a terminal may hold: published, signed, not sensitive, readable by the user.
create function app.distributable_publication(p_publication app.publication) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select p_publication.tenant_id = app.current_tenant_id()
     and p_publication.status = 'published'
     and p_publication.manifest_signature is not null
     and p_publication.sensitivity = 'normal'
     and (app.has_permission('publication:read') or app.has_permission('publication:read', p_publication.site_id))
$$;

-- Complete list of the distributable publications at the current generation, read in
-- one statement (one snapshot); records the contact of the terminal.
create function app.sync_catalog(p_device_id uuid, p_app_version text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_tenant_wide boolean := app.has_permission('publication:read');
  v_catalog jsonb;
begin
  select jsonb_build_object(
    'generation', coalesce((select g.generation from app.distribution_generation g where g.tenant_id = v_tenant), 0),
    'tenant_name', (select t.name from app.tenant t where t.id = v_tenant),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'site_id', p.site_id,
        'publication_id', p.id,
        'publication_number', p.publication_number,
        'manifest_hash', p.manifest_hash,
        'published_at', p.published_at,
        'size_bytes', coalesce((
          select sum((f ->> 'size_bytes')::bigint) from jsonb_array_elements(p.manifest -> 'files') f
          where (f ->> 'required')::boolean), 0),
        'etare_number', s.etare_number,
        'site_name', s.name
      ) order by lower(s.name), p.id)
      from app.publication p
      join app.site s on s.tenant_id = p.tenant_id and s.id = p.site_id
      where p.tenant_id = v_tenant and p.status = 'published' and p.manifest_signature is not null
        and p.sensitivity = 'normal'
        and (v_tenant_wide or app.has_permission('publication:read', p.site_id))
    ), '[]'::jsonb)
  ) into v_catalog;

  insert into app.device_sync_state as s (device_id, tenant_id, app_version, last_user_id, last_seen_at,
                                           catalog_generation, catalog_at)
  values (p_device_id, v_tenant, p_app_version, app.current_user_id(), now(), (v_catalog ->> 'generation')::bigint, now())
  on conflict (device_id) do update
  set app_version = coalesce(excluded.app_version, s.app_version), last_user_id = excluded.last_user_id,
      last_seen_at = excluded.last_seen_at, catalog_generation = excluded.catalog_generation,
      catalog_at = excluded.catalog_at;
  return v_catalog;
end
$$;

-- Signed manifest and data of one distributable publication.
create function app.sync_package(p_device_id uuid, p_publication_id uuid)
returns table (manifest jsonb, manifest_hash text, manifest_signature jsonb, payload jsonb)
language plpgsql stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform app.require_sync_device(p_device_id);
  return query
  select p.manifest, p.manifest_hash, p.manifest_signature, p.payload
  from app.publication p
  where p.id = p_publication_id and app.distributable_publication(p);
end
$$;

-- Storage keys of the requested files of a distributable publication, by hash. Only files
-- listed in its manifest: checked assets referenced by its payload, or its ETARE PDF.
create function app.sync_package_files(p_device_id uuid, p_publication_id uuid, p_sha256 text[])
returns table (sha256 text, storage_key text)
language plpgsql stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_publication app.publication;
begin
  perform app.require_sync_device(p_device_id);
  select * into v_publication from app.publication p where p.id = p_publication_id;
  if not found or not app.distributable_publication(v_publication) then
    return;
  end if;
  return query
  with files as (
    select distinct f ->> 'sha256' as sha256, f ->> 'path' as path
    from jsonb_array_elements(v_publication.manifest -> 'files') f
    where f ->> 'sha256' = any (p_sha256) and f ->> 'path' <> v_publication.manifest ->> 'data_file'
  ),
  referenced as (
    select distinct x ->> 'id' as id, x ->> 'sha256' as sha256
    from jsonb_path_query(v_publication.payload, '$.**.asset') x
    where jsonb_typeof(x) = 'object' and x ->> 'id' ~ '^[0-9a-f-]{36}$'
  )
  select files.sha256,
         coalesce(
           (select a.storage_key from referenced r
            join app.asset a on a.id = r.id::uuid and a.sha256 = r.sha256
            where r.sha256 = files.sha256 and a.tenant_id = v_publication.tenant_id and a.scan_status = 'clean'
            limit 1),
           case when files.path = 'etare.pdf' then coalesce(v_publication.pdf_storage_key,
             'tenants/' || v_publication.tenant_id::text || '/publications/' || v_publication.id::text || '/etare.pdf') end
         )
  from files;
end
$$;

-- Installation receipt: the publications active on the terminal and the outcome.
create function app.sync_receipt(
  p_device_id uuid, p_generation bigint, p_status text, p_error_code text, p_installed uuid[]
) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_current bigint;
  v_count integer;
begin
  if p_status not in ('installed', 'partial', 'error') then
    raise exception 'invalid receipt status' using errcode = '22023';
  end if;
  select coalesce(max(g.generation), 0) into v_current from app.distribution_generation g where g.tenant_id = v_tenant;

  delete from app.device_publication where device_id = p_device_id;
  insert into app.device_publication (device_id, tenant_id, site_id, publication_id)
  select distinct on (p.site_id) p_device_id, v_tenant, p.site_id, p.id
  from app.publication p
  where p.id = any (coalesce(p_installed, '{}')) and p.tenant_id = v_tenant
    and p.status in ('published', 'superseded', 'withdrawn')
  order by p.site_id, p.publication_number desc;
  get diagnostics v_count = row_count;

  insert into app.device_sync_state as s (device_id, tenant_id, last_user_id, last_seen_at, last_sync_at,
                                           last_status, last_error_code, installed_generation)
  values (p_device_id, v_tenant, app.current_user_id(), now(), now(), p_status, p_error_code,
          case when p_status = 'installed' then least(p_generation, v_current) end)
  on conflict (device_id) do update
  set last_user_id = excluded.last_user_id, last_seen_at = excluded.last_seen_at,
      last_sync_at = excluded.last_sync_at, last_status = excluded.last_status,
      last_error_code = excluded.last_error_code,
      installed_generation = case when p_status = 'installed'
                                  then greatest(coalesce(s.installed_generation, 0), excluded.installed_generation)
                                  else s.installed_generation end;
  return v_count;
end
$$;

grant execute on function
  app.admin_create_device(text, text, timestamptz),
  app.admin_renew_device_code(uuid, integer, text, timestamptz),
  app.admin_revoke_device(uuid, integer, text),
  app.enroll_device(text, text, text, text),
  app.sync_device(uuid),
  app.sync_catalog(uuid, text),
  app.sync_package(uuid, uuid),
  app.sync_package_files(uuid, uuid, text[]),
  app.sync_receipt(uuid, bigint, text, text, uuid[])
to etare_api;

-- Helper and trigger functions remain private; only the entry points above are granted.
revoke all on all routines in schema app from public;
