-- =============================================================================
-- Sprint 9 — CAP-03: life cycle of the files (ADR-009 complement).
--
--   * Reduced images of every clean image (320 and 1 280 px, WebP), computed by
--     the worker after the verdict; the back-office shows them, the original
--     stays the reference (offline packages unchanged).
--   * A verification abandoned by the queue rejects its asset (it no longer
--     stays 'pending' forever).
--   * Planned maintenance (job maintenance.files, one per hour): quarantine
--     objects of rejected or abandoned uploads removed, PDF of losing build
--     attempts removed, old rate-limit windows purged. Every removal is audited;
--     a file referenced by an asset or a publication is never a candidate.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reduced images
-- -----------------------------------------------------------------------------
alter table app.asset
  add column preview_key text,
  add constraint asset_preview_key_tenant check (
    preview_key is null or preview_key like 'tenants/' || tenant_id::text || '/thumbnails/%'
  ),
  add constraint asset_variants_clean check ((thumbnail_key is null and preview_key is null) or scan_status = 'clean');
comment on column app.asset.thumbnail_key is 'Reduced image (320 px, WebP) computed by the worker for the lists.';
comment on column app.asset.preview_key is 'Reduced image (1 280 px, WebP) computed by the worker for previews.';

-- Only the worker writes the reduced images.
revoke update (thumbnail_key) on app.asset from etare_api;

-- A job of a SIS planned by the database itself (worker transactions have no SIS context).
create function app.enqueue_tenant_job(p_tenant uuid, p_type text, p_payload jsonb, p_key text) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app.job (tenant_id, job_type, payload, idempotency_key)
  values (p_tenant, p_type, p_payload, p_key)
  on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  return v_id;
end
$$;

-- A clean image gets its reduced versions.
create function app.tg_asset_variants_job() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scan_status = 'clean' and old.scan_status = 'pending' and new.mime_type in ('image/png', 'image/jpeg', 'image/webp') then
    perform app.enqueue_tenant_job(new.tenant_id, 'asset.thumbnail', jsonb_build_object('asset_id', new.id),
                                   'asset.thumbnail:' || new.id::text);
  end if;
  return null;
end
$$;
create trigger asset_variants_job after update of scan_status on app.asset
for each row execute function app.tg_asset_variants_job();

create function app.worker_asset_for_variants(p_asset_id uuid, p_tenant uuid)
returns table (storage_key text, mime_type text, scan_status text, thumbnail_key text)
language sql stable
security definer
set search_path = ''
as $$
  select a.storage_key, a.mime_type, a.scan_status, a.thumbnail_key
  from app.asset a
  where a.id = p_asset_id and a.tenant_id = p_tenant
$$;

create function app.worker_record_asset_variants(p_asset_id uuid, p_tenant uuid, p_thumbnail text, p_preview text)
returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  update app.asset a
  set thumbnail_key = p_thumbnail, preview_key = p_preview
  where a.id = p_asset_id and a.tenant_id = p_tenant and a.scan_status = 'clean';
  return found;
end
$$;

-- -----------------------------------------------------------------------------
-- A verification abandoned by the queue rejects its asset; its quarantine object
-- (if any) is then removed by the maintenance.
-- -----------------------------------------------------------------------------
create function app.reject_asset_on_dead_job() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_type = 'asset.verify' then
    perform set_config('app.actor_type', 'worker', true);
    perform set_config('app.origin', 'worker', true);
    update app.asset a
    set scan_status = 'rejected',
        scan_detail = jsonb_build_object('reason', 'VERIFICATION_FAILED',
                                         'error', coalesce(new.last_error_code, 'JOB_DEAD')),
        verified_at = now()
    where a.tenant_id = new.tenant_id and a.id::text = new.payload ->> 'asset_id' and a.scan_status = 'pending';
  end if;
  return new;
end
$$;
create trigger job_asset_terminal_failure after update of status on app.job
for each row when (new.status = 'dead' and old.status is distinct from new.status)
execute function app.reject_asset_on_dead_job();

