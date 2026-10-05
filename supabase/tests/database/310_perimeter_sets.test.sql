-- Sprint 12 (CAP-01): perimeters evaluated once per statement, search through the trigram indexes.
-- The rules are those of has_permission, site_in_sector and device_covers_site: only their
-- evaluation changes (docs/volumetrie/cap-01.md).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text default 'aal2') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', p_aal,
                                'bbbbbbbb-0000-4000-8000-000000000310', 'web')
$$;
create function pg_temp.version_of(p_membership uuid) returns integer
language sql as $$ select row_version from app.membership where id = p_membership $$;

-- Seed: sectors CIS Nice Centre (…1a-…01) and CIS Antibes (…1a-…02); EHPAD Les Oliviers in Nice
-- (…02-…01, 06-0428, avenue des Mimosas), warehouse in Antibes (…02-…02, chemin des Lavandes);
-- Résidence Les Pins in the SIS 83. Members of the SIS 06: admin (…01), reader (…06, 0600000a-…06).
select plan(15);

-- -----------------------------------------------------------------------------
-- Policies: no call per row left
-- -----------------------------------------------------------------------------
select is(
  (select count(*) from pg_policies
   where schemaname = 'app'
     and (coalesce(qual, '') ~ 'has_permission\(''[a-z_:]+''::text, [a-z_.]+\)'
          or coalesce(with_check, '') ~ 'has_permission\(''[a-z_:]+''::text, [a-z_.]+\)')),
  0::bigint,
  'no policy calls has_permission for each row read any more'
);
select ok(
  (select count(*) from pg_policies
   where schemaname = 'app'
     and (coalesce(qual, '') like '%permitted_site_ids%' or coalesce(with_check, '') like '%permitted_site_ids%')) >= 60,
  'the policies of the site-scoped tables read the permitted sites once per statement'
);
select ok(
  not has_function_privilege('authenticated', 'app.permitted_site_ids(text)', 'execute')
  and not has_function_privilege('anon', 'app.site_ids_matching(text)', 'execute')
  and not has_function_privilege('authenticated', 'app.site_ids_matching(text)', 'execute')
  and not has_function_privilege('etare_worker', 'app.site_ids_matching(text)', 'execute'),
  'the set functions are the API''s only'
);

-- -----------------------------------------------------------------------------
-- Sectors and terminals: the same sites as site_in_sector and device_covers_site
-- -----------------------------------------------------------------------------
select set_eq(
  $$ select sc.id as sector_id, s.id as site_id from app.sector sc cross join app.site s
     where sc.tenant_id = '06000000-0000-4000-8000-000000000000' and s.tenant_id = sc.tenant_id
       and app.site_in_sector(s.id, sc.id) $$,
  $$ select sc.id as sector_id, ids as site_id from app.sector sc cross join lateral app.sector_site_ids(sc.id) as ids
     where sc.tenant_id = '06000000-0000-4000-8000-000000000000' $$,
  'the sites of every sector are those of site_in_sector'
);

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select app.admin_create_device('PGTAP ENSEMBLES', repeat('d', 64), now() + interval '1 day') as device_id \gset
select from app.admin_set_device_perimeter(:'device_id', 1, array['0600001a-0000-4000-8000-000000000001'::uuid]);
reset role;
select set_eq(
  format($$ select id from app.site where tenant_id = '06000000-0000-4000-8000-000000000000'
            and app.device_covers_site(%L, id) $$, :'device_id'),
  format($$ select app.device_site_ids(%L) $$, :'device_id'),
  'the sites of a terminal limited to a sector are those of device_covers_site'
);

-- -----------------------------------------------------------------------------
-- A member limited to a sector and to a site
-- -----------------------------------------------------------------------------
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select lives_ok(
  $$ select app.admin_set_member_perimeter('0600000a-0000-4000-8000-000000000006',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000006'),
       array['0600001a-0000-4000-8000-000000000001'::uuid],
       array['06000002-0000-4000-8000-000000000002'::uuid]) $$,
  'the administration limits a reader to the sector of Nice and to the warehouse of Antibes'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000006', 'aal1');
select set_eq(
  $$ select app.permitted_site_ids('site:read') $$,
  $$ select id from app.site where app.has_permission('site:read', id) $$,
  'the permitted sites are those of has_permission'
);
select set_eq(
  $$ select id from app.site $$,
  $$ select app.permitted_site_ids('site:read') $$,
  'row-level security shows exactly the permitted sites'
);
select ok(
  array['06000002-0000-4000-8000-000000000001', '06000002-0000-4000-8000-000000000002']::uuid[]
  <@ (select array_agg(id) from app.permitted_site_ids('site:read') as id),
  'the site of the sector and the site added by hand are both permitted'
);
select is_empty(
  $$ select app.permitted_site_ids('site:write') $$,
  'a permission the roles do not grant reaches no site'
);

-- -----------------------------------------------------------------------------
-- Search: ids of the SIS through the indexes, rows always read under RLS
-- -----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', 'aal1');
select ok(
  '06000002-0000-4000-8000-000000000001'::uuid in (select app.site_ids_matching('%Oliviers%'))
  and '06000002-0000-4000-8000-000000000001'::uuid in (select app.site_ids_matching('%06-0428%'))
  and '06000002-0000-4000-8000-000000000001'::uuid in (select app.site_ids_matching('%avenue des mimosas%')),
  'a site is found by its name, its ETARE number or its address, whatever the case'
);
select ok(
  '83000002-0000-4000-8000-000000000001'::uuid not in (select app.site_ids_matching('%Les Pins%')),
  'never a site of another SIS'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000006', 'aal1');
select ok(
  (select count(*) from app.site_ids_matching('%')) > 2,
  'the ids are those of the whole SIS, whatever the perimeter of the person'
);
select set_eq(
  $$ select s.id from app.site s where s.id in (select app.site_ids_matching('%')) $$,
  $$ select app.permitted_site_ids('site:read') $$,
  'but the sites read through them stay those of the perimeter'
);

select set_config('app.tenant_id', '', true);
select is(
  (select count(*) from app.site_ids_matching('%')),
  0::bigint,
  'without a request context, the search finds nothing'
);

select * from finish();
rollback;
