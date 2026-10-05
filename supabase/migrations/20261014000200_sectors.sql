-- =============================================================================
-- Sprint 10 — PER-01: sectors, perimeters of terminals and members (DEC-04, ADR-025).
--
--   * A sector is a named group of sites of the SIS: the sites of its communes
--     (INSEE code of their address, future sites included) and sites added one
--     by one. A site may belong to several sectors.
--   * A member may be limited to sectors or sites: their role bindings carry
--     that scope, and has_permission honours the sector scope. The roles of a
--     member share one perimeter; the administration of the SIS stays whole.
--   * A terminal is assigned to sectors or, explicitly, to the whole SIS. The
--     signed catalogue holds the intersection of its perimeter and of the
--     perimeter of the person who synchronises; what leaves it is removed at
--     the next contact with a readable reason ("perimeter").
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sectors
-- -----------------------------------------------------------------------------
create table app.sector (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  name text not null check (length(btrim(name)) between 1 and 120),
  code text check (code is null or length(btrim(code)) between 1 and 30),
  description text check (description is null or length(description) <= 500),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, id)
);
comment on table app.sector is 'Named group of sites of a SIS (CIS, groupement): perimeter of terminals and members (ADR-025).';
create unique index sector_name_uq on app.sector (tenant_id, lower(btrim(name))) where status = 'active';

call app.install_tenant_table_triggers('app.sector');
call app.install_audit_trigger('app.sector');

