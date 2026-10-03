-- Sprint 8: items attached again when a zone is drawn, moved, archived or reactivated (MET-03).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web')
$$;

create function pg_temp.object_type(p_code text) returns uuid
language sql as $$ select id from app.object_type where code = p_code and tenant_id is null $$;

-- A square zone of the demo ground floor plan (1600 × 1000 px), x from p_x to p_x + p_size.
create function pg_temp.square(p_x integer, p_y integer, p_size integer) returns extensions.geometry
language sql as $$
  select extensions.st_makeenvelope(p_x, p_y, p_x + p_size, p_y + p_size, 0)
$$;

create function pg_temp.zone_of(p_object uuid) returns uuid
language sql as $$ select zone_id from app.operational_object where id = p_object $$;

-- Demo plan "Bâtiment A - RDC": revision …07-…01, level …04-…02; the editor (…02) draws.
select plan(15);

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002');

-- Two nested zones in an empty part of the plan, and points inside, on the border, outside.
insert into app.zone (id, tenant_id, site_id, level_id, name, zone_type, plan_revision_id, local_geom)
values ('06000019-0000-4000-8000-0000000000a1', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '06000004-0000-4000-8000-000000000002', 'Hall', 'circulation',
        '06000007-0000-4000-8000-000000000001', pg_temp.square(1100, 700, 200));
insert into app.operational_object (id, tenant_id, site_id, object_type_id, label, plan_revision_id, local_geom)
values
  ('06000019-0000-4000-8000-0000000000b1', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   pg_temp.object_type('SSI'), 'Au centre du hall', '06000007-0000-4000-8000-000000000001', extensions.st_makepoint(1150, 750)),
  ('06000019-0000-4000-8000-0000000000b2', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   pg_temp.object_type('SSI'), 'Sur le bord', '06000007-0000-4000-8000-000000000001', extensions.st_makepoint(1300, 760)),
  ('06000019-0000-4000-8000-0000000000b3', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   pg_temp.object_type('SSI'), 'Hors du hall', '06000007-0000-4000-8000-000000000001', extensions.st_makepoint(1350, 750));

select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b1'), '06000019-0000-4000-8000-0000000000a1'::uuid,
  'an item placed in a zone is attached to it');
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b2'), '06000019-0000-4000-8000-0000000000a1'::uuid,
  'an item on the border belongs to the zone');
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b3'), null, 'an item outside has no zone');

-- A smaller zone drawn around the first item: the smallest covering zone wins.
insert into app.zone (id, tenant_id, site_id, level_id, name, zone_type, plan_revision_id, local_geom)
values ('06000019-0000-4000-8000-0000000000a2', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '06000004-0000-4000-8000-000000000002', 'Accueil', 'room',
        '06000007-0000-4000-8000-000000000001', pg_temp.square(1120, 720, 60));
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b1'), '06000019-0000-4000-8000-0000000000a2'::uuid,
  'a zone drawn around an item attaches it (the smallest one)');

-- Moving the hall to cover the third item.
update app.zone set local_geom = pg_temp.square(1240, 700, 200) where id = '06000019-0000-4000-8000-0000000000a1';
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b3'), '06000019-0000-4000-8000-0000000000a1'::uuid,
  'a moved zone attaches the items it now covers');
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b2'), '06000019-0000-4000-8000-0000000000a1'::uuid,
  'and keeps those still covered');
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b1'), '06000019-0000-4000-8000-0000000000a2'::uuid,
  'items of other zones are untouched');

-- Archiving the small zone: its item falls back to no zone (the hall moved away).
update app.zone set status = 'archived' where id = '06000019-0000-4000-8000-0000000000a2';
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b1'), null, 'archiving a zone detaches its items');
update app.zone set status = 'active' where id = '06000019-0000-4000-8000-0000000000a2';
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b1'), '06000019-0000-4000-8000-0000000000a2'::uuid,
  'reactivating it attaches them again');

-- A risk without position keeps the zone chosen for it, unless the zone is archived.
insert into app.risk_occurrence (id, tenant_id, site_id, risk_type_id, severity, label, properties, zone_id)
values ('06000019-0000-4000-8000-0000000000b4', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', (select id from app.risk_type where code = 'OXYGENE' and tenant_id is null),
        3, 'Sans position', '{}', '06000019-0000-4000-8000-0000000000a2');
update app.zone set local_geom = pg_temp.square(1400, 100, 60) where id = '06000019-0000-4000-8000-0000000000a2';
select is((select zone_id from app.risk_occurrence where id = '06000019-0000-4000-8000-0000000000b4'), '06000019-0000-4000-8000-0000000000a2'::uuid,
  'a risk without position keeps its zone when the zone moves');
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b1'), null,
  'while the placed item it left is detached');
update app.zone set status = 'archived' where id = '06000019-0000-4000-8000-0000000000a2';
select is((select zone_id from app.risk_occurrence where id = '06000019-0000-4000-8000-0000000000b4'), null, 'and loses it when the zone is archived');

select lives_ok(
  $$ update app.operational_object set zone_id = '06000019-0000-4000-8000-0000000000a1'
     where id = '06000019-0000-4000-8000-0000000000b1' $$, 'asking another zone for a placed item is accepted');
reset role;
select is(pg_temp.zone_of('06000019-0000-4000-8000-0000000000b1'), null,
  'but its position decides: outside the hall, it stays without zone');
select ok(
  exists (select 1 from app.audit_event
          where entity_id = '06000019-0000-4000-8000-0000000000b1' and action = 'operational_object.update'
            and actor_user_id = '00000000-0000-4000-b000-000000000002'),
  'each attachment is audited as a change made by the person who edited the zone'
);

select * from finish();
rollback;
