-- =============================================================================
-- Sprint 11 — CAR-01 à CAR-03: offline base maps of the tablets (DEC-02, ADR-024).
--
--   * One base map file (PMTiles) per sector of the SIS, prepared by the worker
--     from the configured source: general view up to zoom 14 over the sites of
--     the sector and a margin, detail up to zoom 18 around the distributed
--     sites. Style and pictograms travel with it (fonts are in the application).
--   * Versioned, signed by the publication key, split in parts for the
--     transfer; distributed to the terminals of the sector (or of the whole
--     SIS) apart from the ETARE publications, renewed every six months.
--   * The rights gate of the source lives in the application: no build, hence
--     no distribution, without a source whose offline rights are approved.
--   * A sensitive site never marks a detail area: it would point it out.
-- =============================================================================

create table app.basemap_pack (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  sector_id uuid not null,
  version integer not null check (version > 0),
  source_id text not null check (source_id ~ '^[a-z0-9-]{1,40}$'),
  status text not null default 'queued'
    check (status in ('queued', 'building', 'ready', 'failed', 'superseded')),
  -- Why it was prepared: first file, coverage moved, source changed, six-month renewal, request.
  reason text not null check (reason in ('initial', 'coverage', 'source', 'renewal', 'manual')),
  coverage_signature text check (coverage_signature is null or coverage_signature ~ '^[0-9a-f]{32}$'),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  built_at timestamptz,
  renew_after timestamptz,
  superseded_at timestamptz,
  manifest jsonb,
  manifest_hash text check (manifest_hash is null or manifest_hash ~ '^[0-9a-f]{64}$'),
  manifest_signature jsonb,
  -- Every part of every file of a ready pack: [{"sha256", "size_bytes", "storage_key"}].
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  -- Every object written by the build, even an interrupted one (cleanup).
  storage_keys text[] not null default '{}',
  total_bytes bigint check (total_bytes is null or total_bytes >= 0),
  tile_count integer check (tile_count is null or tile_count >= 0),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  error_detail text check (error_detail is null or length(error_detail) <= 500),
  files_removed_at timestamptz,
  unique (sector_id, version),
  unique (tenant_id, id),
  foreign key (tenant_id, sector_id) references app.sector (tenant_id, id),
  check (
    status not in ('ready', 'superseded')
    or (manifest is not null and manifest_hash is not null and manifest_signature is not null and built_at is not null)
  )
);
comment on table app.basemap_pack is
  'Offline base map of a sector (ADR-024): versioned PMTiles file and style, prepared by the worker, signed.';
-- One preparation at a time and one file in force per sector.
create unique index basemap_pack_pending_uq on app.basemap_pack (sector_id) where status in ('queued', 'building');
create unique index basemap_pack_ready_uq on app.basemap_pack (sector_id) where status = 'ready';
create index basemap_pack_tenant_idx on app.basemap_pack (tenant_id, sector_id, version desc);

-- Base maps installed by each terminal (receipt): the administration sees who is up to date.
create table app.device_basemap (
  tenant_id uuid not null,
  device_id uuid not null,
  pack_id uuid not null,
  installed_at timestamptz not null default now(),
  primary key (device_id, pack_id),
  foreign key (tenant_id, device_id) references app.device (tenant_id, id),
  foreign key (tenant_id, pack_id) references app.basemap_pack (tenant_id, id)
);
create index device_basemap_pack_idx on app.device_basemap (pack_id);

-- Every access goes through the functions below.
alter table app.basemap_pack enable row level security;
alter table app.device_basemap enable row level security;

