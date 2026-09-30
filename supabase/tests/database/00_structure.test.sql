-- Structural security invariants of the business schema.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(15);

select has_extension('postgis', 'PostGIS is installed');

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'app' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0::bigint,
  'RLS is enabled on every table of schema app'
);

select ok(not has_schema_privilege('anon', 'app', 'USAGE'), 'anon has no access to schema app');
select ok(not has_schema_privilege('authenticated', 'app', 'USAGE'), 'authenticated has no access to schema app');
select ok(not has_schema_privilege('service_role', 'app', 'USAGE'), 'service_role has no access to schema app');

select is(
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'app' and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')),
  0::bigint,
  'no Data API role and not PUBLIC holds a privilege on app tables'
);

select ok(
  (select not rolsuper and not rolbypassrls from pg_roles where rolname = 'etare_api'),
  'etare_api is neither superuser nor BYPASSRLS'
);
select ok(
  (select not rolsuper and not rolbypassrls from pg_roles where rolname = 'etare_worker'),
  'etare_worker is neither superuser nor BYPASSRLS'
);

select is(
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'app' and grantee in ('etare_api', 'etare_worker') and privilege_type in ('DELETE', 'TRUNCATE')),
  0::bigint,
  'application roles cannot DELETE or TRUNCATE business tables (logical deletion only)'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.prokind = 'f'
     and (p.proacl is null or exists (
       select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  0::bigint,
  'no function of schema app is executable by PUBLIC'
);

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.prosecdef
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0::bigint,
  'every SECURITY DEFINER function pins its search_path'
);

select is(
  (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace
   where n.nspname = 'app' and c.contype = 'f' and c.confdeltype = 'c'),
  0::bigint,
  'no ON DELETE CASCADE in schema app'
);

select set_eq(
  $$ select c.table_name::text from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'app' and c.column_name = 'tenant_id' and c.is_nullable = 'YES' and t.table_type = 'BASE TABLE' $$,
  array['audit_event', 'job', 'object_type', 'risk_type', 'role'],
  'tenant_id is NOT NULL everywhere except global catalogues, platform audit events and platform jobs'
);

select ok(
  (select not public from storage.buckets where id = 'etare-assets'),
  'the document bucket is private'
);

select set_eq(
  $$ select r.rolname::text || ':' || split_part(s.setting, '=', 1)
     from pg_db_role_setting d
     join pg_roles r on r.oid = d.setrole
     cross join unnest(d.setconfig) as s (setting)
     where d.setdatabase = 0 and r.rolname in ('etare_api', 'etare_worker') $$,
  array[
    'etare_api:statement_timeout', 'etare_api:idle_in_transaction_session_timeout', 'etare_api:lock_timeout',
    'etare_worker:statement_timeout', 'etare_worker:idle_in_transaction_session_timeout', 'etare_worker:lock_timeout'
  ],
  'application roles carry server-side timeouts (independent of the connection pooler)'
);

select * from finish();
rollback;
