-- Sprint 2: operational objects placed on the map keep the geometry their type expects.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', null, 'web')
$$;

create function pg_temp.type_id(p_code text) returns uuid
language sql as $$ select id from app.object_type where code = p_code and tenant_id is null $$;

select plan(7);

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');

select lives_ok(
  $$ insert into app.operational_object (tenant_id, site_id, object_type_id, name, geom)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', pg_temp.type_id('PEI'),
             'PEI secondaire', extensions.st_setsrid(extensions.st_makepoint(7.2512, 43.7071), 4326)) $$,
  'an editor places a hydrant (point) on the map'
);
select throws_ok(
  $$ insert into app.operational_object (tenant_id, site_id, object_type_id, geom)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', pg_temp.type_id('PEI'),
             extensions.st_setsrid(extensions.st_geomfromtext('LINESTRING(7.25 43.70, 7.26 43.71)'), 4326)) $$,
  '23514', null,
  'a hydrant cannot be drawn as a line'
);
select lives_ok(
  $$ insert into app.operational_object (tenant_id, site_id, object_type_id, geom)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', pg_temp.type_id('VOIE_ENGINS'),
             extensions.st_setsrid(extensions.st_geomfromtext('LINESTRING(7.2510 43.7070, 7.2520 43.7080)'), 4326)) $$,
  'a fire lane is a line'
);
select throws_ok(
  $$ insert into app.operational_object (tenant_id, site_id, object_type_id, name)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', pg_temp.type_id('PEI'), 'Nulle part') $$,
  '23514', null,
  'an object is always placed, on the map or on a plan'
);
select throws_ok(
  $$ update app.operational_object set object_type_id = pg_temp.type_id('AIRE_EPA')
     where id = '06000009-0000-4000-8000-000000000004' $$,
  '23514', null,
  'changing the type re-checks the geometry'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ insert into app.operational_object (tenant_id, site_id, object_type_id, geom)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', pg_temp.type_id('PEI'),
             extensions.st_setsrid(extensions.st_makepoint(7.2512, 43.7071), 4326)) $$,
  '42501', null,
  'a reader cannot place objects'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000007', '83000000-0000-4000-8000-000000000000');
select is(
  (select count(*) from app.operational_object where site_id = '06000002-0000-4000-8000-000000000001'),
  0::bigint,
  'objects of another SIS are invisible'
);

select * from finish();
rollback;