-- Parts of the PMTiles files are stored as opaque bytes.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'storage' and c.relname = 'buckets') then
    update storage.buckets
    set allowed_mime_types = array_append(allowed_mime_types, 'application/octet-stream')
    where id = 'etare-assets' and not ('application/octet-stream' = any (allowed_mime_types));
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Coverage of a sector
-- -----------------------------------------------------------------------------
-- A sector deserves a base map when at least one terminal can receive it.
create function app.basemap_sector_eligible(p_sector_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.sector sc
    join app.device d on d.tenant_id = sc.tenant_id and d.status <> 'revoked'
    where sc.id = p_sector_id and sc.status = 'active'
      and (
        d.scope = 'tenant'
        or exists (select 1 from app.device_sector ds where ds.device_id = d.id and ds.sector_id = sc.id)
      )
  )
$$;

-- What the base map of a sector covers: the extent of its located sites (general view)
-- and the sites distributed to the tablets (detail areas), with a signature that moves
-- when either changes. Restricted or high sites never mark a detail area.
create function app.basemap_coverage(p_sector_id uuid) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with sector as (
    select sc.id, sc.tenant_id from app.sector sc where sc.id = p_sector_id and sc.status = 'active'
  ),
  located as (
    select s.id, s.geom, s.sensitivity
    from sector sc
    join app.site s on s.tenant_id = sc.tenant_id
    where s.status <> 'archived' and s.geom is not null and app.site_in_sector(s.id, sc.id)
  ),
  detail as (
    select distinct round(extensions.st_x(l.geom)::numeric, 5) as lon, round(extensions.st_y(l.geom)::numeric, 5) as lat
    from located l
    where exists (
      select 1 from app.publication p
      where p.site_id = l.id and p.status = 'published'
        and app.effective_sensitivity(p.sensitivity, l.sensitivity) = 'normal'
    )
  ),
  box as (
    select extensions.st_extent(l.geom)::extensions.geometry as e from located l
  ),
  summary as (
    select
      (select count(*) from located)::integer as site_count,
      (select case when b.e is null then null
                   else jsonb_build_array(round(extensions.st_xmin(b.e)::numeric, 5), round(extensions.st_ymin(b.e)::numeric, 5),
                                          round(extensions.st_xmax(b.e)::numeric, 5), round(extensions.st_ymax(b.e)::numeric, 5))
              end from box b) as extent,
      coalesce((select jsonb_agg(jsonb_build_array(d.lon, d.lat) order by d.lon, d.lat) from detail d), '[]'::jsonb)
        as detail
  )
  select jsonb_build_object(
    'site_count', s.site_count,
    'extent', s.extent,
    'detail', s.detail,
    'signature', md5(coalesce(s.extent::text, '') || '|' || s.detail::text)
  )
  from summary s
$$;

-- -----------------------------------------------------------------------------
-- Preparation (internal, administration and worker)
-- -----------------------------------------------------------------------------
create function app.queue_basemap_build(
  p_tenant uuid,
  p_sector uuid,
  p_source text,
  p_reason text,
  p_signature text,
  p_user uuid
) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app.basemap_pack (tenant_id, sector_id, version, source_id, reason, coverage_signature, requested_by)
  values (
    p_tenant, p_sector,
    coalesce((select max(b.version) from app.basemap_pack b where b.sector_id = p_sector), 0) + 1,
    p_source, p_reason, p_signature, p_user
  )
  returning id into v_id;
  insert into app.job (tenant_id, job_type, payload, idempotency_key, max_attempts)
  values (p_tenant, 'basemap.build', jsonb_build_object('pack_id', v_id), 'basemap.build:' || v_id::text, 5);
  return v_id;
end
$$;

-- Summary of a pack for the administration.
create function app.basemap_pack_summary(p_pack_id uuid) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_pack.id,
    'version', p_pack.version,
    'status', p_pack.status,
    'reason', p_pack.reason,
    'source_id', p_pack.source_id,
    'requested_at', p_pack.requested_at,
    'started_at', p_pack.started_at,
    'built_at', p_pack.built_at,
    'renew_after', p_pack.renew_after,
    'total_bytes', p_pack.total_bytes,
    'tile_count', p_pack.tile_count,
    'error_code', p_pack.error_code,
    'error_detail', p_pack.error_detail
  )
  from app.basemap_pack p_pack
  where p_pack.id = p_pack_id
