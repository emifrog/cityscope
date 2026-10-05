-- =============================================================================
-- Sprint 10 — PER-02: sensitive sites (DEC-04, ADR-025).
--
--   * Effective sensitivity: the most restrictive of the published version and
--     of the site now: a site raised to sensitive stops being distributed at
--     once, without waiting for a new publication.
--   * "restricted": never in bulk; offered on demand to the members holding a
--     nominative, dated habilitation (whole SIS or sectors), within the
--     perimeter of the terminal and of the person. "high": never on a tablet.
--   * Every consultation, export and offline download of a sensitive site is
--     logged in access_event (append-only), from the back-office and from the
--     tablets (uploaded at the next contact, idempotent).
-- =============================================================================

create function app.effective_sensitivity(p_publication text, p_site text) returns text
language sql immutable
set search_path = ''
as $$
  select case
    when 'high' in (p_publication, p_site) then 'high'
    when 'restricted' in (p_publication, p_site) then 'restricted'
    else 'normal'
  end
$$;

-- -----------------------------------------------------------------------------
-- Habilitation: nominative, dated (12 months at most), whole SIS or sectors
-- -----------------------------------------------------------------------------
create table app.sensitive_habilitation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  membership_id uuid not null,
  scope_type text not null check (scope_type in ('tenant', 'sector')),
  scope_id uuid,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  revoked_at timestamptz,
  revoked_by uuid,
  check ((scope_type = 'tenant') = (scope_id is null)),
  foreign key (tenant_id, membership_id) references app.membership (tenant_id, id)
);
comment on table app.sensitive_habilitation is
  'Nominative habilitation to open "restricted" sites on demand on a tablet (ADR-025): dated, revocable, audited.';
create unique index sensitive_habilitation_live_uq on app.sensitive_habilitation (membership_id, scope_type, scope_id)
  nulls not distinct where revoked_at is null;

call app.install_audit_trigger('app.sensitive_habilitation');

-- Does the current person hold a live habilitation covering the site?
create function app.holds_sensitive_access(p_site_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.sensitive_habilitation h
    join app.membership m on m.id = h.membership_id and m.status = 'active'
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    where m.user_id = app.current_user_id()
      and h.tenant_id = app.current_tenant_id()
      and h.revoked_at is null
      and h.valid_until > now()
      and (h.scope_type = 'tenant' or app.site_in_sector(p_site_id, h.scope_id))
  )
$$;

-- Grants (p_valid_until set) or revokes (null) the habilitation of a member.
create function app.admin_set_sensitive_access(
  p_membership_id uuid,
  p_expected_version integer,
  p_sector_ids uuid[],
  p_valid_until timestamptz
)
returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_member_manager();
  v_membership app.membership;
  v_sectors uuid[] := array(select distinct unnest(coalesce(p_sector_ids, '{}')));
  v_version integer;
begin
  select * into v_membership from app.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then raise exception 'member not found' using errcode = 'ET404'; end if;
  if v_membership.user_id = app.current_user_id() then
    raise exception 'nobody changes their own membership' using errcode = 'ETSLF';
  end if;
  if v_membership.row_version <> p_expected_version then
    raise exception 'stale member version' using errcode = 'ET412';
  end if;
  if p_valid_until is not null and (p_valid_until <= now() or p_valid_until > now() + interval '366 days') then
    raise exception 'a habilitation lasts at most twelve months' using errcode = 'ETHAB';
  end if;
  if exists (
    select 1 from unnest(v_sectors) w (id)
    where not exists (select 1 from app.sector s where s.id = w.id and s.tenant_id = v_tenant and s.status = 'active')
  ) then
    raise exception 'unknown sector' using errcode = '23503';
  end if;

  update app.sensitive_habilitation h
  set revoked_at = now(), revoked_by = app.current_user_id()
  where h.membership_id = v_membership.id and h.revoked_at is null;
  if p_valid_until is not null then
    if cardinality(v_sectors) = 0 then
      insert into app.sensitive_habilitation (tenant_id, membership_id, scope_type, valid_until)
      values (v_tenant, v_membership.id, 'tenant', p_valid_until);
    else
      insert into app.sensitive_habilitation (tenant_id, membership_id, scope_type, scope_id, valid_until)
      select v_tenant, v_membership.id, 'sector', w.id, p_valid_until from unnest(v_sectors) w (id);
    end if;
  end if;

  update app.membership m set status = m.status where m.id = v_membership.id returning m.row_version into v_version;
  perform app.record_audit_event(
    case when p_valid_until is null then 'member.sensitive_access_revoke' else 'member.sensitive_access' end,
    'membership', v_membership.id, 'success', null,
    jsonb_build_object('sectors', to_jsonb(v_sectors), 'valid_until', p_valid_until)
  );
  perform app.touch_distribution_generation(v_tenant);
  return v_version;
