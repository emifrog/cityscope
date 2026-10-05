-- =============================================================================
-- Sprint 12 — CAP-01: cost of the perimeters measured on 10 000 sites
-- (docs/volumetrie/cap-01.md).
--
-- A member limited to sectors or sites paid one call of has_permission per row
-- read, each one walking the bindings and the sector membership of the site:
-- linear in the number of rows, beyond the 5 s statement limit at 8 000 sites.
-- The sites a person reaches through site or sector bindings are now computed
-- once per statement (app.permitted_site_ids, a hashed subplan in the policies);
-- the sites of a sector and of a terminal likewise (app.sector_site_ids,
-- app.device_site_ids) for the catalogue, the base maps and the administration.
-- Same rules as before (has_permission, site_in_sector): only their evaluation
-- changes. The scalar functions stay for the checks of a single site.
--
-- Also measured and corrected here: the permissions of each request in one
-- query (current_permissions), has_permission in PL/pgSQL (its plan kept for the
-- connection), and the text search of the sites through the trigram indexes,
-- which ILIKE under RLS never used (app.site_ids_matching).
-- =============================================================================

-- The commune path of a sector: sites by the INSEE code of their address.
create index if not exists address_insee_idx on app.address (tenant_id, insee_code);
create index if not exists site_address_idx on app.site (tenant_id, address_id);

-- Sites of an active sector: its communes, and the sites added one by one.
create function app.sector_site_ids(p_sector_id uuid) returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select ss.site_id
  from app.sector sc
  join app.sector_site ss on ss.sector_id = sc.id
  where sc.id = p_sector_id and sc.status = 'active'
  union
  select s.id
  from app.sector sc
  join app.sector_commune c on c.sector_id = sc.id
  join app.address a on a.tenant_id = sc.tenant_id and a.insee_code = c.insee_code
  join app.site s on s.tenant_id = a.tenant_id and s.address_id = a.id
  where sc.id = p_sector_id and sc.status = 'active'
$$;

-- Sites of the current SIS the current person reaches for a permission through its site or
-- sector bindings (the bindings on the whole SIS are checked apart, once: has_permission(p)).
create function app.permitted_site_ids(p_permission text) returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  with binding as (
    select rb.scope_type, rb.scope_id
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    join app.role_binding rb
      on rb.membership_id = m.id
     and rb.tenant_id = m.tenant_id
     and rb.revoked_at is null
     and (rb.valid_until is null or rb.valid_until > now())
     and rb.scope_type in ('site', 'sector')
    join app.role_permission rp on rp.role_id = rb.role_id and rp.permission_code = p_permission
    join app.permission p on p.code = rp.permission_code
    where app.factor_scope_allows(p_permission)
      and m.user_id = app.current_user_id()
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
  select b.scope_id from binding b where b.scope_type = 'site'
  union
  select site_id from binding b cross join lateral app.sector_site_ids(b.scope_id) as site_id
  where b.scope_type = 'sector'
$$;

-- Sites covered by a terminal limited to sectors (a terminal of the whole SIS is checked apart).
create function app.device_site_ids(p_device_id uuid) returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select site_id
  from app.device_sector ds cross join lateral app.sector_site_ids(ds.sector_id) as site_id
  where ds.device_id = p_device_id
$$;

-- -----------------------------------------------------------------------------
-- Row-level security: the per-row call becomes a membership test in a set computed once.
-- -----------------------------------------------------------------------------
do $$
declare
  v_policy record;
  v_pattern constant text := 'app\.has_permission\((''[a-z_:]+''::text), ([a-z_]+)\)';
  v_replacement constant text := '(\2 IN ( SELECT app.permitted_site_ids(\1) AS permitted_site_ids))';
  v_using text;
  v_check text;
begin
  for v_policy in
    select p.tablename, p.policyname, p.qual, p.with_check
    from pg_catalog.pg_policies p
    where p.schemaname = 'app' and (p.qual ~ v_pattern or p.with_check ~ v_pattern)
  loop
    v_using := regexp_replace(v_policy.qual, v_pattern, v_replacement, 'g');
    v_check := regexp_replace(v_policy.with_check, v_pattern, v_replacement, 'g');
    execute format(
      'alter policy %I on app.%I %s %s',
      v_policy.policyname, v_policy.tablename,
      case when v_using is null then '' else 'using (' || v_using || ')' end,
      case when v_check is null then '' else 'with check (' || v_check || ')' end
    );
  end loop;
end
$$;

-- Policies of the tables to come follow the same form.
create or replace procedure app.install_site_scoped_policies(
  p_table regclass,
  p_read_permission text,
  p_write_permission text,
  p_site_column text default 'site_id'
)
language plpgsql
set search_path = ''
as $$
declare
  v_name text := replace(p_table::text, 'app.', '');
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('grant select, insert, update on %s to etare_api', p_table);
  execute format(
    'create policy %I on %s for select to etare_api using (
       tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission(%L)) or %I in (select app.permitted_site_ids(%L))))',
    v_name || '_select', p_table, p_read_permission, p_site_column, p_read_permission);
  execute format(
    'create policy %I on %s for insert to etare_api with check (
       tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission(%L)) or %I in (select app.permitted_site_ids(%L))))',
    v_name || '_insert', p_table, p_write_permission, p_site_column, p_write_permission);
  execute format(
    'create policy %I on %s for update to etare_api
       using (tenant_id = (select app.current_tenant_id())
              and ((select app.has_permission(%L)) or %I in (select app.permitted_site_ids(%L))))
       with check (tenant_id = (select app.current_tenant_id())
              and ((select app.has_permission(%L)) or %I in (select app.permitted_site_ids(%L))))',
    v_name || '_update', p_table,
    p_write_permission, p_site_column, p_write_permission,
    p_write_permission, p_site_column, p_write_permission);
