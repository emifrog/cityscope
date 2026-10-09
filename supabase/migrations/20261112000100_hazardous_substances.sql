-- =============================================================================
-- Hazardous substances and their safety data sheets (RISK-03, ADR-032)
--
--   * app.hazardous_substance: a product held on a site (name, CLP hazard
--     classes, UN number, quantity and unit, physical state), located on a
--     building, a level or a zone with a free note, with its safety data sheet
--     (FDS): a document of the same site, category 'fds'.
--   * Site-scoped like the risks (site:read / site:write), audited, counted
--     among the edits of the revision (separation of duties), archived rather
--     than deleted. Published in the ETARE snapshot (section "substances").
-- =============================================================================

create table app.hazardous_substance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  -- CLP pictograms: GHS01 explosive, GHS02 flammable, GHS03 oxidising, GHS04 gas under pressure,
  -- GHS05 corrosive, GHS06 acute toxicity, GHS07 harmful/irritant, GHS08 health hazard, GHS09 environment.
  hazard_classes text[] not null default '{}'
    check (hazard_classes <@ array['GHS01', 'GHS02', 'GHS03', 'GHS04', 'GHS05', 'GHS06', 'GHS07', 'GHS08', 'GHS09']),
  un_number text check (un_number ~ '^[0-9]{4}$'),
  physical_state text check (physical_state in ('solid', 'liquid', 'gas')),
  quantity numeric(14, 3) check (quantity >= 0),
  unit text check (length(unit) between 1 and 20),
  building_id uuid,
  level_id uuid,
  zone_id uuid,
  location_note text check (length(location_note) between 1 and 200),
  fds_document_id uuid,
  notes text check (length(notes) between 1 and 2000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  foreign key (tenant_id, site_id, building_id) references app.building (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, level_id) references app.level (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, zone_id) references app.zone (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, fds_document_id) references app.document (tenant_id, site_id, id),
  check ((quantity is null) = (unit is null))
);
comment on table app.hazardous_substance is
  'Hazardous substance held on a site (RISK-03): product, CLP classes, quantity, location and its safety data sheet.';
create index hazardous_substance_site_idx on app.hazardous_substance (site_id, name) where status = 'active';

-- The sheet is a document of the same site classed 'fds'; the location is consistent (zone in level in
-- building); the substance never changes site; archiving is final.
create function app.tg_hazardous_substance_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_building uuid;
  v_level uuid;
begin
  if tg_op = 'UPDATE' then
    if new.site_id <> old.site_id then
      raise exception 'a substance stays on its site' using errcode = '23514';
    end if;
    if old.status = 'archived' and new.status <> 'archived' then
      raise exception 'an archived substance stays archived' using errcode = '23514';
    end if;
  end if;
  if new.zone_id is not null then
    select z.level_id into v_level from app.zone z where z.id = new.zone_id;
    if new.level_id is null then
      new.level_id := v_level;
    elsif new.level_id <> v_level then
      raise exception 'SUBSTANCE_SCOPE_INVALID: the zone is not on this level' using errcode = '23514';
    end if;
  end if;
  if new.level_id is not null then
    select l.building_id into v_building from app.level l where l.id = new.level_id;
    if new.building_id is null then
      new.building_id := v_building;
    elsif new.building_id <> v_building then
      raise exception 'SUBSTANCE_SCOPE_INVALID: the level is not in this building' using errcode = '23514';
    end if;
  end if;
  if new.fds_document_id is not null
     and (tg_op = 'INSERT' or new.fds_document_id is distinct from old.fds_document_id)
     and not exists (
       select 1 from app.document d
       where d.id = new.fds_document_id and d.site_id = new.site_id and d.category = 'fds' and d.status = 'active'
     ) then
    raise exception 'SUBSTANCE_FDS_INVALID: the sheet is an active document of the site classed FDS'
      using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger hazardous_substance_guard before insert or update on app.hazardous_substance
for each row execute function app.tg_hazardous_substance_guard();

call app.install_tenant_table_triggers('app.hazardous_substance');
call app.install_site_scoped_policies('app.hazardous_substance', 'site:read', 'site:write');
call app.install_site_edit_trigger('app.hazardous_substance');
call app.install_audit_trigger('app.hazardous_substance');

revoke all on all routines in schema app from public;
