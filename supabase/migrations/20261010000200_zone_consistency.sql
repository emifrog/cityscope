-- =============================================================================
-- Sprint 8 / R3 — consistency of zones (MET-03).
--
-- The zone of an object or a risk placed on a plan is the smallest active
-- zone of the same background that covers it (rule of tg_placement, applied
-- when the item moves). It is now applied also when a zone is drawn, moved,
-- archived or reactivated: the items placed on that background are attached
-- again, each change being an ordinary update (audited, authored by the person
-- who changed the zone). An item without position on a plan keeps the zone
-- chosen for it, unless that zone is archived. What remains inconsistent is
-- reported by the checks before submission (blocking).
-- =============================================================================

-- Smallest active zone of a background covering a position (null: none).
create function app.zone_for_position(p_tenant uuid, p_plan_revision uuid, p_geom extensions.geometry)
returns uuid
language sql stable
set search_path = ''
as $$
  select z.id
  from app.zone z
  where z.tenant_id = p_tenant and z.plan_revision_id = p_plan_revision and z.status = 'active'
    and extensions.st_coveredby(p_geom, z.local_geom)
  order by extensions.st_area(z.local_geom), z.id
  limit 1
$$;

-- The placement trigger uses the same rule; the position of a placed item decides its zone.
create or replace function app.tg_placement() returns trigger
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

    -- The zone of a placed object or risk is the smallest active zone containing it,
    -- recomputed when it moves or when another zone is asked for (its position decides).
    if not v_is_zone then
      if v_moved then
        new.zone_id := app.zone_for_position(new.tenant_id, new.plan_revision_id, new.local_geom);
      elsif tg_op = 'UPDATE' then
        if new.zone_id is distinct from old.zone_id then
          new.zone_id := app.zone_for_position(new.tenant_id, new.plan_revision_id, new.local_geom);
        end if;
      end if;
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

-- A zone drawn, moved, archived or reactivated: the items of its background are attached again.
create function app.tg_zone_reattach() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.plan_revision_id is not distinct from old.plan_revision_id
     and (new.local_geom is null) = (old.local_geom is null)
     and (new.local_geom is null or extensions.st_orderingequals(new.local_geom, old.local_geom)) then
    return null;
  end if;
  -- Items placed on the backgrounds concerned (before and after the change).
  update app.operational_object o
  set zone_id = app.zone_for_position(o.tenant_id, o.plan_revision_id, o.local_geom)
  where o.tenant_id = new.tenant_id and o.site_id = new.site_id and o.status <> 'archived'
    and o.plan_revision_id in (new.plan_revision_id, case when tg_op = 'UPDATE' then old.plan_revision_id end)
    and o.zone_id is distinct from app.zone_for_position(o.tenant_id, o.plan_revision_id, o.local_geom);
  update app.risk_occurrence r
  set zone_id = app.zone_for_position(r.tenant_id, r.plan_revision_id, r.local_geom)
  where r.tenant_id = new.tenant_id and r.site_id = new.site_id and r.status = 'active'
    and r.plan_revision_id in (new.plan_revision_id, case when tg_op = 'UPDATE' then old.plan_revision_id end)
    and r.zone_id is distinct from app.zone_for_position(r.tenant_id, r.plan_revision_id, r.local_geom);
  -- Items without position keep the zone chosen for them, unless it is archived.
  if new.status = 'archived' then
    update app.operational_object set zone_id = null
    where tenant_id = new.tenant_id and site_id = new.site_id and zone_id = new.id and plan_revision_id is null;
    update app.risk_occurrence set zone_id = null
    where tenant_id = new.tenant_id and site_id = new.site_id and zone_id = new.id and plan_revision_id is null;
  end if;
  return null;
end
$$;

create trigger zone_reattach after insert or update of local_geom, status, plan_revision_id on app.zone
for each row execute function app.tg_zone_reattach();

-- Called by the placement triggers, under the RLS of the person who edits.
grant execute on function app.zone_for_position(uuid, uuid, extensions.geometry) to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