-- -----------------------------------------------------------------------------
-- Outputs of the publication builds: every PDF written is recorded before its
-- upload, so that the PDF of a losing attempt can be found and removed.
-- -----------------------------------------------------------------------------
create table app.publication_output (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  publication_id uuid not null references app.publication (id),
  storage_key text not null unique check (storage_key like 'tenants/' || tenant_id::text || '/publications/%'),
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
comment on table app.publication_output is
  'Files written by the publication builds (one per attempt); those not kept by the publication are purged.';
create index publication_output_pending_idx on app.publication_output (created_at) where removed_at is null;
-- No grant: only the worker functions below.
alter table app.publication_output enable row level security;

create function app.worker_record_publication_output(p_publication uuid, p_tenant uuid, p_key text) returns void
language sql volatile
security definer
set search_path = ''
as $$
  insert into app.publication_output (tenant_id, publication_id, storage_key)
  select p.tenant_id, p.id, p_key from app.publication p where p.id = p_publication and p.tenant_id = p_tenant
  on conflict (storage_key) do nothing
$$;

-- -----------------------------------------------------------------------------
-- Maintenance (worker, platform job without SIS).
-- -----------------------------------------------------------------------------

-- One maintenance job per slot (the worker asks every few minutes; the key deduplicates).
create function app.worker_schedule_maintenance(p_slot text) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_slot is null or p_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}$' then
    raise exception 'invalid maintenance slot' using errcode = '22023';
  end if;
  insert into app.job (tenant_id, job_type, payload, idempotency_key, max_attempts)
  values (null, 'maintenance.files', jsonb_build_object('slot', p_slot), 'maintenance.files:' || p_slot, 3)
  on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  return v_id;
end
$$;

-- Quarantine objects to remove: rejected uploads (dead verification), and uploads never
-- confirmed nor verified after 24 h (the signed upload URL lives 2 h).
create function app.worker_quarantine_to_release(p_limit integer)
returns table (asset_id uuid, tenant_id uuid, quarantine_key text, reason text)
language sql stable
security definer
set search_path = ''
as $$
  select a.id, a.tenant_id, a.quarantine_key,
         case when a.scan_status = 'rejected' then 'REJECTED' else 'ABANDONED' end
  from app.asset a
  where a.quarantine_key is not null
    and (
      a.scan_status = 'rejected'
      or (
        a.scan_status = 'pending' and a.created_at < now() - interval '24 hours'
        and not exists (
          select 1 from app.job j
          where j.tenant_id = a.tenant_id and j.job_type = 'asset.verify'
            and j.payload ->> 'asset_id' = a.id::text and j.status in ('queued', 'running')
        )
      )
    )
  order by a.created_at
  limit least(greatest(p_limit, 1), 500)
$$;

-- After its object is removed: an abandoned upload is rejected, the key forgotten, the act audited.
create function app.worker_release_quarantine(p_asset_id uuid, p_tenant uuid, p_reason text) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  perform set_config('app.tenant_id', p_tenant::text, true);
  update app.asset a
  set scan_status = 'rejected',
      scan_detail = coalesce(a.scan_detail, '{}'::jsonb) || jsonb_build_object('reason', 'ABANDONED'),
      verified_at = now()
  where a.id = p_asset_id and a.tenant_id = p_tenant and a.scan_status = 'pending';
  update app.asset a set quarantine_key = null
  where a.id = p_asset_id and a.tenant_id = p_tenant and a.quarantine_key is not null;
  if not found then
    return false;
  end if;
  perform app.record_audit_event('asset.quarantine_purge', 'asset', p_asset_id, 'success', p_reason, '{}'::jsonb);
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

-- PDF of build attempts that the publication did not keep, once the build is over for an hour.
-- A key referenced by any publication is never returned.
create function app.worker_publication_outputs_to_purge(p_limit integer)
returns table (output_id uuid, tenant_id uuid, publication_id uuid, storage_key text)
language sql stable
security definer
set search_path = ''
as $$
  select o.id, o.tenant_id, o.publication_id, o.storage_key
  from app.publication_output o
  join app.publication p on p.id = o.publication_id
  where o.removed_at is null
    and o.created_at < now() - interval '1 hour'
    and p.status in ('published', 'superseded', 'withdrawn', 'failed')
    and not exists (select 1 from app.publication kept where kept.pdf_storage_key = o.storage_key)
  order by o.created_at
  limit least(greatest(p_limit, 1), 500)
$$;

create function app.worker_mark_publication_output_removed(p_output uuid) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_output app.publication_output;
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  update app.publication_output o set removed_at = now()
  where o.id = p_output and o.removed_at is null
    and not exists (select 1 from app.publication kept where kept.pdf_storage_key = o.storage_key)
  returning * into v_output;
  if not found then
    return false;
  end if;
  perform set_config('app.tenant_id', v_output.tenant_id::text, true);
  perform app.record_audit_event('publication.output_purge', 'publication', v_output.publication_id, 'success',
                                 'LOSING_ATTEMPT', jsonb_build_object('storage_key', v_output.storage_key));
  perform set_config('app.tenant_id', '', true);
  return true;
end
$$;

grant execute on function
  app.worker_asset_for_variants(uuid, uuid),
  app.worker_record_asset_variants(uuid, uuid, text, text),
  app.worker_record_publication_output(uuid, uuid, text),
  app.worker_schedule_maintenance(text),
  app.worker_quarantine_to_release(integer),
  app.worker_release_quarantine(uuid, uuid, text),
  app.worker_publication_outputs_to_purge(integer),
  app.worker_mark_publication_output_removed(uuid)
to etare_worker;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