end
$$;

-- -----------------------------------------------------------------------------
-- Catalogue of a terminal: perimeter of the terminal and of the person as sets.
-- -----------------------------------------------------------------------------
create or replace function app.sync_catalog(p_device_id uuid, p_app_version text) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_tenant_wide boolean := app.has_permission('publication:read');
  v_device_wide boolean := (select d.scope = 'tenant' from app.device d where d.id = p_device_id);
  v_catalog jsonb;
begin
  with device_sites as (
    select app.device_site_ids(p_device_id) as site_id
  ),
  person_sites as (
    select app.permitted_site_ids('publication:read') as site_id
  ),
  candidate as (
    select p.*, s.name as site_name, s.etare_number as site_etare_number,
           app.effective_sensitivity(p.sensitivity, s.sensitivity) as effective
    from app.publication p
    join app.site s on s.tenant_id = p.tenant_id and s.id = p.site_id
    where p.tenant_id = v_tenant and p.status = 'published' and p.manifest_signature is not null
      and s.status <> 'archived'
      and (v_device_wide or p.site_id in (select site_id from device_sites))
      and (v_tenant_wide or p.site_id in (select site_id from person_sites))
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
           app.effective_sensitivity(coalesce(latest.sensitivity, 'normal'), s.sensitivity) as effective,
           (v_device_wide or s.id in (select site_id from device_sites)) as covered,
           (v_tenant_wide or s.id in (select site_id from person_sites)) as readable
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
        where h.readable
          and (
            (h.site_status = 'archived' and h.archived_at is not null and h.archive_reason is not null)
            or (h.site_status <> 'archived' and h.latest_status = 'withdrawn')
          )
        union all
        select h.site_id, h.site_name, 'perimeter', now(),
               case
                 when not h.covered then 'Hors des secteurs de cette tablette.'
                 when not h.readable then 'Hors de votre périmètre.'
                 when h.effective = 'restricted' and app.holds_sensitive_access(h.site_id)
                   then 'Site sensible : à ouvrir à la demande, avec votre code.'
                 else 'Site sensible : il n’est plus diffusé sur les tablettes.'
               end
        from held h
        where h.site_status <> 'archived' and h.latest_status = 'published'
          and not exists (select 1 from distributable d where d.site_id = h.site_id)
          and (not h.covered or not h.readable or h.effective <> 'normal')
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
-- Base maps and administration of the sectors: the sites of a sector as a set.
-- -----------------------------------------------------------------------------
create or replace function app.basemap_coverage(p_sector_id uuid) returns jsonb
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
    where s.status <> 'archived' and s.geom is not null
      and s.id in (select app.sector_site_ids(p_sector_id))
  ),
  detail as (
    select distinct round(extensions.st_x(l.geom)::numeric, 5) as lon, round(extensions.st_y(l.geom)::numeric, 5) as lat
    from located l
    where exists (
      select 1 from app.publication p
      where p.site_id = l.id and p.status = 'published' and p.manifest_signature is not null
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

create or replace function app.admin_sectors()
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
       and x.id in (select app.sector_site_ids(s.id))),
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

create or replace function app.admin_sites_outside_sectors() returns bigint
language sql stable
security definer
set search_path = ''
as $$
  select count(*)
  from app.site s
  where s.tenant_id = app.current_tenant_id() and s.status <> 'archived'
    and (app.has_permission('member:manage') or app.has_permission('device:manage'))
    and s.id not in (
      select site_id from app.sector sc cross join lateral app.sector_site_ids(sc.id) as site_id
      where sc.tenant_id = app.current_tenant_id() and sc.status = 'active'
    )
$$;

-- -----------------------------------------------------------------------------
-- Permissions of each request (begin_request): one query instead of one call of
-- has_permission per permission code (about 5 ms per request on the bench).
-- Same rule: the permissions held on the whole SIS, with the second factor they need.
-- -----------------------------------------------------------------------------
create or replace function app.current_permissions() returns text[]
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.code order by p.code), '{}')
  from app.membership m
  join app.tenant t on t.id = m.tenant_id and t.status = 'active'
  join app.user_account u on u.id = m.user_id and u.status = 'active'
  join app.role_binding rb
    on rb.membership_id = m.id
   and rb.tenant_id = m.tenant_id
   and rb.revoked_at is null
   and (rb.valid_until is null or rb.valid_until > now())
   and rb.scope_type = 'tenant'
  join app.role_permission rp on rp.role_id = rb.role_id
  join app.permission p on p.code = rp.permission_code
  where m.user_id = app.current_user_id()
    and m.tenant_id = app.current_tenant_id()
    and m.status = 'active'
    and app.factor_scope_allows(p.code)
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
$$;