create table app.sector_commune (
  tenant_id uuid not null,
  sector_id uuid not null,
  insee_code text not null check (insee_code ~ '^[0-9][0-9AB][0-9]{3}$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (sector_id, insee_code),
  foreign key (tenant_id, sector_id) references app.sector (tenant_id, id)
);
comment on table app.sector_commune is 'Communes of a sector: every site whose address is in one of them belongs to it.';
create index sector_commune_insee_idx on app.sector_commune (tenant_id, insee_code);

create table app.sector_site (
  tenant_id uuid not null,
  sector_id uuid not null,
  site_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (sector_id, site_id),
  foreign key (tenant_id, sector_id) references app.sector (tenant_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id)
);
comment on table app.sector_site is 'Sites added one by one to a sector (outside its communes, or without INSEE code).';
create index sector_site_site_idx on app.sector_site (site_id);

-- Does a site belong to an active sector (one of its communes, or added by hand)?
create function app.site_in_sector(p_site_id uuid, p_sector_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.sector sc
    where sc.id = p_sector_id
      and sc.status = 'active'
      and (
        exists (select 1 from app.sector_site ss where ss.sector_id = sc.id and ss.site_id = p_site_id)
        or exists (
          select 1
          from app.site s
          join app.address a on a.tenant_id = s.tenant_id and a.id = s.address_id
          join app.sector_commune c on c.sector_id = sc.id and c.insee_code = a.insee_code
          where s.id = p_site_id and s.tenant_id = sc.tenant_id
        )
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- Permissions: the sector scope of role bindings
-- -----------------------------------------------------------------------------
create or replace function app.has_permission(p_permission text, p_site_id uuid default null) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select app.factor_scope_allows(p_permission) and exists (
    select 1
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    join app.role_binding rb
      on rb.membership_id = m.id
     and rb.tenant_id = m.tenant_id
     and rb.revoked_at is null
     and (rb.valid_until is null or rb.valid_until > now())
     and (
       rb.scope_type = 'tenant'
       or (rb.scope_type = 'site' and rb.scope_id = p_site_id)
       or (rb.scope_type = 'sector' and p_site_id is not null and app.site_in_sector(p_site_id, rb.scope_id))
     )
    join app.role_permission rp on rp.role_id = rb.role_id and rp.permission_code = p_permission
    join app.permission p on p.code = rp.permission_code
    where m.user_id = app.current_user_id()
      and m.tenant_id = app.current_tenant_id()
      and m.status = 'active'
      and (
        not p.requires_aal2
        or app.current_aal() = 'aal2'
        or not coalesce((t.settings ->> 'mfa_required_for_privileged')::boolean, true)
      )
      and (
        not p.portal_mfa
        or app.current_aal() = 'aal2'
        or not coalesce((t.settings ->> 'portal_mfa_required')::boolean, true)
      )
  )
$$;

-- Is the permission held on part of the SIS only (sectors or sites)? The API lets such
-- members in; row-level security then shows them their part only.
create function app.holds_permission_on_part(p_permission text) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select app.factor_scope_allows(p_permission) and exists (
    select 1
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    join app.role_binding rb
      on rb.membership_id = m.id
     and rb.tenant_id = m.tenant_id
     and rb.revoked_at is null
     and (rb.valid_until is null or rb.valid_until > now())
     and rb.scope_type in ('sector', 'site')
    join app.role_permission rp on rp.role_id = rb.role_id and rp.permission_code = p_permission
    join app.permission p on p.code = rp.permission_code
    where m.user_id = app.current_user_id()
      and m.tenant_id = app.current_tenant_id()
      and m.status = 'active'
      and (
        not p.requires_aal2
        or app.current_aal() = 'aal2'
        or not coalesce((t.settings ->> 'mfa_required_for_privileged')::boolean, true)
      )
      and (
        not p.portal_mfa
        or app.current_aal() = 'aal2'
        or not coalesce((t.settings ->> 'portal_mfa_required')::boolean, true)
      )
  )
$$;

-- MFA_REQUIRED rather than FORBIDDEN also for a member limited to sectors or sites.
create or replace function app.holds_with_second_factor(p_permission text) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    join app.role_binding rb
      on rb.membership_id = m.id
     and rb.revoked_at is null
     and (rb.valid_until is null or rb.valid_until > now())
    join app.role_permission rp on rp.role_id = rb.role_id and rp.permission_code = p_permission
    where m.user_id = app.current_user_id()
      and m.tenant_id = app.current_tenant_id()
      and m.status = 'active'
  )
$$;

-- A sector scope names an active sector of the same SIS; a site scope a site of it.
create function app.tg_role_binding_scope() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scope_type = 'sector' and not exists (
    select 1 from app.sector s where s.id = new.scope_id and s.tenant_id = new.tenant_id and s.status = 'active'
  ) then
    raise exception 'unknown sector' using errcode = '23503';
  end if;
  if new.scope_type = 'site' and not exists (
    select 1 from app.site s where s.id = new.scope_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'unknown site' using errcode = '23503';
  end if;
  return new;
end
$$;
create trigger role_binding_scope before insert on app.role_binding
for each row execute function app.tg_role_binding_scope();

-- -----------------------------------------------------------------------------
-- Perimeter of the terminals
-- -----------------------------------------------------------------------------
alter table app.device
  add column scope text not null default 'tenant' check (scope in ('tenant', 'sectors'));
comment on column app.device.scope is
  'Synchronisation profile: the whole SIS (explicit) or the sectors of device_sector (maquette, screen 11).';

create table app.device_sector (
  tenant_id uuid not null,
  device_id uuid not null,
  sector_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (device_id, sector_id),
  foreign key (tenant_id, device_id) references app.device (tenant_id, id),
  foreign key (tenant_id, sector_id) references app.sector (tenant_id, id)
);
create index device_sector_sector_idx on app.device_sector (sector_id);

-- Does the perimeter of a terminal cover a site?
create function app.device_covers_site(p_device_id uuid, p_site_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.device d
    where d.id = p_device_id
      and (
        d.scope = 'tenant'
        or exists (
          select 1 from app.device_sector ds
          where ds.device_id = d.id and app.site_in_sector(p_site_id, ds.sector_id)
        )
      )
  )
$$;

-- The catalogue generation also moves when a perimeter changes: the administration sees
-- which terminals still have to pick it up.
create function app.touch_distribution_generation(p_tenant_id uuid) returns void
language sql volatile
security definer
set search_path = ''
as $$
  insert into app.distribution_generation as g (tenant_id, generation, changed_at)
  values (p_tenant_id, 1, now())
  on conflict (tenant_id) do update set generation = g.generation + 1, changed_at = now()
$$;

-- -----------------------------------------------------------------------------
-- Grants and RLS: the administration reads; every write goes through functions.
-- -----------------------------------------------------------------------------
alter table app.sector enable row level security;
alter table app.sector_commune enable row level security;
alter table app.sector_site enable row level security;
alter table app.device_sector enable row level security;

grant select on app.sector, app.sector_commune, app.sector_site, app.device_sector to etare_api;

create policy sector_select on app.sector for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('member:manage')) or (select app.has_permission('device:manage'))));
create policy sector_commune_select on app.sector_commune for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('member:manage')) or (select app.has_permission('device:manage'))));
create policy sector_site_select on app.sector_site for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('member:manage')) or (select app.has_permission('device:manage'))));
create policy device_sector_select on app.device_sector for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('device:manage')));

