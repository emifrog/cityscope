-- EXP-02 (ADR-031): the backup role reads everything and writes only its run record; the metrics say
-- when the last backup succeeded.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(14);

select ok(
  (select rolbypassrls and not rolsuper and not rolcreaterole and not rolcreatedb from pg_roles where rolname = 'etare_backup'),
  'etare_backup bypasses RLS (pg_dump sees every row), without any administration right'
);
select ok(pg_has_role('etare_backup', 'pg_read_all_data', 'USAGE'), 'etare_backup reads every table');

-- Reads: business tables under RLS, accounts, files, its own records.
set local role etare_backup;
select ok((select count(*) from app.tenant) >= 2, 'it reads the SIS, whatever the RLS');
select ok((select count(*) from auth.users) > 0, 'it reads the accounts (restored with the data)');
select lives_ok($$ select count(*) from storage.objects $$, 'it lists the stored files');
select lives_ok($$ select count(*) from supabase_migrations.schema_migrations $$, 'it reads the migration history');

-- Writes: none, but its run record.
select throws_ok($$ update app.tenant set name = name $$, '42501', null, 'it never writes a business table');
select throws_ok($$ delete from auth.users $$, '42501', null, 'it never deletes an account');
select throws_ok(
  $$ insert into app.backup_run (started_at, archive_name, archive_bytes, object_count, object_bytes)
     values (now(), 'direct', 1, 0, 0) $$,
  '42501', null, 'it records a run only through its function'
);
select lives_ok(
  $$ select app.backup_record_run(now() - interval '5 minutes', 'firescape-test-20261111T020000Z', 4096, 3, 2048, 1) $$,
  'it records a successful run'
);
select lives_ok(
  $$ select app.backup_record_run(now() - interval '5 minutes', 'firescape-test-20261111T020000Z', 4096, 3, 2048, 1) $$,
  'recording the same archive twice is harmless'
);
reset role;

set local role etare_api;
select throws_ok(
  $$ select app.backup_record_run(now(), 'faux', 1, 0, 0, 0) $$,
  '42501', null, 'the API cannot pretend a backup succeeded'
);
select ok(
  (select (m #>> '{backups,last_success_seconds}')::numeric between 0 and 60
          and (m #>> '{backups,last_missing_objects}')::int = 1
          and (m #>> '{backups,last_archive_bytes}')::bigint = 4096
   from app.platform_metrics() m),
  'the metrics give the age, size and missing files of the last backup'
);
reset role;

select throws_ok(
  $$ select app.backup_record_run(now(), '../etc/passwd', 1, 0, 0, 0) $$,
  '23514', null, 'an archive name is a plain file name'
);

select * from finish();
rollback;