end
$$;

-- -----------------------------------------------------------------------------
-- Journal of the accesses to sensitive sites (append-only)
-- -----------------------------------------------------------------------------
create table app.access_event (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  user_id uuid not null references app.user_account (id),
  site_id uuid not null,
  publication_id uuid,
  action text not null check (action in ('view', 'export', 'download_offline')),
  origin text not null check (origin in ('web', 'mobile', 'api', 'integration', 'import', 'worker', 'db')),
  sensitivity text not null check (sensitivity in ('restricted', 'high')),
  device_id uuid,
  client_event_id uuid,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check (client_event_id is null or device_id is not null),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  foreign key (tenant_id, device_id) references app.device (tenant_id, id)
);
comment on table app.access_event is
  'Consultations, exports and offline downloads of sensitive sites (cahier des charges §6.3, §7; ADR-025).';
create index access_event_tenant_time_idx on app.access_event (tenant_id, occurred_at desc, id);
create index access_event_site_time_idx on app.access_event (site_id, occurred_at desc);
create unique index access_event_client_uq on app.access_event (device_id, client_event_id)
  where client_event_id is not null;

create function app.tg_access_event_append_only() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'app.access_event is append-only (% refused)', tg_op using errcode = '42501';
end
$$;
create trigger access_event_no_update_delete before update or delete on app.access_event
for each row execute function app.tg_access_event_append_only();
create trigger access_event_no_truncate before truncate on app.access_event
for each statement execute function app.tg_access_event_append_only();

alter table app.access_event enable row level security;
alter table app.sensitive_habilitation enable row level security;
grant select on app.access_event, app.sensitive_habilitation to etare_api;
create policy access_event_select on app.access_event for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('audit:read')));
create policy sensitive_habilitation_select on app.sensitive_habilitation for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('member:manage'))
            or membership_id in (select m.id from app.membership m where m.user_id = (select app.current_user_id()))));

-- Records an access when the site (or the version consulted) is sensitive; returns the
-- effective sensitivity (null for a site unknown in the SIS). Web views of one person on
-- one site within five minutes count once; tablet events are idempotent by their id.
create function app.record_site_access(
  p_site_id uuid,
  p_publication_id uuid,
  p_action text,
  p_device_id uuid default null,
  p_client_event_id uuid default null,
  p_occurred_at timestamptz default null
)
returns text
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_site app.site;
  v_publication text;
  v_sensitivity text;
begin
  if v_tenant is null or app.current_user_id() is null then
    raise exception 'tenant context required' using errcode = '42501';
  end if;
  if p_action not in ('view', 'export', 'download_offline') then
    raise exception 'invalid access action' using errcode = '22023';
  end if;
  select * into v_site from app.site s where s.id = p_site_id and s.tenant_id = v_tenant;
  if not found then return null; end if;
  select p.sensitivity into v_publication from app.publication p
  where p.id = p_publication_id and p.site_id = v_site.id;
  v_sensitivity := app.effective_sensitivity(coalesce(v_publication, 'normal'), v_site.sensitivity);
  if v_sensitivity = 'normal' then return v_sensitivity; end if;
  if p_device_id is null and p_action = 'view' and exists (
    select 1 from app.access_event e
    where e.tenant_id = v_tenant and e.user_id = app.current_user_id() and e.site_id = v_site.id
      and e.action = 'view' and e.device_id is null and e.occurred_at > now() - interval '5 minutes'
  ) then
    return v_sensitivity;
  end if;
  insert into app.access_event (tenant_id, user_id, site_id, publication_id, action, origin, sensitivity,
                                device_id, client_event_id, occurred_at)
  values (v_tenant, app.current_user_id(), v_site.id,
          case when v_publication is null then null else p_publication_id end,
          p_action, app.current_origin(), v_sensitivity, p_device_id, p_client_event_id,
          -- A tablet clock is not trusted beyond a month back or five minutes ahead.
          least(greatest(coalesce(p_occurred_at, now()), now() - interval '30 days'), now() + interval '5 minutes'))
  on conflict (device_id, client_event_id) where client_event_id is not null do nothing;
  return v_sensitivity;
