-- =============================================================================
-- Sprint 3 — objects, zones and risks placed on plans (PLAN-02..04, RISK-01/02).
--
--   * a position on a plan belongs to one background revision, lies inside the
--     background, and is only ever set on the CURRENT background: positions left
--     on a replaced background stay as they are until someone places them again
--     (visual check, never an automatic translation — architecture §08);
--   * the scope of an object or a risk is consistent: zone ⊂ level ⊂ building,
--     derived upwards, contradictions refused; on a plan, the zone is the one
--     that contains the position;
--   * risk occurrences carry the type-specific fields of the SIS catalogue and a
--     short label; they are a point or a surface;
--   * a SIS catalogue entry cannot reuse a code of the national catalogue.
-- =============================================================================

alter table app.risk_occurrence
  add column label text check (length(label) <= 40),
  add column properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  add constraint risk_occurrence_geometry_kind check (
    (geom is null or extensions.st_geometrytype(geom) in ('ST_Point', 'ST_Polygon'))
    and (local_geom is null or extensions.st_geometrytype(local_geom) in ('ST_Point', 'ST_Polygon'))
  );

create index risk_occurrence_local_geom_gix on app.risk_occurrence using gist (local_geom);
create index zone_local_geom_gix on app.zone using gist (local_geom);
create index operational_object_plan_revision_idx on app.operational_object (plan_revision_id)
  where plan_revision_id is not null;
create index risk_occurrence_plan_revision_idx on app.risk_occurrence (plan_revision_id)
  where plan_revision_id is not null;
create index zone_plan_revision_idx on app.zone (plan_revision_id) where plan_revision_id is not null;

-- -----------------------------------------------------------------------------
-- Placement of zones, operational objects and risk occurrences.
-- -----------------------------------------------------------------------------
create function app.tg_placement() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_zone constant boolean := tg_table_name = 'zone';
  v_plan_level uuid;
  v_plan_building uuid;
  v_width numeric;
  v_height numeric;
  v_current boolean;
  v_moved boolean := false;
  v_zone_level uuid;
  v_level_building uuid;
begin
  -- 1. Position on a plan.
  if new.plan_revision_id is not null then
    if new.local_geom is null then
      raise exception 'a plan revision without a position on it'
        using errcode = '23514', constraint = 'plan_position_missing';
    end if;
    select p.level_id, p.building_id, r.width, r.height, r.is_current
      into v_plan_level, v_plan_building, v_width, v_height, v_current
    from app.plan_revision r
    join app.plan p on p.tenant_id = r.tenant_id and p.id = r.plan_id
    where r.tenant_id = new.tenant_id and r.id = new.plan_revision_id;

    if tg_op = 'INSERT' then
      v_moved := true;
    else
      v_moved := new.plan_revision_id is distinct from old.plan_revision_id
        or old.local_geom is null
        or not extensions.st_orderingequals(new.local_geom, old.local_geom);
    end if;
    if v_moved then
      if not v_current then
        raise exception 'positions are only set on the current background of a plan'
          using errcode = '23514', constraint = 'plan_position_current';
      end if;
      if not extensions.st_coveredby(new.local_geom, extensions.st_makeenvelope(0, 0, v_width, v_height, 0)) then
        raise exception 'position outside the plan background'
          using errcode = '23514', constraint = 'plan_position_bounds';
      end if;
    end if;

    if v_plan_level is null and v_is_zone then
      raise exception 'zones are drawn on level plans' using errcode = '23514', constraint = 'plan_position_level';
    end if;
    if v_plan_level is not null then
      if new.level_id is null then
        new.level_id := v_plan_level;
      elsif new.level_id <> v_plan_level then
        raise exception 'position on the plan of another level'
          using errcode = '23514', constraint = 'plan_position_level';
      end if;
    end if;

    -- The zone of a placed object or risk is the smallest active zone containing it.
    if v_moved and not v_is_zone then
      select z.id into new.zone_id
      from app.zone z
      where z.tenant_id = new.tenant_id and z.plan_revision_id = new.plan_revision_id and z.status = 'active'
        and extensions.st_coveredby(new.local_geom, z.local_geom)
      order by extensions.st_area(z.local_geom), z.id
      limit 1;
    end if;
  end if;

  if v_is_zone then
    return new;
  end if;

  -- 2. Scope: zone ⊂ level ⊂ building.
  if new.zone_id is not null then
    select z.level_id into v_zone_level from app.zone z where z.tenant_id = new.tenant_id and z.id = new.zone_id;
    if new.level_id is null then
      new.level_id := v_zone_level;
    elsif new.level_id <> v_zone_level then
      raise exception 'zone of another level' using errcode = '23514', constraint = 'placement_scope';
    end if;
  end if;
  if new.level_id is not null then
    select l.building_id into v_level_building from app.level l where l.tenant_id = new.tenant_id and l.id = new.level_id;
    if new.building_id is null then
      new.building_id := v_level_building;
    elsif new.building_id <> v_level_building then
      raise exception 'level of another building' using errcode = '23514', constraint = 'placement_scope';
    end if;
  end if;
  if v_plan_building is not null then
    if new.building_id is null then
      new.building_id := v_plan_building;
    elsif new.building_id <> v_plan_building then
      raise exception 'position on the plan of another building' using errcode = '23514', constraint = 'placement_scope';
    end if;
  end if;
  return new;
end
$$;

create trigger placement before insert or update on app.zone
for each row execute function app.tg_placement();
create trigger placement before insert or update on app.operational_object
for each row execute function app.tg_placement();
create trigger placement before insert or update on app.risk_occurrence
for each row execute function app.tg_placement();

-- -----------------------------------------------------------------------------
-- SIS catalogue entries never shadow a national code.
-- -----------------------------------------------------------------------------
create function app.tg_catalog_code_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_taken boolean;
begin
  if new.tenant_id is null then
    return new;
  end if;
  execute format('select exists (select 1 from app.%I where tenant_id is null and code = $1)', tg_table_name)
    into v_taken using new.code;
  if v_taken then
    raise exception 'code % belongs to the national catalogue', new.code
      using errcode = '23505', constraint = 'catalog_code_national';
  end if;
  return new;
end
$$;

create trigger catalog_code_guard before insert or update of code on app.object_type
for each row execute function app.tg_catalog_code_guard();
create trigger catalog_code_guard before insert or update of code on app.risk_type
for each row execute function app.tg_catalog_code_guard();

-- Routines are never executable by PUBLIC (explicit grants only).
revoke all on all routines in schema app from public;
