-- =============================================================================
-- Sprint 1 — documents and file uploads (SITE-05, PLAN-01 foundation).
--
--   upload declared by the API (asset 'pending', declared SHA-256/size/type)
--     -> client uploads to tenants/{t}/quarantine/{asset}/{version} (signed URL)
--     -> worker verifies size, SHA-256 and real type, copies to the final key
--     -> asset 'clean' (downloadable) or 'rejected'.
--
-- The verification verdict can only be written by the worker functions below:
-- the API role loses UPDATE on the verification columns (column privileges).
-- =============================================================================

alter table app.asset
  add column quarantine_key text,
  add column scan_detail jsonb check (scan_detail is null or jsonb_typeof(scan_detail) = 'object'),
  add column verified_at timestamptz,
  add constraint asset_quarantine_key_tenant check (
    quarantine_key is null or quarantine_key like 'tenants/' || tenant_id::text || '/quarantine/%'
  ),
  add constraint asset_verified_consistency check ((scan_status = 'pending') = (verified_at is null));

-- Verdict is final: a pending asset becomes clean or rejected, once.
create function app.tg_asset_scan_transition() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.scan_status is distinct from old.scan_status and old.scan_status <> 'pending' then
    raise exception 'the verification verdict of an asset is final' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger asset_scan_transition before update on app.asset
for each row execute function app.tg_asset_scan_transition();

-- The API may only change descriptive columns; never the verdict nor the storage location.
revoke update on app.asset from etare_api;
grant update (filename, classification, offline_allowed, thumbnail_key) on app.asset to etare_api;

-- -----------------------------------------------------------------------------
-- Worker functions (SECURITY DEFINER, EXECUTE granted to etare_worker only)
-- -----------------------------------------------------------------------------
create function app.worker_asset_for_verification(p_asset_id uuid)
returns table (
  tenant_id uuid, site_id uuid, storage_key text, quarantine_key text, filename text,
  mime_type text, size_bytes bigint, sha256 text, scan_status text
)
language sql stable
security definer
set search_path = ''
as $$
  select a.tenant_id, a.site_id, a.storage_key, a.quarantine_key, a.filename,
         a.mime_type, a.size_bytes, a.sha256, a.scan_status
  from app.asset a
  where a.id = p_asset_id
$$;

create function app.worker_complete_asset_verification(p_asset_id uuid, p_status text, p_detail jsonb)
returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  if p_status not in ('clean', 'rejected') then
    raise exception 'invalid verification verdict' using errcode = '22023';
  end if;
  -- Audit the verdict as a worker action.
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  update app.asset
  set scan_status = p_status,
      scan_detail = coalesce(p_detail, '{}'::jsonb),
      verified_at = now(),
      quarantine_key = null
  where id = p_asset_id and scan_status = 'pending';
  return found;
end
$$;

grant execute on function
  app.worker_asset_for_verification(uuid),
  app.worker_complete_asset_verification(uuid, text, jsonb)
to etare_worker;

-- Documents list their versions newest first.
create index document_version_document_idx on app.document_version (document_id, version_no desc);

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