$$;

-- State of the base maps of the SIS, sector by sector (device:manage, second factor).
create function app.basemap_overview() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_device_manager();
begin
  return coalesce((
    select jsonb_agg(x.item order by lower(x.name), x.id)
    from (
      select sc.id, sc.name, jsonb_build_object(
        'sector', jsonb_build_object('id', sc.id, 'name', sc.name, 'code', sc.code),
        'eligible', app.basemap_sector_eligible(sc.id),
        'site_count', (c.coverage ->> 'site_count')::integer,
        'detail_count', jsonb_array_length(c.coverage -> 'detail'),
        'current', app.basemap_pack_summary(r.id),
        'latest', case when l.id is not null and (r.id is null or l.version > r.version)
                       then app.basemap_pack_summary(l.id) end,
        'stale', r.id is not null and r.coverage_signature is distinct from c.coverage ->> 'signature',
        'devices', jsonb_build_object(
          'expected', (
            select count(*) from app.device d
            where d.tenant_id = sc.tenant_id and d.status = 'active'
              and (d.scope = 'tenant'
                   or exists (select 1 from app.device_sector ds where ds.device_id = d.id and ds.sector_id = sc.id))
          ),
          'installed', (select count(*) from app.device_basemap db where db.pack_id = r.id)
        )
      ) as item
      from app.sector sc
      cross join lateral (select app.basemap_coverage(sc.id) as coverage) c
      left join lateral (
        select b.id, b.version, b.coverage_signature from app.basemap_pack b
        where b.sector_id = sc.id and b.status = 'ready'
      ) r on true
      left join lateral (
        select b.id, b.version from app.basemap_pack b
        where b.sector_id = sc.id and b.status in ('queued', 'building', 'failed')
        order by b.version desc limit 1
      ) l on true
      where sc.tenant_id = v_tenant and sc.status = 'active'
    ) x
  ), '[]'::jsonb);
end
$$;

-- Prepares the base map of a sector now (device:manage). A preparation already queued
-- or running is returned as is.
create function app.request_basemap_build(p_sector_id uuid, p_source text) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_device_manager();
  v_coverage jsonb;
  v_id uuid;
begin
  if p_source is null or p_source !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'invalid base map source' using errcode = '22023';
  end if;
  perform 1 from app.sector sc where sc.id = p_sector_id and sc.tenant_id = v_tenant and sc.status = 'active' for update;
  if not found then raise exception 'sector not found' using errcode = 'ETB04'; end if;
  select b.id into v_id from app.basemap_pack b where b.sector_id = p_sector_id and b.status in ('queued', 'building');
  if v_id is not null then return v_id; end if;
  v_coverage := app.basemap_coverage(p_sector_id);
  if (v_coverage ->> 'site_count')::integer = 0 then
    raise exception 'sector without located site' using errcode = 'ETB22';
  end if;
  v_id := app.queue_basemap_build(v_tenant, p_sector_id, p_source, 'manual', v_coverage ->> 'signature',
                                  app.current_user_id());
  perform app.record_audit_event('basemap.build_requested', 'sector', p_sector_id, 'success', null,
                                 jsonb_build_object('pack_id', v_id, 'source', p_source));
  return v_id;
end
$$;

-- One planning job per slot (the worker asks every few minutes; the key deduplicates).
create function app.worker_schedule_basemaps(p_slot text) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_slot is null or p_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
    raise exception 'invalid planning slot' using errcode = '22023';
  end if;
  insert into app.job (tenant_id, job_type, payload, idempotency_key, max_attempts)
  values (null, 'basemap.plan', jsonb_build_object('slot', p_slot), 'basemap.plan:' || p_slot, 3)
  on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  return v_id;
end
$$;

