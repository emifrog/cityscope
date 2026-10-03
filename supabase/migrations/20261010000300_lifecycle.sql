-- =============================================================================
-- Sprint 8 / R3 — life cycle of a dossier (MET-04, ADR-021).
--
--   * Withdrawal of the version in force: by a validator (publication:publish,
--     second factor), with a reason; who and when are recorded. The site has
--     no version in force any more; terminals remove it at their next contact.
--   * Archiving of a site and its dossier: only once no version is in force
--     and no build or decision is pending, by those who edit the site
--     (site:write), with a reason. Open drafts are closed, the dossier is
--     archived, no revision nor publication can start on it. Restoring makes
--     the dossier active again; the history stays in the audit.
--   * The signed catalogue tells a terminal why a site it holds disappears
--     (withdrawn or archived, when, why).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Withdrawal
-- -----------------------------------------------------------------------------
alter table app.publication add column withdrawn_by uuid references app.user_account (id);
alter table app.publication add constraint publication_withdrawal_reason_length
  check (withdrawal_reason is null or length(btrim(withdrawal_reason)) between 3 and 1000) not valid;

-- When and by whom: set by the database, never by the client.
create function app.tg_publication_withdrawal() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'withdrawn' and old.status <> 'withdrawn' then
    new.withdrawn_at := now();
    new.withdrawn_by := app.current_user_id();
  elsif new.withdrawn_by is distinct from old.withdrawn_by then
    raise exception 'PUBLICATION_IMMUTABLE: the author of a withdrawal never changes' using errcode = '42501';
  end if;
  return new;
end
$$;
-- Fires after publication_metadata_guard (alphabetical order of BEFORE triggers).
create trigger publication_withdrawal before update on app.publication
for each row execute function app.tg_publication_withdrawal();

-- -----------------------------------------------------------------------------
-- Archiving
-- -----------------------------------------------------------------------------
alter table app.site
  add column archived_at timestamptz,
  add column archived_by uuid references app.user_account (id),
  add column archive_reason text check (archive_reason is null or length(btrim(archive_reason)) between 3 and 1000);
-- An archived site says why (sites archived before this rule are left as they are).
alter table app.site add constraint site_archive_reason check (status <> 'archived' or archive_reason is not null) not valid;

create function app.tg_site_archive() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    if new.active_publication_id is not null then
      raise exception 'SITE_PUBLISHED: withdraw the version in force before archiving' using errcode = '23514';
    end if;
    if exists (select 1 from app.publication p
               where p.site_id = new.id and p.status in ('queued', 'building', 'ready')) then
      raise exception 'SITE_PUBLICATION_PENDING: a publication is being built' using errcode = '23514';
    end if;
    if exists (select 1 from app.etare_revision r where r.site_id = new.id and r.status = 'submitted') then
      raise exception 'SITE_REVISION_SUBMITTED: a revision waits for the decision of a validator' using errcode = '23514';
    end if;
    new.archived_at := now();
    new.archived_by := app.current_user_id();
  elsif old.status = 'archived' and new.status <> 'archived' then
    new.archived_at := null;
    new.archived_by := null;
    new.archive_reason := null;
  elsif (new.archived_at, new.archived_by) is distinct from (old.archived_at, old.archived_by) then
    raise exception 'archiving is recorded by the database' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger site_archive before update of status, archived_at, archived_by, archive_reason on app.site
for each row execute function app.tg_site_archive();

-- Archived: open drafts closed and dossier archived; restored: dossier active again.
-- Security definer: whoever archives the site closes its drafts (audited in their name).
create function app.tg_site_archive_effects() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status <> 'archived' then
    update app.etare_revision set status = 'superseded'
    where tenant_id = new.tenant_id and site_id = new.id and status = 'draft';
    update app.etare set status = 'archived'
    where tenant_id = new.tenant_id and site_id = new.id and status = 'active';
  elsif old.status = 'archived' and new.status <> 'archived' then
    update app.etare e set status = 'active'
    where e.id = (select x.id from app.etare x where x.tenant_id = new.tenant_id and x.site_id = new.id
                  order by x.created_at desc limit 1)
      and not exists (select 1 from app.etare a where a.site_id = new.id and a.status = 'active');
  end if;
  return null;
end
$$;
create trigger site_archive_effects after update of status on app.site
for each row execute function app.tg_site_archive_effects();

-- Nothing starts on an archived site.
create function app.tg_archived_site_frozen() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from app.site s where s.id = new.site_id and s.status = 'archived') then
    raise exception 'SITE_ARCHIVED: restore the site before working on its dossier' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger archived_site_frozen before insert on app.etare_revision
for each row execute function app.tg_archived_site_frozen();
create trigger archived_site_frozen before insert on app.publication
for each row execute function app.tg_archived_site_frozen();

-- -----------------------------------------------------------------------------
-- The catalogue tells a terminal why a site it holds disappears.
-- -----------------------------------------------------------------------------
create or replace function app.sync_catalog(p_device_id uuid, p_app_version text) returns jsonb
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
        and p.sensitivity = 'normal' and s.status <> 'archived'
        and (v_tenant_wide or app.has_permission('publication:read', p.site_id))
    ), '[]'::jsonb),
    -- Sites this terminal holds whose version was withdrawn, or which were archived (MET-04).
    'withdrawals', coalesce((
      select jsonb_agg(jsonb_build_object('site_id', w.site_id, 'site_name', w.site_name, 'kind', w.kind,
                                          'at', w.at, 'reason', w.reason) order by w.at desc, w.site_id)
      from (
        select s.id as site_id, s.name as site_name,
               case when s.status = 'archived' then 'archived' else 'withdrawn' end as kind,
               case when s.status = 'archived' then s.archived_at else latest.withdrawn_at end as at,
               case when s.status = 'archived' then s.archive_reason else latest.withdrawal_reason end as reason
        from app.device_publication dp
        join app.site s on s.tenant_id = dp.tenant_id and s.id = dp.site_id
        left join lateral (
          select p.status, p.withdrawn_at, p.withdrawal_reason
          from app.publication p
          where p.site_id = s.id and p.status in ('published', 'superseded', 'withdrawn')
          order by p.publication_number desc limit 1
        ) latest on true
        where dp.device_id = p_device_id and dp.tenant_id = v_tenant
          and (v_tenant_wide or app.has_permission('publication:read', s.id))
          and (
            (s.status = 'archived' and s.archived_at is not null and s.archive_reason is not null)
            or (s.status <> 'archived' and latest.status = 'withdrawn')
          )
      ) w
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

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