-- -----------------------------------------------------------------------------
-- Administration of the sectors (member:manage, second factor through has_permission)
-- -----------------------------------------------------------------------------
-- Creates (p_sector_id null) or updates a sector and replaces its communes and sites.
-- p_communes: [{"insee_code": "06088", "label": "Nice"}]. Returns the new version.
create function app.admin_save_sector(
  p_sector_id uuid,
  p_expected_version integer,
  p_name text,
  p_code text,
  p_description text,
  p_communes jsonb,
  p_site_ids uuid[]
)
returns table (sector_id uuid, row_version integer)
language plpgsql volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_member_manager();
  v_sector app.sector;
  v_before jsonb;
begin
  if p_communes is null or jsonb_typeof(p_communes) <> 'array' or jsonb_array_length(p_communes) > 500
     or cardinality(coalesce(p_site_ids, '{}')) > 2000 then
    raise exception 'invalid sector composition' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_site_ids, '{}')) w (site_id)
    where not exists (select 1 from app.site s where s.id = w.site_id and s.tenant_id = v_tenant)
  ) then
    raise exception 'unknown site' using errcode = '23503';
  end if;

  if p_sector_id is null then
    insert into app.sector (tenant_id, name, code, description)
    values (v_tenant, btrim(p_name), nullif(btrim(p_code), ''), nullif(btrim(p_description), ''))
    returning * into v_sector;
  else
    select * into v_sector from app.sector s where s.id = p_sector_id and s.tenant_id = v_tenant for update;
    if not found then raise exception 'sector not found' using errcode = 'ETS04'; end if;
    if v_sector.row_version <> p_expected_version then raise exception 'stale sector' using errcode = 'ETS12'; end if;
    if v_sector.status <> 'active' then raise exception 'archived sector' using errcode = 'ETS09'; end if;
    v_before := jsonb_build_object(
      'communes', (select coalesce(jsonb_agg(c.insee_code order by c.insee_code), '[]') from app.sector_commune c where c.sector_id = v_sector.id),
      'sites', (select count(*) from app.sector_site ss where ss.sector_id = v_sector.id)
    );
    update app.sector s
    set name = btrim(p_name), code = nullif(btrim(p_code), ''), description = nullif(btrim(p_description), '')
    where s.id = v_sector.id
    returning * into v_sector;
    delete from app.sector_commune c where c.sector_id = v_sector.id;
    delete from app.sector_site ss where ss.sector_id = v_sector.id;
  end if;

  insert into app.sector_commune (tenant_id, sector_id, insee_code, label)
  select distinct on (c ->> 'insee_code') v_tenant, v_sector.id, c ->> 'insee_code', btrim(c ->> 'label')
  from jsonb_array_elements(p_communes) c;
  insert into app.sector_site (tenant_id, sector_id, site_id)
  select distinct v_tenant, v_sector.id, w.site_id from unnest(coalesce(p_site_ids, '{}')) w (site_id);

  perform app.record_audit_event(
    'sector.composition', 'sector', v_sector.id, 'success', null,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'communes', (select coalesce(jsonb_agg(c.insee_code order by c.insee_code), '[]') from app.sector_commune c where c.sector_id = v_sector.id),
        'sites', (select count(*) from app.sector_site ss where ss.sector_id = v_sector.id)
      )
    )
  );
  perform app.touch_distribution_generation(v_tenant);
  return query select v_sector.id, v_sector.row_version;
