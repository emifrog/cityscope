-- Sprint 3: objects, zones and risks placed on plans; SIS risk catalogue.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', null, 'web')
$$;

create function pg_temp.object_type(p_code text) returns uuid
language sql as $$ select id from app.object_type where code = p_code and tenant_id is null $$;

create function pg_temp.risk_type(p_code text) returns uuid
language sql as $$ select id from app.risk_type where code = p_code and tenant_id is null $$;

select plan(17);

-- Demo plan "Bâtiment A - RDC": revision 1 (1600 × 1000 px), current.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');

select lives_ok(
  $$ insert into app.operational_object (id, tenant_id, site_id, object_type_id, label, plan_revision_id, local_geom)
     values ('06000099-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000',
             '06000002-0000-4000-8000-000000000001', pg_temp.object_type('SSI'), 'SSI',
             '06000007-0000-4000-8000-000000000001', extensions.st_makepoint(300, 500)) $$,
  'an editor places an object on the current background of a plan'
);
select results_eq(
  $$ select level_id, building_id, zone_id from app.operational_object where id = '06000099-0000-4000-8000-000000000001' $$,
  $$ values ('06000004-0000-4000-8000-000000000002'::uuid, '06000003-0000-4000-8000-000000000001'::uuid, null::uuid) $$,
  'its level and building come from the plan'
);
select lives_ok(
  $$ update app.operational_object set local_geom = extensions.st_makepoint(420, 300)
     where id = '06000099-0000-4000-8000-000000000001' $$,
  'the object is moved into the technical room'
);
select is(
  (select zone_id from app.operational_object where id = '06000099-0000-4000-8000-000000000001'),
  '06000008-0000-4000-8000-000000000001'::uuid,
  'its zone is the room that contains it'
);
select throws_ok(
  $$ update app.operational_object set local_geom = extensions.st_makepoint(1700, 300)
     where id = '06000099-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a position outside the background is refused'
);
select throws_ok(
  $$ update app.operational_object set level_id = '06000004-0000-4000-8000-000000000003'
     where id = '06000099-0000-4000-8000-000000000001' $$,
  '23514', null,
  'an object on the ground floor plan cannot claim another level'
);
select lives_ok(
  $$ insert into app.zone (tenant_id, site_id, level_id, name, zone_type, plan_revision_id, local_geom)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '06000004-0000-4000-8000-000000000002', 'Couloir', 'circulation', '06000007-0000-4000-8000-000000000001',
             extensions.st_geomfromtext('POLYGON((100 450, 1500 450, 1500 550, 100 550, 100 450))', 0)) $$,
  'a zone is drawn on a level plan'
);
select lives_ok(
  $$ insert into app.risk_occurrence (id, tenant_id, site_id, risk_type_id, severity, label, properties, plan_revision_id, local_geom)
     values ('0600009b-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000',
             '06000002-0000-4000-8000-000000000001', pg_temp.risk_type('OXYGENE'), 4, 'O₂', '{}',
             '06000007-0000-4000-8000-000000000001',
             extensions.st_geomfromtext('POLYGON((490 260, 550 260, 550 320, 490 320, 490 260))', 0)) $$,
  'a risk is drawn as a surface on the plan'
);
select is(
  (select zone_id from app.risk_occurrence where id = '0600009b-0000-4000-8000-000000000001'),
  '06000008-0000-4000-8000-000000000002'::uuid,
  'the risk is scoped to the pharmacy room that contains it'
);
select throws_ok(
  $$ insert into app.risk_occurrence (tenant_id, site_id, risk_type_id, severity, plan_revision_id, local_geom)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             pg_temp.risk_type('OXYGENE'), 4, '06000007-0000-4000-8000-000000000001',
             extensions.st_geomfromtext('LINESTRING(100 100, 200 200)', 0)) $$,
  '23514', null,
  'a risk is a point or a surface, not a line'
);
select throws_ok(
  $$ insert into app.risk_occurrence (tenant_id, site_id, risk_type_id, severity, building_id, level_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             pg_temp.risk_type('OXYGENE'), 4, '06000003-0000-4000-8000-000000000002', '06000004-0000-4000-8000-000000000002') $$,
  '23514', null,
  'a risk scoped to a level of building A cannot claim building B'
);

-- The background is replaced: revision 2 becomes current (same file, as the repository would do).
reset role;
update app.plan_revision set is_current = false where id = '06000007-0000-4000-8000-000000000001';
insert into app.plan_revision (id, tenant_id, site_id, plan_id, revision_no, asset_id, width, height)
values ('06000097-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '06000006-0000-4000-8000-000000000001', 2,
        '06000005-0000-4000-8000-000000000001', 1600, 1000);
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');

select lives_ok(
  $$ update app.operational_object set name = 'SSI du bâtiment A' where id = '06000099-0000-4000-8000-000000000001' $$,
  'an object left on the replaced background can still be edited'
);
select throws_ok(
  $$ update app.operational_object set local_geom = extensions.st_makepoint(430, 300)
     where id = '06000099-0000-4000-8000-000000000001' $$,
  '23514', null,
  'but it cannot be moved on the replaced background'
);
select lives_ok(
  $$ update app.operational_object
     set plan_revision_id = '06000097-0000-4000-8000-000000000002', local_geom = extensions.st_makepoint(430, 300)
     where id = '06000099-0000-4000-8000-000000000001' $$,
  'it is placed again on the current background'
);

-- SIS catalogue of risks (RISK-01): managed by the SIS administrator, never shadowing national codes.
select throws_ok(
  $$ insert into app.risk_type (tenant_id, code, name, default_severity, icon_key)
     values ('06000000-0000-4000-8000-000000000000', 'CUVE_FIOUL', 'Cuve de fioul', 3, 'risk-flammable') $$,
  '42501', null,
  'an editor cannot extend the risk catalogue'
);
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ insert into app.risk_type (tenant_id, code, name, default_severity, icon_key)
     values ('06000000-0000-4000-8000-000000000000', 'INFLAMMABLE', 'Inflammable (SIS)', 3, 'risk-flammable') $$,
  '23505', null,
  'a SIS entry cannot reuse a national code'
);
select lives_ok(
  $$ insert into app.risk_type (tenant_id, code, name, default_severity, icon_key, properties_schema)
     values ('06000000-0000-4000-8000-000000000000', 'CUVE_FIOUL', 'Cuve de fioul', 3, 'risk-flammable',
             '{"type": "object", "properties": {"volume_m3": {"type": "number", "title": "Volume", "unit": "m³"}}}') $$,
  'the SIS administrator adds a risk type with its own fields'
);

select * from finish();
rollback;