-- Plans the base maps every SIS needs with the configured source: first file, coverage
-- moved, source changed, six months passed. A preparation whose job died is failed; a
-- failure on the same coverage waits a day (the administration can force it).
create function app.worker_plan_basemaps(p_source text) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_sector record;
  v_coverage jsonb;
  v_ready app.basemap_pack;
  v_last app.basemap_pack;
  v_reason text;
  v_count integer := 0;
begin
  if p_source is null or p_source !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'invalid base map source' using errcode = '22023';
  end if;

  update app.basemap_pack b
  set status = 'failed', error_code = 'JOB_ENDED', error_detail = 'Préparation interrompue.'
  where b.status in ('queued', 'building')
    and not exists (
      select 1 from app.job j
      where j.tenant_id = b.tenant_id and j.job_type = 'basemap.build'
        and j.idempotency_key = 'basemap.build:' || b.id::text and j.status in ('queued', 'running')
    );

  for v_sector in
    select sc.id, sc.tenant_id from app.sector sc
    where sc.status = 'active' and app.basemap_sector_eligible(sc.id)
    order by sc.tenant_id, sc.id
  loop
    continue when exists (
      select 1 from app.basemap_pack b where b.sector_id = v_sector.id and b.status in ('queued', 'building')
    );
    v_coverage := app.basemap_coverage(v_sector.id);
    continue when (v_coverage ->> 'site_count')::integer = 0;

    v_ready := null;
    select * into v_ready from app.basemap_pack b where b.sector_id = v_sector.id and b.status = 'ready';
    v_reason := case
      when v_ready.id is null then 'initial'
      when v_ready.source_id <> p_source then 'source'
      when v_ready.coverage_signature is distinct from v_coverage ->> 'signature' then 'coverage'
      when v_ready.renew_after <= now() then 'renewal'
    end;
    continue when v_reason is null;

    v_last := null;
    select * into v_last from app.basemap_pack b where b.sector_id = v_sector.id order by b.version desc limit 1;
    continue when v_last.status = 'failed' and v_last.source_id = p_source
      and v_last.coverage_signature is not distinct from v_coverage ->> 'signature'
      and v_last.requested_at > now() - interval '1 day';

    perform app.queue_basemap_build(v_sector.tenant_id, v_sector.id, p_source, v_reason,
                                    v_coverage ->> 'signature', null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

-- Starts a preparation: the pack, its sector and its coverage at this instant.
create function app.worker_start_basemap(p_pack_id uuid, p_tenant uuid) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_pack app.basemap_pack;
  v_coverage jsonb;
begin
  update app.basemap_pack b
  set status = 'building', started_at = coalesce(b.started_at, now())
  where b.id = p_pack_id and b.tenant_id = p_tenant and b.status in ('queued', 'building')
  returning * into v_pack;
  if not found then return null; end if;
  v_coverage := app.basemap_coverage(v_pack.sector_id);
  update app.basemap_pack b set coverage_signature = v_coverage ->> 'signature' where b.id = p_pack_id;
  return jsonb_build_object(
    'pack_id', v_pack.id,
    'tenant_id', v_pack.tenant_id,
    'sector_id', v_pack.sector_id,
    'sector_name', (select sc.name from app.sector sc where sc.id = v_pack.sector_id),
    'version', v_pack.version,
    'source_id', v_pack.source_id,
    'coverage', v_coverage
  );
end
$$;

-- Records an object written by a preparation, before writing it (cleanup if interrupted).
create function app.worker_record_basemap_object(p_pack_id uuid, p_tenant uuid, p_key text) returns boolean
language sql volatile
security definer
set search_path = ''
as $$
  with updated as (
    update app.basemap_pack b
    set storage_keys = case when p_key = any (b.storage_keys) then b.storage_keys else b.storage_keys || p_key end
    where b.id = p_pack_id and b.tenant_id = p_tenant and b.status = 'building'
      and p_key like 'tenants/' || p_tenant::text || '/basemaps/' || p_pack_id::text || '/%'
    returning 1
  )
  select exists (select 1 from updated)
$$;

-- The new file comes into force: the previous one is superseded, the terminals see it at
-- their next contact (generation).
create function app.worker_complete_basemap(
  p_pack_id uuid,
  p_tenant uuid,
  p_manifest jsonb,
  p_manifest_hash text,
  p_signature jsonb,
  p_files jsonb,
  p_total_bytes bigint,
  p_tile_count integer,
  p_renew_after timestamptz
) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_pack app.basemap_pack;
begin
  select * into v_pack from app.basemap_pack b
  where b.id = p_pack_id and b.tenant_id = p_tenant and b.status = 'building'
  for update;
  if not found then return false; end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  perform set_config('app.tenant_id', p_tenant::text, true);

  update app.basemap_pack b set status = 'superseded', superseded_at = now()
  where b.sector_id = v_pack.sector_id and b.status = 'ready';
  update app.basemap_pack b
  set status = 'ready', built_at = now(), manifest = p_manifest, manifest_hash = p_manifest_hash,
      manifest_signature = p_signature, files = p_files, total_bytes = p_total_bytes, tile_count = p_tile_count,
      renew_after = p_renew_after, error_code = null, error_detail = null
  where b.id = p_pack_id;
  perform app.touch_distribution_generation(p_tenant);
  perform app.record_audit_event('basemap.ready', 'sector', v_pack.sector_id, 'success', null,
                                 jsonb_build_object('pack_id', p_pack_id, 'version', v_pack.version,
                                                    'source', v_pack.source_id, 'total_bytes', p_total_bytes,
                                                    'tile_count', p_tile_count));
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

create function app.worker_fail_basemap(p_pack_id uuid, p_tenant uuid, p_code text, p_detail text) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_pack app.basemap_pack;
begin
  update app.basemap_pack b
  set status = 'failed', error_code = left(p_code, 64), error_detail = left(p_detail, 500)
  where b.id = p_pack_id and b.tenant_id = p_tenant and b.status in ('queued', 'building')
  returning * into v_pack;
  if not found then return false; end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  perform set_config('app.tenant_id', p_tenant::text, true);
  perform app.record_audit_event('basemap.failed', 'sector', v_pack.sector_id, 'error', left(p_code, 64),
                                 jsonb_build_object('pack_id', p_pack_id, 'version', v_pack.version));
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

-- Objects to remove: superseded files after a week (terminals finishing a transfer), and
-- whatever a failed preparation wrote.
create function app.worker_basemap_objects_to_remove(p_limit integer)
returns table (pack_id uuid, tenant_id uuid, storage_keys text[])
language sql stable
security definer
set search_path = ''
as $$
  select b.id, b.tenant_id, b.storage_keys
  from app.basemap_pack b
  where b.files_removed_at is null and cardinality(b.storage_keys) > 0
    and ((b.status = 'superseded' and b.superseded_at < now() - interval '7 days') or b.status = 'failed')
  order by coalesce(b.superseded_at, b.requested_at)
  limit least(greatest(p_limit, 1), 100)
$$;

create function app.worker_mark_basemap_objects_removed(p_pack_id uuid) returns boolean
language sql volatile
security definer
set search_path = ''
as $$
  with updated as (
    update app.basemap_pack b set files_removed_at = now()
    where b.id = p_pack_id and b.files_removed_at is null and b.status in ('superseded', 'failed')
    returning 1
  )
  select exists (select 1 from updated)
$$;

-- -----------------------------------------------------------------------------
-- Distribution to the terminals (offline:download, terminal proof)
-- -----------------------------------------------------------------------------
-- Base maps in force for the sectors of the terminal (all the sectors for the whole SIS).
-- A base map is public data: it belongs to the terminal, whoever synchronises.
create function app.sync_basemaps(p_device_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'pack_id', b.id,
      'sector_id', sc.id,
      'sector_name', sc.name,
      'version', b.version,
      'manifest_hash', b.manifest_hash,
      'total_bytes', b.total_bytes,
      'built_at', b.built_at,
      'renew_after', b.renew_after
    ) order by lower(sc.name), sc.id)
    from app.basemap_pack b
    join app.sector sc on sc.tenant_id = b.tenant_id and sc.id = b.sector_id and sc.status = 'active'
    join app.device d on d.tenant_id = b.tenant_id and d.id = p_device_id
    where b.tenant_id = v_tenant and b.status = 'ready'
      and (d.scope = 'tenant'
           or exists (select 1 from app.device_sector ds where ds.device_id = d.id and ds.sector_id = sc.id))
  ), '[]'::jsonb);