end
$$;

-- Archives a sector no member nor terminal uses any more (reassign them first).
create function app.admin_archive_sector(p_sector_id uuid, p_expected_version integer) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_member_manager();
  v_sector app.sector;
  v_version integer;
begin
  select * into v_sector from app.sector s where s.id = p_sector_id and s.tenant_id = v_tenant for update;
  if not found then raise exception 'sector not found' using errcode = 'ETS04'; end if;
  if v_sector.row_version <> p_expected_version then raise exception 'stale sector' using errcode = 'ETS12'; end if;
  if v_sector.status <> 'active' then raise exception 'archived sector' using errcode = 'ETS09'; end if;
  if exists (
       select 1 from app.role_binding rb
       where rb.scope_type = 'sector' and rb.scope_id = v_sector.id and rb.revoked_at is null
         and (rb.valid_until is null or rb.valid_until > now())
     )
     or exists (
       select 1 from app.device_sector ds join app.device d on d.id = ds.device_id
       where ds.sector_id = v_sector.id and d.status <> 'revoked'
     ) then
    raise exception 'sector still assigned to members or terminals' using errcode = 'ETSCU';
  end if;
  update app.sector s set status = 'archived' where s.id = v_sector.id returning s.row_version into v_version;
  perform app.touch_distribution_generation(v_tenant);
  return v_version;
end
$$;

-- Sectors of the SIS with their size and use, for the administration.
create function app.admin_sectors()
returns table (
  id uuid, name text, code text, description text, row_version integer,
  communes jsonb, sites jsonb, site_count bigint, member_count bigint, device_count bigint
)
language sql stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.code, s.description, s.row_version,
    coalesce((select jsonb_agg(jsonb_build_object('insee_code', c.insee_code, 'label', c.label) order by c.label)
              from app.sector_commune c where c.sector_id = s.id), '[]'),
    coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by lower(x.name), x.id)
              from app.sector_site ss join app.site x on x.id = ss.site_id where ss.sector_id = s.id), '[]'),
    (select count(*) from app.site x where x.tenant_id = s.tenant_id and x.status <> 'archived'
       and app.site_in_sector(x.id, s.id)),
    (select count(distinct rb.membership_id) from app.role_binding rb
       where rb.scope_type = 'sector' and rb.scope_id = s.id and rb.revoked_at is null
         and (rb.valid_until is null or rb.valid_until > now())),
    (select count(*) from app.device_sector ds join app.device d on d.id = ds.device_id
       where ds.sector_id = s.id and d.status <> 'revoked')
  from app.sector s
  where s.tenant_id = app.current_tenant_id() and s.status = 'active'
    and (app.has_permission('member:manage') or app.has_permission('device:manage'))
  order by lower(s.name), s.id
$$;

-- Communes of the sites of the SIS (picker of the sectors) and the sites outside any sector.
create function app.admin_sector_communes()
returns table (insee_code text, label text, site_count bigint)
language sql stable
security definer
set search_path = ''
as $$
  select a.insee_code, min(a.city), count(distinct s.id)
  from app.site s
  join app.address a on a.tenant_id = s.tenant_id and a.id = s.address_id
  where s.tenant_id = app.current_tenant_id() and s.status <> 'archived' and a.insee_code is not null
    and app.has_permission('member:manage')
  group by a.insee_code
  order by min(a.city), a.insee_code
$$;

