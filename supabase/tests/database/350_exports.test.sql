-- Sprint 14 (ADMIN-04, ADR-033): reversibility export of a SIS, from the request to the purge.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid, p_aal text default 'aal1') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, p_aal, null, 'web')
$$;
create temp table ids (name text primary key, id uuid);
grant all on ids to etare_api, etare_worker;

select plan(31);

-- Permission of the administrator, second factor required.
select ok(
  (select requires_aal2 from app.permission where code = 'export:manage'),
  'export:manage is a privileged permission'
);
select ok(
  exists (select 1 from app.role r join app.role_permission rp on rp.role_id = r.id
          where r.code = 'SIS_ADMIN' and r.tenant_id is null and rp.permission_code = 'export:manage'),
  'the administrator of the SIS holds it'
);

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000');
select throws_ok($$ select app.request_export() $$, '42501', null, 'a reader cannot ask for an export');
select throws_ok($$ select app.export_runs() $$, '42501', null, 'nor list them');

select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal1');
select throws_ok($$ select app.request_export() $$, '42501', null, 'the administrator needs the second factor (refused at aal1)');

select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');
insert into ids select 'export', (app.request_export() ->> 'id')::uuid;
select is(app.export_runs() -> 0 ->> 'status', 'queued', 'the export is queued');
select throws_ok($$ select app.request_export() $$, '23505', null, 'one export at a time per SIS');
select ok(jsonb_array_length(app.export_runs()) >= 1, 'the administration lists its export');
reset role;
select is(
  (select count(*) from app.job where job_type = 'export.build'
     and idempotency_key = 'export.build:' || (select id from ids where name = 'export')::text),
  1::bigint, 'a job carries the build'
);
select is(
  (select count(*) from app.audit_event where action = 'export.requested' and entity_id = (select id from ids where name = 'export')),
  1::bigint, 'the request is audited'
);

-- The worker claims the job (simulated here), then builds under its fence.
with claimed as (
  update app.job set status = 'running', attempts = 1, lease_owner = 'test', lease_expires_at = now() + interval '5 minutes'
  where idempotency_key = 'export.build:' || (select id from ids where name = 'export')::text
  returning id
)
insert into ids select 'job', id from claimed;

set local role etare_worker;
select is(
  app.worker_start_export((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000',
                          (select id from ids where name = 'job'), 2),
  null, 'another attempt than the running one is fenced out'
);
select is(
  app.worker_start_export((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000',
                          (select id from ids where name = 'job'), 1) ->> 'tenant_slug',
  'sdis-demo-06', 'the running attempt starts the build'
);
select ok(
  (select count(*) from app.worker_export_rows((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000', 'site', 0, 100)) >= 1,
  'the worker reads the sites of the SIS'
);
select is(
  (select count(*) from app.worker_export_rows((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000', 'site', 0, 100) r
   where (r ->> 'tenant_id')::uuid <> '06000000-0000-4000-8000-000000000000'),
  0::bigint, 'never another SIS'
);
select ok(
  coalesce((select bool_and(not (r ? 'enrollment_code_hash'))
            from app.worker_export_rows((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000', 'device', 0, 100) r), true),
  'the secrets of the platform are left out'
);
select ok(
  (select count(*) from app.worker_export_rows((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000', 'risk_type', 0, 100)) >= 15,
  'the national catalogue entries travel with the data'
);
select throws_ok(
  $$ select app.worker_export_rows((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000', 'job', 0, 10) $$,
  '22023', null, 'a table outside the list is refused'
);
select lives_ok(
  $$ select app.worker_export_files((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000') $$,
  'the worker lists the files of the SIS'
);
select throws_ok(
  $$ select app.worker_record_export_object((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000',
       'tenants/06000000-0000-4000-8000-000000000000/assets/x/y') $$,
  '23514', null, 'an export writes under its own prefix only'
);
select ok(
  app.worker_record_export_object((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000',
    'tenants/06000000-0000-4000-8000-000000000000/exports/' || (select id from ids where name = 'export')::text || '/donnees.zip'),
  'the object is recorded before being written'
);
select ok(
  app.worker_complete_export((select id from ids where name = 'export'), '06000000-0000-4000-8000-000000000000',
    jsonb_build_array(jsonb_build_object('index', 0, 'kind', 'data', 'filename', 'donnees.zip',
      'storage_key', 'tenants/06000000-0000-4000-8000-000000000000/exports/' || (select id from ids where name = 'export')::text || '/donnees.zip',
      'media_type', 'application/zip', 'size_bytes', 4096, 'sha256', repeat('a', 64))),
    4096, 0, 120),
  'the build completes'
);
reset role;
select ok(
  (select status = 'ready' and expires_at > now() + interval '6 days' from app.export_run where id = (select id from ids where name = 'export')),
  'the export is ready for seven days'
);

-- Downloads: audited, by part, while the export is available.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');
select is(app.export_part((select id from ids where name = 'export'), 0) ->> 'filename', 'donnees.zip', 'a part is located for download');
select is(app.export_part((select id from ids where name = 'export'), 9), null, 'an unknown part is not');
select is(
  (select p - 'storage_key' from jsonb_array_elements(app.export_runs() -> 0 -> 'parts') p limit 1) ? 'storage_key',
  false, 'the listing never shows the storage keys'
);
reset role;
select is(
  (select count(*) from app.audit_event where action = 'export.downloaded' and entity_id = (select id from ids where name = 'export')),
  1::bigint, 'each download is audited'
);

-- Expiry: no more downloads, the objects are purged, the export marked expired.
update app.export_run set expires_at = now() - interval '1 day' where id = (select id from ids where name = 'export');
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');
select throws_ok($$ select app.export_part((select id from ids where name = 'export'), 0) $$, 'ETEXP', null, 'an expired export is no longer served');
reset role;
set local role etare_worker;
select is((select count(*) from app.worker_exports_to_purge(10) where export_id = (select id from ids where name = 'export')), 1::bigint,
  'the maintenance finds the expired export');
select ok(app.worker_mark_export_removed((select id from ids where name = 'export')), 'its objects are marked removed');
reset role;
select is((select status from app.export_run where id = (select id from ids where name = 'export')), 'expired', 'the export is expired');

-- A dead job fails the export it carried.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');
insert into ids select 'second', (app.request_export() ->> 'id')::uuid;
reset role;
update app.job set status = 'dead', last_error_code = 'BOOM', completed_at = now()
where idempotency_key = 'export.build:' || (select id from ids where name = 'second')::text;
select is(
  (select status || ':' || error_code from app.export_run where id = (select id from ids where name = 'second')),
  'failed:BOOM', 'a dead job leaves the export failed, with its error'
);

select * from finish();
rollback;
