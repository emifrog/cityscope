-- =============================================================================
-- Sprint 12 — SEC-04: rotation of the signing keys (ADR-027).
--
--   * The signature made at build time stays immutable (publication and base
--     map manifests). After a rotation, the worker re-signs the content in force
--     with the active key: these re-signatures are added beside the original,
--     never replace it, and are traced in the audit log of the SIS.
--   * The worker re-signs only content whose stored manifest still matches its
--     hash and whose original signature it verifies: the immutable rows of the
--     database, never a manifest it was handed.
--   * Each terminal reports the key set it holds: the administration sees which
--     terminals have not met the last rotation yet.
-- =============================================================================

create table app.publication_signature (
  tenant_id uuid not null,
  publication_id uuid not null,
  key_id text not null check (key_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  signature jsonb not null check (
    jsonb_typeof(signature) = 'object'
    and signature - 'algorithm' - 'key_id' - 'signature' = '{}'::jsonb
    and signature ->> 'algorithm' = 'Ed25519'
    and signature ->> 'signature' ~ '^[A-Za-z0-9+/]{86}==$'
  ),
  signed_at timestamptz not null default now(),
  primary key (publication_id, key_id),
  foreign key (tenant_id, publication_id) references app.publication (tenant_id, id),
  check (signature ->> 'key_id' = key_id)
);
comment on table app.publication_signature is
  'Re-signatures of a publication manifest after a key rotation (SEC-04, ADR-027); the original stays on the publication.';

create table app.basemap_pack_signature (
  tenant_id uuid not null,
  pack_id uuid not null,
  key_id text not null check (key_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  signature jsonb not null check (
    jsonb_typeof(signature) = 'object'
    and signature - 'algorithm' - 'key_id' - 'signature' = '{}'::jsonb
    and signature ->> 'algorithm' = 'Ed25519'
    and signature ->> 'signature' ~ '^[A-Za-z0-9+/]{86}==$'
  ),
  signed_at timestamptz not null default now(),
  primary key (pack_id, key_id),
  foreign key (tenant_id, pack_id) references app.basemap_pack (tenant_id, id),
  check (signature ->> 'key_id' = key_id)
);
comment on table app.basemap_pack_signature is
  'Re-signatures of a base map manifest after a key rotation (SEC-04, ADR-027).';

-- Reached only through the functions below (no grant to the application roles).
alter table app.publication_signature enable row level security;
alter table app.basemap_pack_signature enable row level security;

-- Key set held by each terminal, as reported with its receipts.
alter table app.device_sync_state
  add column keyset_sequence integer check (keyset_sequence is null or keyset_sequence > 0);

-- -----------------------------------------------------------------------------
-- Terminals: the re-signatures of a content of their SIS, oldest first.
-- -----------------------------------------------------------------------------
create function app.sync_renewed_signatures(p_device_id uuid, p_kind text, p_content_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
begin
  if p_kind = 'publication' then
    return coalesce((
      select jsonb_agg(s.signature order by s.signed_at, s.key_id)
      from app.publication_signature s
      where s.publication_id = p_content_id and s.tenant_id = v_tenant
    ), '[]'::jsonb);
  elsif p_kind = 'basemap' then
    return coalesce((
      select jsonb_agg(s.signature order by s.signed_at, s.key_id)
      from app.basemap_pack_signature s
      where s.pack_id = p_content_id and s.tenant_id = v_tenant
    ), '[]'::jsonb);
  end if;
  raise exception 'invalid content kind' using errcode = '22023';
end
$$;

-- Receipt of a terminal, now with the key set it holds (null from applications before 0.4.0).
drop function app.sync_receipt(uuid, bigint, text, text, uuid[]);
create function app.sync_receipt(
  p_device_id uuid, p_generation bigint, p_status text, p_error_code text, p_installed uuid[],
  p_keyset_sequence integer default null
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
  if p_keyset_sequence is not null and p_keyset_sequence <= 0 then
    raise exception 'invalid key set sequence' using errcode = '22023';
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
                                           last_status, last_error_code, installed_generation, keyset_sequence)
  values (p_device_id, v_tenant, app.current_user_id(), now(), now(), p_status, p_error_code,
          case when p_status = 'installed' then least(p_generation, v_current) end, p_keyset_sequence)
  on conflict (device_id) do update
  set last_user_id = excluded.last_user_id, last_seen_at = excluded.last_seen_at,
      last_sync_at = excluded.last_sync_at, last_status = excluded.last_status,
      last_error_code = excluded.last_error_code,
      installed_generation = case when p_status = 'installed'
                                  then greatest(coalesce(s.installed_generation, 0), excluded.installed_generation)
                                  else s.installed_generation end,
      keyset_sequence = coalesce(excluded.keyset_sequence, s.keyset_sequence);
  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- Worker: re-signature of the content in force with the active key.
-- -----------------------------------------------------------------------------

-- One renewal job per key and per hour (the worker asks every few minutes; the key deduplicates).
create function app.worker_schedule_signature_renewal(p_key_id text, p_slot text) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_slot is null or p_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}$' then
    raise exception 'invalid renewal slot' using errcode = '22023';
  end if;
  if p_key_id is null or p_key_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception 'invalid key id' using errcode = '22023';
  end if;
  insert into app.job (tenant_id, job_type, payload, idempotency_key, max_attempts)
  values (null, 'signatures.renew', jsonb_build_object('key_id', p_key_id, 'slot', p_slot),
          'signatures.renew:' || p_key_id || ':' || p_slot, 3)
  on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  return v_id;
end
$$;

-- Content in force that the key has not signed yet, with every signature it already has
-- (minus the ones the worker could not verify during this run).
create function app.worker_signature_candidates(p_key_id text, p_limit integer, p_exclude uuid[] default '{}')
returns table (
  kind text, content_id uuid, tenant_id uuid, manifest jsonb, manifest_hash text, signatures jsonb
)
language sql stable
security definer
set search_path = ''
as $$
  (
    select 'publication', p.id, p.tenant_id, p.manifest, p.manifest_hash,
           jsonb_build_array(p.manifest_signature) || coalesce((
             select jsonb_agg(s.signature order by s.signed_at, s.key_id)
             from app.publication_signature s where s.publication_id = p.id
           ), '[]'::jsonb)
    from app.publication p
    where p.status = 'published' and p.manifest_signature is not null
      and p.manifest_signature ->> 'key_id' <> p_key_id
      and not exists (select 1 from app.publication_signature s where s.publication_id = p.id and s.key_id = p_key_id)
      and not p.id = any (coalesce(p_exclude, '{}'))
    order by p.id
    limit greatest(1, least(p_limit, 500))
  )
  union all
  (
    select 'basemap', b.id, b.tenant_id, b.manifest, b.manifest_hash,
           jsonb_build_array(b.manifest_signature) || coalesce((
             select jsonb_agg(s.signature order by s.signed_at, s.key_id)
             from app.basemap_pack_signature s where s.pack_id = b.id
           ), '[]'::jsonb)
    from app.basemap_pack b
    where b.status = 'ready'
      and b.manifest_signature ->> 'key_id' <> p_key_id
      and not exists (select 1 from app.basemap_pack_signature s where s.pack_id = b.id and s.key_id = p_key_id)
      and not b.id = any (coalesce(p_exclude, '{}'))
    order by b.id
    limit greatest(1, least(p_limit, 500))
  )
$$;

-- Records a re-signature of a content still in force, traced in the journal of its SIS.
create function app.worker_record_signature(p_kind text, p_content_id uuid, p_signature jsonb)
returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_entity uuid;
  v_key text := p_signature ->> 'key_id';
begin
  if p_kind = 'publication' then
    select p.tenant_id, p.id into v_tenant, v_entity
    from app.publication p where p.id = p_content_id and p.status = 'published' and p.manifest_signature is not null;
    if not found then return false; end if;
    insert into app.publication_signature (tenant_id, publication_id, key_id, signature)
    values (v_tenant, p_content_id, v_key, p_signature)
    on conflict (publication_id, key_id) do nothing;
  elsif p_kind = 'basemap' then
    select b.tenant_id, b.sector_id into v_tenant, v_entity
    from app.basemap_pack b where b.id = p_content_id and b.status = 'ready';
    if not found then return false; end if;
    insert into app.basemap_pack_signature (tenant_id, pack_id, key_id, signature)
    values (v_tenant, p_content_id, v_key, p_signature)
    on conflict (pack_id, key_id) do nothing;
  else
    raise exception 'invalid content kind' using errcode = '22023';
  end if;
  if not found then return false; end if;

  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  perform set_config('app.tenant_id', v_tenant::text, true);
  perform app.record_audit_event(
    case p_kind when 'publication' then 'publication.resigned' else 'basemap.resigned' end,
    case p_kind when 'publication' then 'publication' else 'sector' end,
    v_entity, 'success', null,
    jsonb_build_object('key_id', v_key, 'content_id', p_content_id)
  );
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function
  app.sync_renewed_signatures(uuid, text, uuid),
  app.sync_receipt(uuid, bigint, text, text, uuid[], integer)
to etare_api;

grant execute on function
  app.worker_schedule_signature_renewal(text, text),
  app.worker_signature_candidates(text, integer, uuid[]),
  app.worker_record_signature(text, uuid, jsonb)
to etare_worker;

revoke all on all routines in schema app from public;