create function app.admin_sites_outside_sectors() returns bigint
language sql stable
security definer
set search_path = ''
as $$
  select count(*)
  from app.site s
  where s.tenant_id = app.current_tenant_id() and s.status <> 'archived'
    and (app.has_permission('member:manage') or app.has_permission('device:manage'))
    and not exists (
      select 1 from app.sector sc where sc.tenant_id = s.tenant_id and sc.status = 'active'
        and app.site_in_sector(s.id, sc.id)
    )
$$;

-- -----------------------------------------------------------------------------
-- Perimeter of a terminal (device:manage): no sector means the whole SIS, explicitly.
-- -----------------------------------------------------------------------------
create function app.admin_set_device_perimeter(p_device_id uuid, p_expected_version integer, p_sector_ids uuid[])
returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_device_manager();
  v_device app.device;
  v_sectors uuid[] := array(select distinct unnest(coalesce(p_sector_ids, '{}')));
  v_before jsonb;
  v_version integer;
begin
  select * into v_device from app.device d where d.id = p_device_id and d.tenant_id = v_tenant for update;
  if not found then raise exception 'terminal not found' using errcode = 'ETD04'; end if;
  if v_device.row_version <> p_expected_version then raise exception 'stale terminal' using errcode = 'ETD12'; end if;
  if v_device.status = 'revoked' then raise exception 'a revoked terminal never changes' using errcode = 'ETD09'; end if;
  if exists (
    select 1 from unnest(v_sectors) w (sector_id)
    where not exists (select 1 from app.sector s where s.id = w.sector_id and s.tenant_id = v_tenant and s.status = 'active')
  ) then
    raise exception 'unknown sector' using errcode = '23503';
  end if;
  v_before := jsonb_build_object('scope', v_device.scope,
    'sectors', (select coalesce(jsonb_agg(ds.sector_id order by ds.sector_id), '[]') from app.device_sector ds where ds.device_id = v_device.id));
  delete from app.device_sector ds where ds.device_id = v_device.id;
  insert into app.device_sector (tenant_id, device_id, sector_id)
  select v_tenant, v_device.id, w.sector_id from unnest(v_sectors) w (sector_id);
  -- Always touches the terminal: the change of perimeter bumps its version.
  update app.device d
  set scope = case when cardinality(v_sectors) = 0 then 'tenant' else 'sectors' end
  where d.id = v_device.id
  returning d.row_version into v_version;
  perform app.record_audit_event(
    'device.perimeter', 'device', v_device.id, 'success', null,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object(
      'scope', case when cardinality(v_sectors) = 0 then 'tenant' else 'sectors' end,
      'sectors', (select coalesce(jsonb_agg(s order by s), '[]') from unnest(v_sectors) s)))
  );
  perform app.touch_distribution_generation(v_tenant);
  return v_version;
end
$$;

-- -----------------------------------------------------------------------------
-- Perimeter of a member (member:manage): every role of the member (exploitant and
-- portal bindings apart) is limited to the given sectors and sites, or to none:
-- the whole SIS. The administration of the SIS is never limited.
-- -----------------------------------------------------------------------------
create function app.member_perimeter_scopes(p_membership_id uuid) returns table (scope_type text, scope_id uuid)
language sql stable
security definer
set search_path = ''
as $$
  select distinct rb.scope_type, rb.scope_id
  from app.role_binding rb
  join app.role r on r.id = rb.role_id and r.code <> 'EXPLOITANT'
  where rb.membership_id = p_membership_id and rb.revoked_at is null
    and (rb.valid_until is null or rb.valid_until > now())
$$;