end
$$;

create function app.device_receives_basemap(p_device_id uuid, p_pack_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.basemap_pack b
    join app.sector sc on sc.tenant_id = b.tenant_id and sc.id = b.sector_id and sc.status = 'active'
    join app.device d on d.tenant_id = b.tenant_id and d.id = p_device_id
    where b.id = p_pack_id and b.status = 'ready'
      and (d.scope = 'tenant'
           or exists (select 1 from app.device_sector ds where ds.device_id = d.id and ds.sector_id = sc.id))
  )
$$;

create function app.sync_basemap(p_device_id uuid, p_pack_id uuid)
returns table (manifest jsonb, manifest_hash text, signature jsonb)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
begin
  return query
  select b.manifest, b.manifest_hash, b.manifest_signature
  from app.basemap_pack b
  where b.id = p_pack_id and b.tenant_id = v_tenant and app.device_receives_basemap(p_device_id, b.id);
end
$$;

create function app.sync_basemap_files(p_device_id uuid, p_pack_id uuid, p_sha256 text[])
returns table (sha256 text, storage_key text)
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
begin
  if cardinality(coalesce(p_sha256, '{}')) > 500 then
    raise exception 'too many files' using errcode = '22023';
  end if;
  return query
  select distinct f ->> 'sha256', f ->> 'storage_key'
  from app.basemap_pack b
  cross join lateral jsonb_array_elements(b.files) f
  where b.id = p_pack_id and b.tenant_id = v_tenant and app.device_receives_basemap(p_device_id, b.id)
    and f ->> 'sha256' = any (p_sha256);
