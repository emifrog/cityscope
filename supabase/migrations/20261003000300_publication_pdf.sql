-- =============================================================================
-- Sprint 3 — ETARE PDF generated with the publication (ETARE-02).
--
-- The worker renders the PDF from the frozen snapshot; the plan backgrounds it
-- draws are the checked files the snapshot references by id and SHA-256. This
-- function gives their storage keys, for one SIS only, and only for files that
-- passed the verification (the worker re-checks the hash of what it reads).
-- =============================================================================

create function app.worker_publication_assets(p_tenant_id uuid, p_asset_ids uuid[])
returns table (id uuid, storage_key text, sha256 text, mime_type text)
language sql stable
security definer
set search_path = ''
as $$
  select a.id, a.storage_key, a.sha256, a.mime_type
  from app.asset a
  where a.tenant_id = p_tenant_id and a.id = any(p_asset_ids) and a.scan_status = 'clean'
$$;

grant execute on function app.worker_publication_assets(uuid, uuid[]) to etare_worker;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