-- Brings the non-exploitant bindings of a member to roles x scopes (internal): bindings
-- still wanted are kept, the others revoked (history kept), the missing ones created.
-- No scope means the whole SIS.
create function app.rebind_member(p_tenant_id uuid, p_membership_id uuid, p_role_ids uuid[], p_scopes jsonb)
returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.current_user_id();
begin
  if jsonb_array_length(p_scopes) > 0 and exists (
    select 1 from app.role r where r.id = any (p_role_ids) and r.code = 'SIS_ADMIN'
  ) then
    raise exception 'the administration of a SIS holds the whole SIS' using errcode = 'ETSCP';
  end if;
  -- One statement: the insertion does not see the revocations (a revoked binding is never wanted).
  with wanted as (
    select w.role_id, coalesce(s ->> 'scope_type', 'tenant') as scope_type, (s ->> 'scope_id')::uuid as scope_id
    from unnest(p_role_ids) w (role_id)
    left join jsonb_array_elements(case when jsonb_array_length(p_scopes) = 0 then null else p_scopes end) s on true
  ),
  revoked as (
    update app.role_binding b
    set revoked_at = now(), revoked_by = v_actor
    from app.role r
    where r.id = b.role_id and r.code <> 'EXPLOITANT'
      and b.membership_id = p_membership_id and b.revoked_at is null
      and not exists (
        select 1 from wanted w
        where w.role_id = b.role_id and w.scope_type = b.scope_type and w.scope_id is not distinct from b.scope_id
      )
    returning b.id
  )
  insert into app.role_binding (tenant_id, membership_id, role_id, scope_type, scope_id, created_by)
  select p_tenant_id, p_membership_id, w.role_id, w.scope_type, w.scope_id, v_actor
  from wanted w
  where not exists (
    select 1 from app.role_binding b
    where b.membership_id = p_membership_id and b.revoked_at is null and b.role_id = w.role_id
      and b.scope_type = w.scope_type and b.scope_id is not distinct from w.scope_id
  );
  perform app.touch_distribution_generation(p_tenant_id);
end
$$;

create function app.admin_set_member_perimeter(
  p_membership_id uuid,
  p_expected_version integer,
  p_sector_ids uuid[],
  p_site_ids uuid[]
)
returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_member_manager();
  v_membership app.membership;
  v_role_ids uuid[];
  v_scopes jsonb;
  v_before jsonb;
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
  if exists (
    select 1 from unnest(coalesce(p_sector_ids, '{}')) w (id)
    where not exists (select 1 from app.sector s where s.id = w.id and s.tenant_id = v_tenant and s.status = 'active')
  ) or exists (
    select 1 from unnest(coalesce(p_site_ids, '{}')) w (id)
    where not exists (select 1 from app.site s where s.id = w.id and s.tenant_id = v_tenant)
  ) then
    raise exception 'unknown sector or site' using errcode = '23503';
  end if;
  if cardinality(coalesce(p_sector_ids, '{}')) + cardinality(coalesce(p_site_ids, '{}')) > 200 then
    raise exception 'perimeter too large: use sectors' using errcode = '22023';
  end if;

  v_before := (select coalesce(jsonb_agg(jsonb_build_object('scope_type', p.scope_type, 'scope_id', p.scope_id)), '[]')
               from app.member_perimeter_scopes(v_membership.id) p where p.scope_type <> 'tenant');
  v_role_ids := array(
    select distinct rb.role_id from app.role_binding rb join app.role r on r.id = rb.role_id
    where rb.membership_id = v_membership.id and rb.revoked_at is null and r.code <> 'EXPLOITANT'
      and (rb.valid_until is null or rb.valid_until > now())
  );
  v_scopes := (
    select coalesce(jsonb_agg(x), '[]') from (
      select jsonb_build_object('scope_type', 'sector', 'scope_id', s) as x from (select distinct unnest(coalesce(p_sector_ids, '{}')) s) a
      union all
      select jsonb_build_object('scope_type', 'site', 'scope_id', s) from (select distinct unnest(coalesce(p_site_ids, '{}')) s) b
    ) z
  );
  perform app.rebind_member(v_tenant, v_membership.id, v_role_ids, v_scopes);

  update app.membership m set status = m.status where m.id = v_membership.id returning m.row_version into v_version;
  perform app.record_audit_event(
    'member.perimeter', 'membership', v_membership.id, 'success', null,
    jsonb_build_object('before', v_before, 'after', v_scopes)
  );
  perform app.assert_tenant_keeps_admin(v_tenant);
  return v_version;
end
$$;