end
$$;

-- What the terminal holds after its transfer (complete files only).
create function app.sync_basemap_receipt(p_device_id uuid, p_pack_ids uuid[]) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_count integer;
begin
  if cardinality(coalesce(p_pack_ids, '{}')) > 200 then
    raise exception 'too many base maps' using errcode = '22023';
  end if;
  delete from app.device_basemap db
  where db.device_id = p_device_id and not (db.pack_id = any (coalesce(p_pack_ids, '{}')));
  insert into app.device_basemap (tenant_id, device_id, pack_id)
  select v_tenant, p_device_id, b.id
  from app.basemap_pack b
  where b.id = any (coalesce(p_pack_ids, '{}')) and b.tenant_id = v_tenant and b.status in ('ready', 'superseded')
  on conflict (device_id, pack_id) do nothing;
  select count(*) into v_count from app.device_basemap db where db.device_id = p_device_id;
  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function
  app.basemap_overview(),
  app.request_basemap_build(uuid, text),
  app.sync_basemaps(uuid),
  app.sync_basemap(uuid, uuid),
  app.sync_basemap_files(uuid, uuid, text[]),
  app.sync_basemap_receipt(uuid, uuid[])
to etare_api;

grant execute on function
  app.worker_schedule_basemaps(text),
  app.worker_plan_basemaps(text),
  app.worker_start_basemap(uuid, uuid),
  app.worker_record_basemap_object(uuid, uuid, text),
  app.worker_complete_basemap(uuid, uuid, jsonb, text, jsonb, jsonb, bigint, integer, timestamptz),
  app.worker_fail_basemap(uuid, uuid, text, text),
  app.worker_basemap_objects_to_remove(integer),
  app.worker_mark_basemap_objects_removed(uuid)
to etare_worker;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