end
$$;

-- Journal of the SIS for the administration (audit:read), newest first.
create function app.access_journal(p_site_id uuid, p_before timestamptz, p_before_id uuid, p_limit integer)
returns table (
  id uuid, occurred_at timestamptz, recorded_at timestamptz, action text, origin text, sensitivity text,
  site_id uuid, site_name text, user_name text, device_name text, publication_number integer
)
language sql stable
security definer
set search_path = ''
as $$
  select e.id, e.occurred_at, e.recorded_at, e.action, e.origin, e.sensitivity, e.site_id, s.name,
         app.member_name(e.user_id), d.name, p.publication_number
  from app.access_event e
  join app.site s on s.id = e.site_id
  left join app.device d on d.id = e.device_id
  left join app.publication p on p.id = e.publication_id
  where e.tenant_id = app.current_tenant_id()
    and app.has_permission('audit:read')
    and (p_site_id is null or e.site_id = p_site_id)
    and (p_before is null or (e.occurred_at, e.id) < (p_before, p_before_id))
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

-- May the person export (PDF) this version of a sensitive site? The back-office roles of
-- the site, or a "restricted" site within a habilitation; any normal site.
create function app.publication_export_allowed(p_publication_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select case app.effective_sensitivity(p.sensitivity, s.sensitivity)
    when 'normal' then true
    when 'restricted' then app.has_permission('site:read') or app.has_permission('site:read', s.id)
                           or app.holds_sensitive_access(s.id)
    else app.has_permission('site:read') or app.has_permission('site:read', s.id)
  end
  from app.publication p
  join app.site s on s.tenant_id = p.tenant_id and s.id = p.site_id
  where p.id = p_publication_id and p.tenant_id = app.current_tenant_id()
$$;

-- -----------------------------------------------------------------------------
-- Distribution: normal sites in bulk, "restricted" sites on demand, never "high"
-- -----------------------------------------------------------------------------
create or replace function app.distributable_publication(p_publication app.publication, p_device_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select p_publication.tenant_id = app.current_tenant_id()
     and p_publication.status = 'published'
     and p_publication.manifest_signature is not null
     and app.device_covers_site(p_device_id, p_publication.site_id)
     and (app.has_permission('publication:read') or app.has_permission('publication:read', p_publication.site_id))
     and case app.effective_sensitivity(
                p_publication.sensitivity,
                (select s.sensitivity from app.site s where s.id = p_publication.site_id))
           when 'normal' then true
           when 'restricted' then app.holds_sensitive_access(p_publication.site_id)
           else false
         end
$$;

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
  with candidate as (
    select p.*, s.name as site_name, s.etare_number as site_etare_number,
           app.effective_sensitivity(p.sensitivity, s.sensitivity) as effective
    from app.publication p
    join app.site s on s.tenant_id = p.tenant_id and s.id = p.site_id
    where p.tenant_id = v_tenant and p.status = 'published' and p.manifest_signature is not null
      and s.status <> 'archived'
      and app.device_covers_site(p_device_id, p.site_id)
      and (v_tenant_wide or app.has_permission('publication:read', p.site_id))
  ),
  distributable as (
    select * from candidate where effective = 'normal'
  ),
  on_demand as (
    select * from candidate where effective = 'restricted' and app.holds_sensitive_access(site_id)
  ),
  held as (
    select s.id as site_id, s.name as site_name, s.status as site_status, s.archived_at, s.archive_reason,
           latest.status as latest_status, latest.withdrawn_at, latest.withdrawal_reason,
           app.effective_sensitivity(coalesce(latest.sensitivity, 'normal'), s.sensitivity) as effective
    from app.device_publication dp
    join app.site s on s.tenant_id = dp.tenant_id and s.id = dp.site_id
    left join lateral (
      select p.status, p.withdrawn_at, p.withdrawal_reason, p.sensitivity
      from app.publication p
      where p.site_id = s.id and p.status in ('published', 'superseded', 'withdrawn')
      order by p.publication_number desc limit 1
    ) latest on true
    where dp.device_id = p_device_id and dp.tenant_id = v_tenant
  ),
  entry as (
    select d.*, jsonb_build_object(
      'site_id', d.site_id,
      'publication_id', d.id,
      'publication_number', d.publication_number,
      'manifest_hash', d.manifest_hash,
      'published_at', d.published_at,
      'size_bytes', coalesce((
        select sum((f ->> 'size_bytes')::bigint) from jsonb_array_elements(d.manifest -> 'files') f
        where (f ->> 'required')::boolean), 0),
      'etare_number', d.site_etare_number,
      'site_name', d.site_name
    ) as json
    from candidate d
  )
  select jsonb_build_object(
    'generation', coalesce((select g.generation from app.distribution_generation g where g.tenant_id = v_tenant), 0),
    'tenant_name', (select t.name from app.tenant t where t.id = v_tenant),
    'publications', coalesce((
      select jsonb_agg(e.json order by lower(e.site_name), e.id) from entry e
      where e.id in (select d.id from distributable d)
    ), '[]'::jsonb),
    -- "restricted" sites offered on demand (PER-02): never installed in bulk.
    'on_demand', coalesce((
      select jsonb_agg(e.json order by lower(e.site_name), e.id) from entry e
      where e.id in (select o.id from on_demand o)
    ), '[]'::jsonb),
    -- Sites this terminal holds and loses: version withdrawn, site archived (MET-04), or
    -- out of the perimeter of the terminal or of the person (PER-01), or sensitive (PER-02).
    'withdrawals', coalesce((
      select jsonb_agg(jsonb_build_object('site_id', w.site_id, 'site_name', w.site_name, 'kind', w.kind,
                                          'at', w.at, 'reason', w.reason) order by w.at desc, w.site_id)
      from (
        select h.site_id, h.site_name,
               case when h.site_status = 'archived' then 'archived' else 'withdrawn' end as kind,
               case when h.site_status = 'archived' then h.archived_at else h.withdrawn_at end as at,
               case when h.site_status = 'archived' then h.archive_reason else h.withdrawal_reason end as reason
        from held h
        where (v_tenant_wide or app.has_permission('publication:read', h.site_id))
          and (
            (h.site_status = 'archived' and h.archived_at is not null and h.archive_reason is not null)
            or (h.site_status <> 'archived' and h.latest_status = 'withdrawn')
          )
        union all
        select h.site_id, h.site_name, 'perimeter', now(),
               case
                 when not app.device_covers_site(p_device_id, h.site_id) then 'Hors des secteurs de cette tablette.'
                 when not (v_tenant_wide or app.has_permission('publication:read', h.site_id))
                   then 'Hors de votre périmètre.'
                 when h.effective = 'restricted' and app.holds_sensitive_access(h.site_id)
                   then 'Site sensible : à ouvrir à la demande, avec votre code.'
                 else 'Site sensible : il n’est plus diffusé sur les tablettes.'
               end
        from held h
        where h.site_status <> 'archived' and h.latest_status = 'published'
          and not exists (select 1 from distributable d where d.site_id = h.site_id)
          and (
            not app.device_covers_site(p_device_id, h.site_id)
            or not (v_tenant_wide or app.has_permission('publication:read', h.site_id))
            or h.effective <> 'normal'
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

-- A site raised to sensitive leaves the bulk catalogue at once: its generation moves.
create function app.tg_site_sensitivity_generation() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.sensitivity is distinct from new.sensitivity then
    perform app.touch_distribution_generation(new.tenant_id);
  end if;
  return null;
end
$$;
create trigger site_sensitivity_generation after update of sensitivity on app.site
for each row execute function app.tg_site_sensitivity_generation();

grant execute on function
  app.effective_sensitivity(text, text),
  app.holds_sensitive_access(uuid),
  app.admin_set_sensitive_access(uuid, integer, uuid[], timestamptz),
  app.record_site_access(uuid, uuid, text, uuid, uuid, timestamptz),
  app.access_journal(uuid, timestamptz, uuid, integer),
  app.publication_export_allowed(uuid)
to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