-- Roles change within the current perimeter of the member.
create or replace function app.admin_update_member(
  p_membership_id uuid,
  p_expected_version integer,
  p_roles text[] default null,
  p_status text default null
)
returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_member_manager();
  v_actor uuid := app.current_user_id();
  v_membership app.membership;
  v_role_ids uuid[];
  v_current uuid[];
  v_scopes jsonb;
  v_version integer;
begin
  select * into v_membership
  from app.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member not found' using errcode = 'ET404';
  end if;
  if v_membership.user_id = v_actor then
    raise exception 'nobody changes their own membership' using errcode = 'ETSLF';
  end if;
  if v_membership.row_version <> p_expected_version then
    raise exception 'stale member version' using errcode = 'ET412';
  end if;
  if p_status is not null and p_status not in ('active', 'suspended') then
    raise exception 'invalid member status' using errcode = '22023';
  end if;

  if p_roles is not null then
    v_role_ids := app.grantable_role_ids(p_roles, true);
    v_current := array(
      select distinct rb.role_id from app.role_binding rb join app.role r on r.id = rb.role_id
      where rb.membership_id = v_membership.id and rb.revoked_at is null and r.code <> 'EXPLOITANT'
        and (rb.valid_until is null or rb.valid_until > now())
    );
    if not (v_role_ids @> v_current and v_current @> v_role_ids) then
      v_scopes := (
        select coalesce(jsonb_agg(jsonb_build_object('scope_type', p.scope_type, 'scope_id', p.scope_id)), '[]')
        from app.member_perimeter_scopes(v_membership.id) p where p.scope_type <> 'tenant'
      );
      perform app.rebind_member(v_tenant, v_membership.id, v_role_ids, v_scopes);
    end if;
  end if;

  -- Always touches the membership: any change of roles or status bumps its version.
  update app.membership m
  set status = coalesce(p_status, m.status)
  where m.id = v_membership.id
  returning m.row_version into v_version;

  -- A suspension takes effect at once: every session of the person is closed (all SIS:
  -- a session is not tied to one SIS; the person signs in again where still a member).
  if p_status = 'suspended' and v_membership.status <> 'suspended' then
    perform app.record_audit_event(
      'member.sessions_revoke', 'membership', v_membership.id, 'success', null,
      jsonb_build_object('count', app.idp_revoke_sessions(u.auth_provider, u.auth_subject))
    )
    from app.user_account u where u.id = v_membership.user_id;
  end if;

  perform app.assert_tenant_keeps_admin(v_tenant);
  return v_version;
end
$$;

-- -----------------------------------------------------------------------------
-- Distribution: the intersection of the perimeters of the terminal and of the person
-- -----------------------------------------------------------------------------
create or replace function app.require_offline_download() returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if app.current_tenant_id() is null
     or not (app.has_permission('offline:download') or app.holds_permission_on_part('offline:download')) then
    raise exception 'offline:download required' using errcode = '42501';
  end if;
  return app.current_tenant_id();
end
$$;