-- -----------------------------------------------------------------------------
-- has_permission in PL/pgSQL, same body. A SQL function (never inlined, being a
-- security definer) is planned again by every statement that calls it: once per
-- policy and per statement, about 1 ms each time. PL/pgSQL keeps its plan for
-- the connection (0.4 ms less per check on the bench).
-- -----------------------------------------------------------------------------
create or replace function app.has_permission(p_permission text, p_site_id uuid default null) returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  return app.factor_scope_allows(p_permission) and exists (
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
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Text search of the sites through the trigram indexes. ILIKE is not leakproof:
-- under RLS PostgreSQL evaluates it after the policies, on every site of the SIS,
-- and never through site_name_trgm, site_etare_number_trgm or address_label_trgm.
-- The ids of the matching sites of the current SIS are read here, out of the
-- policies; the queries of the API keep reading the sites themselves under RLS
-- (s.id in (select app.site_ids_matching(...))): the perimeter still applies.
-- -----------------------------------------------------------------------------
create function app.site_ids_matching(p_pattern text) returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select s.id
  from app.site s
  where s.tenant_id = app.current_tenant_id()
    and (s.name ilike p_pattern or s.etare_number ilike p_pattern)
  union
  select s.id
  from app.address a
  join app.site s on s.tenant_id = a.tenant_id and s.address_id = a.id
  where a.tenant_id = app.current_tenant_id()
    and a.label ilike p_pattern
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function
  app.sector_site_ids(uuid),
  app.permitted_site_ids(text),
  app.device_site_ids(uuid)
to etare_api, etare_worker;

grant execute on function app.site_ids_matching(text) to etare_api;

revoke all on all routines in schema app from public;
