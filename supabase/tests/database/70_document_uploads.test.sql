-- Sprint 1: the verification verdict of a file belongs to the worker, and it is final.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(9);

insert into app.asset (id, tenant_id, site_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256) values
  ('06000005-0000-4000-8000-0000000000f1', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-0000000000f1/06000005-0000-4000-8000-0000000000f2',
   'tenants/06000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-0000000000f1/06000005-0000-4000-8000-0000000000f2',
   'consignes.pdf', 'application/pdf', 1024, repeat('a', 64));

set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') is not null as ctx \gset

select throws_ok(
  $$ update app.asset set scan_status = 'clean' where id = '06000005-0000-4000-8000-0000000000f1' $$,
  '42501', null,
  'the API cannot declare a file clean'
);
select throws_ok(
  $$ update app.asset set storage_key = storage_key where id = '06000005-0000-4000-8000-0000000000f1' $$,
  '42501', null,
  'the API cannot move a file'
);
select lives_ok(
  $$ update app.asset set filename = 'consignes-v2.pdf' where id = '06000005-0000-4000-8000-0000000000f1' $$,
  'the API may rename a file (descriptive metadata)'
);
select throws_ok(
  $$ select * from app.worker_asset_for_verification('06000005-0000-4000-8000-0000000000f1') $$,
  '42501', null,
  'the verification functions are reserved to the worker'
);

reset role;
set local role etare_worker;
select throws_ok($$ select * from app.asset $$, '42501', null, 'the worker has no direct access to the asset table');
select ok(
  app.worker_complete_asset_verification('06000005-0000-4000-8000-0000000000f1', 'clean', '{"detected_type": "application/pdf"}'),
  'the worker records the verdict'
);
select ok(
  not app.worker_complete_asset_verification('06000005-0000-4000-8000-0000000000f1', 'rejected', '{}'),
  'a second verdict is ignored (idempotent)'
);

reset role;
select throws_ok(
  $$ update app.asset set scan_status = 'rejected' where id = '06000005-0000-4000-8000-0000000000f1' $$,
  '23514', null,
  'the verdict is final, even for the table owner'
);
select throws_ok(
  $$ insert into app.asset (tenant_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256) values
     ('06000000-0000-4000-8000-000000000000',
      'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-0000000000f3/06000005-0000-4000-8000-0000000000f4',
      'tenants/83000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-0000000000f3/06000005-0000-4000-8000-0000000000f4',
      'x.pdf', 'application/pdf', 1, repeat('b', 64)) $$,
  '23514', null,
  'a quarantine key always carries the tenant of the asset'
);

select * from finish();
rollback;
