-- Multi-tenant isolation: a user of SDIS DEMO 06 never reads nor writes SDIS DEMO 83 data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.affected_rows(p_sql text) returns bigint
language plpgsql as $$
declare v_count bigint;
begin
  execute p_sql;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

select plan(23);

-- ---------------------------------------------------------------- editor of 06
set local role etare_api;
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') $$,
  'redacteur06 opens a request in SDIS DEMO 06'
);

-- Integration tests add sites to the local database: assert the isolation, not an exact list.
select set_eq(
  $$ select distinct tenant_id from app.site $$,
  array['06000000-0000-4000-8000-000000000000']::uuid[],
  'redacteur06 only sees sites of SDIS DEMO 06'
);
select set_has(
  $$ select name from app.site $$,
  $$ values ('EHPAD Les Oliviers'), ('Entrepôt logistique Démo Antibes') $$,
  'redacteur06 sees the seeded sites of SDIS DEMO 06'
);

select is(
  (select count(*) from app.site where id = '83000002-0000-4000-8000-000000000001'),
  0::bigint,
  'a site of SDIS DEMO 83 is invisible even with its exact id'
);

select is(
  pg_temp.affected_rows($$ update app.site set name = name || ' (x)' where tenant_id = '83000000-0000-4000-8000-000000000000' $$),
  0::bigint,
  'updating SDIS DEMO 83 sites affects no row'
);

select throws_ok(
  $$ insert into app.site (tenant_id, name, site_type) values ('83000000-0000-4000-8000-000000000000', 'Intrus', 'other') $$,
  '42501', null,
  'inserting a site for another tenant is rejected by RLS'
);

select throws_ok(
  $$ insert into app.building (tenant_id, site_id, name)
     values ('06000000-0000-4000-8000-000000000000', '83000002-0000-4000-8000-000000000001', 'Bâtiment intrus') $$,
  '23503', null,
  'a 06 row cannot reference a 83 parent: composite foreign key (tenant_id, site_id)'
);

select throws_ok(
  $$ update app.site set tenant_id = '83000000-0000-4000-8000-000000000000' where id = '06000002-0000-4000-8000-000000000001' $$,
  '23000', null,
  'tenant_id cannot be changed'
);

select throws_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '83000000-0000-4000-8000-000000000000', 'aal1', null, 'web') $$,
  'ET403', null,
  'redacteur06 cannot open a request in SDIS DEMO 83 (tenant id sent by a client is not an authorization)'
);

select throws_ok(
  $$ select app.begin_request('supabase', '99999999-0000-4000-a000-000000000000', null, 'aal1', null, 'web') $$,
  'ET401', null,
  'an unknown identity is rejected'
);

select is(
  (select count(*) from app.audit_event),
  0::bigint,
  'redacteur06 cannot read the audit journal (no audit:read)'
);

-- ---------------------------------------------------------------- no context
select is(set_config('app.tenant_id', '', true), '', 'tenant context cleared');
select is((select count(*) from app.site), 0::bigint, 'without tenant context no site is visible');

-- ---------------------------------------------------------------- multi-SIS user
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000008', '83000000-0000-4000-8000-000000000000', 'aal1', null, 'web') $$,
  'the multi-SIS agent opens a request in SDIS DEMO 83'
);
select set_eq(
  $$ select distinct tenant_id from app.site $$,
  array['83000000-0000-4000-8000-000000000000']::uuid[],
  'in SDIS DEMO 83 context, only 83 sites are visible'
);
select set_has(
  $$ select name from app.site $$,
  $$ values ('Résidence Les Pins (démo 83)'), ('Plateforme industrielle Démo Var') $$,
  'in SDIS DEMO 83 context, the seeded 83 sites are visible'
);
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000008', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') $$,
  'the same agent switches to SDIS DEMO 06'
);
select throws_ok(
  $$ insert into app.site (tenant_id, name, site_type) values ('06000000-0000-4000-8000-000000000000', 'Nouveau site', 'other') $$,
  '42501', null,
  'in SDIS DEMO 06 the agent is READER only: no write'
);

-- ---------------------------------------------------------------- OPS user
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'mobile') $$,
  'ops06 opens a request'
);
select is((select count(*) from app.site), 0::bigint, 'OPS users never read the working tables');
select is((select count(*) from app.publication where site_id = '06000002-0000-4000-8000-000000000001'), 1::bigint, 'OPS users read published versions of their tenant');

-- ---------------------------------------------------------------- site-scoped operator
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000005', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') $$,
  'the operator (exploitant) opens a request'
);
select ok(
  app.has_permission('portal:read', '06000002-0000-4000-8000-000000000001')
  and not app.has_permission('portal:read', '06000002-0000-4000-8000-000000000002')
  and not app.has_permission('site:read', '06000002-0000-4000-8000-000000000001'),
  'the operator is scoped to its own site and has no access to working data'
);

select * from finish();
rollback;