-- Publications a terminal may hold: published, signed, not sensitive, in the perimeter of
-- the terminal and readable by the person.
create function app.distributable_publication(p_publication app.publication, p_device_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select p_publication.tenant_id = app.current_tenant_id()
     and p_publication.status = 'published'
     and p_publication.manifest_signature is not null
     and p_publication.sensitivity = 'normal'
     and app.device_covers_site(p_device_id, p_publication.site_id)
     and (app.has_permission('publication:read') or app.has_permission('publication:read', p_publication.site_id))
$$;

create or replace function app.sync_package(p_device_id uuid, p_publication_id uuid)
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
  where p.id = p_publication_id and app.distributable_publication(p, p_device_id);
end
$$;

create or replace function app.sync_package_files(p_device_id uuid, p_publication_id uuid, p_sha256 text[])
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
  if not found or not app.distributable_publication(v_publication, p_device_id) then
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

drop function app.distributable_publication(app.publication);

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
  with distributable as (
    select p.*, s.name as site_name, s.etare_number as site_etare_number
    from app.publication p
    join app.site s on s.tenant_id = p.tenant_id and s.id = p.site_id
    where p.tenant_id = v_tenant and p.status = 'published' and p.manifest_signature is not null
      and p.sensitivity = 'normal' and s.status <> 'archived'
      and app.device_covers_site(p_device_id, p.site_id)
      and (v_tenant_wide or app.has_permission('publication:read', p.site_id))
  ),
  held as (
    select s.id as site_id, s.name as site_name, s.status as site_status, s.archived_at, s.archive_reason,
           latest.status as latest_status, latest.withdrawn_at, latest.withdrawal_reason, latest.sensitivity
    from app.device_publication dp
    join app.site s on s.tenant_id = dp.tenant_id and s.id = dp.site_id
    left join lateral (
      select p.status, p.withdrawn_at, p.withdrawal_reason, p.sensitivity
      from app.publication p
      where p.site_id = s.id and p.status in ('published', 'superseded', 'withdrawn')
      order by p.publication_number desc limit 1
    ) latest on true
    where dp.device_id = p_device_id and dp.tenant_id = v_tenant
  )
  select jsonb_build_object(
    'generation', coalesce((select g.generation from app.distribution_generation g where g.tenant_id = v_tenant), 0),
    'tenant_name', (select t.name from app.tenant t where t.id = v_tenant),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object(
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
      ) order by lower(d.site_name), d.id)
      from distributable d
    ), '[]'::jsonb),
    -- Sites this terminal holds and loses: version withdrawn, site archived (MET-04), or
    -- out of the perimeter of the terminal or of the person (PER-01).
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
                 else 'Site sensible : il n’est plus diffusé sur les tablettes.'
               end
        from held h
        where h.site_status <> 'archived' and h.latest_status = 'published'
          and not exists (select 1 from distributable d where d.site_id = h.site_id)
          and (
            not app.device_covers_site(p_device_id, h.site_id)
            or not (v_tenant_wide or app.has_permission('publication:read', h.site_id))
            or h.sensitivity <> 'normal'
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

-- -----------------------------------------------------------------------------
-- Profile: is the person limited to part of each SIS (the web then hides what needs
-- the whole SIS, such as creating a site)?
-- -----------------------------------------------------------------------------
drop function app.my_memberships();

create function app.my_memberships()
returns table (tenant_id uuid, tenant_slug text, tenant_name text, roles text[], second_factor_required boolean,
               limited boolean)
language sql stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.name,
         coalesce(array_agg(distinct r.code order by r.code) filter (where r.code is not null), '{}'),
         app.second_factor_required_by_policy(t.id, m.user_id),
         coalesce(bool_or(rb.scope_type <> 'tenant') filter (where r.code <> 'EXPLOITANT'), false)
           and not coalesce(bool_or(rb.scope_type = 'tenant'), false)
  from app.membership m
  join app.tenant t on t.id = m.tenant_id and t.status = 'active'
  left join app.role_binding rb
    on rb.membership_id = m.id
   and rb.revoked_at is null
   and (rb.valid_until is null or rb.valid_until > now())
  left join app.role r on r.id = rb.role_id
  where m.user_id = app.current_user_id()
    and m.status = 'active'
  group by t.id, t.slug, t.name, m.user_id
  order by t.name
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function
  app.site_in_sector(uuid, uuid),
  app.holds_permission_on_part(text),
  app.device_covers_site(uuid, uuid),
  app.admin_save_sector(uuid, integer, text, text, text, jsonb, uuid[]),
  app.admin_archive_sector(uuid, integer),
  app.admin_sectors(),
  app.admin_sector_communes(),
  app.admin_sites_outside_sectors(),
  app.admin_set_device_perimeter(uuid, integer, uuid[]),
  app.admin_set_member_perimeter(uuid, integer, uuid[], uuid[]),
  app.distributable_publication(app.publication, uuid),
  app.my_memberships()
to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
