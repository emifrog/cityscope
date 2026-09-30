-- Sprint 3: publication built by the worker from the approved snapshot only; names of members.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', null, 'web')
$$;

select plan(31);

-- Names of members: only within the current SIS.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');
select is(app.member_name('00000000-0000-4000-b000-000000000003'), 'Validateur Prévision 06 (démo)', 'a member of the SIS is named');
select is(app.member_name('00000000-0000-4000-b000-000000000007'), null, 'a member of another SIS is not');
select throws_ok(
  $$ select * from app.worker_start_publication('0600000f-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000090-0000-4000-8000-000000000002', 1) $$,
  '42501', null,
  'the API cannot run the worker functions'
);

-- Revision 2 of the demo dossier is submitted, approved by the validator, then queued for publication.
reset role;
update app.etare_revision
set status = 'submitted', snapshot = '{"schema_version": 1}', content_hash = repeat('c', 64),
    submitted_by = '00000000-0000-4000-b000-000000000002', submitted_at = now()
where id = '0600000d-0000-4000-8000-000000000002';
insert into app.approval (id, tenant_id, site_id, revision_id, revision_hash, decision, actor_id)
values ('0600009e-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000d-0000-4000-8000-000000000002', repeat('c', 64), 'approved',
        '00000000-0000-4000-b000-000000000003');
update app.etare_revision set status = 'approved', decided_at = now() where id = '0600000d-0000-4000-8000-000000000002';
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
values ('0600009f-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000002', '0600009e-0000-4000-8000-000000000002',
        '00000000-0000-4000-b000-000000000003');


insert into app.job (id, tenant_id, job_type, payload, idempotency_key, status, attempts, lease_owner, lease_expires_at)
values ('06000090-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', 'publication.build',
        '{"publication_id":"0600009f-0000-4000-8000-000000000002"}', 'publication.build:0600009f-0000-4000-8000-000000000002',
        'running', 1, 'test-publication', now() + interval '1 hour');

set local role etare_worker;
select is(
  (select count(*) from app.worker_start_publication('0600009f-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000000', '06000090-0000-4000-8000-000000000002', 1)),
  0::bigint,
  'a job of another SIS does not start the build'
);
select is(
  (select storage_key from app.worker_publication_assets('06000000-0000-4000-8000-000000000000', array['06000005-0000-4000-8000-000000000001'::uuid])),
  'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000001/06000005-0000-4000-8000-0000000000a1',
  'the worker reads the key of a checked plan background of the SIS'
);
select is(
  (select count(*) from app.worker_publication_assets('83000000-0000-4000-8000-000000000000', array['06000005-0000-4000-8000-000000000001'::uuid])),
  0::bigint,
  'never a file of another SIS'
);
select results_eq(
  $$ select publication_number, content_hash, approved_by_name
     from app.worker_start_publication('0600009f-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', '06000090-0000-4000-8000-000000000002', 1) $$,
  $$ values (2, repeat('c', 64), 'Validateur Prévision 06 (démo)') $$,
  'the build reads the frozen revision and its approval'
);
select is(
  app.worker_complete_publication('0600009f-0000-4000-8000-000000000002', '{}', '{"files": []}', repeat('d', 64), null, null,
    '06000090-0000-4000-8000-000000000002', 2), null, 'an attempt that does not own the lease cannot publish');
select is(app.worker_fail_publication('0600009f-0000-4000-8000-000000000002', 'LATE_FAILURE',
    '06000090-0000-4000-8000-000000000002', 2), false, 'a stale attempt cannot fail the publication');
select throws_ok($$ select app.worker_complete_publication('0600009f-0000-4000-8000-000000000002', '{}',
    '{"files":[{"path":"etare.pdf","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}',
    repeat('d',64), 'test', 'tenants/other/pdf.pdf', '06000090-0000-4000-8000-000000000002', 1) $$,
    '23514', 'PDF_STORAGE_KEY_MISMATCH', 'the object key must match the tenant, publication and manifest PDF hash');
select is(
  app.worker_complete_publication('0600009f-0000-4000-8000-000000000002', '{"data": {}}', jsonb_build_object('files', jsonb_build_array(jsonb_build_object('path','etare.pdf','sha256',repeat('a',64)))),
                                  repeat('d', 64), 'etare-pdf/2', 'tenants/06000000-0000-4000-8000-000000000000/publications/0600009f-0000-4000-8000-000000000002/etare-' || repeat('a',64) || '.pdf', '06000090-0000-4000-8000-000000000002', 1),
  'published',
  'the built publication is activated'
);

reset role;
select results_eq(
  $$ select id::text, status from app.publication where site_id = '06000002-0000-4000-8000-000000000001' order by publication_number $$,
  $$ values ('0600000f-0000-4000-8000-000000000001', 'superseded'), ('0600009f-0000-4000-8000-000000000002', 'published') $$,
  'the previous version is superseded'
);
select is(
  (select active_publication_id from app.site where id = '06000002-0000-4000-8000-000000000001'),
  '0600009f-0000-4000-8000-000000000002'::uuid,
  'the site points to the new version'
);
select throws_ok(
  $$ update app.publication set payload = '{}' where id = '0600009f-0000-4000-8000-000000000002' $$,
  '42501', null,
  'the published content never changes'
);

-- An older build finishing late never replaces the newer publication.
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by, status)
values ('0600009f-0000-4000-8000-000000000003', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000002', '0600009e-0000-4000-8000-000000000002',
        '00000000-0000-4000-b000-000000000003', 'queued');
update app.publication set status = 'building' where id = '0600009f-0000-4000-8000-000000000003';

insert into app.job (id, tenant_id, job_type, payload, idempotency_key, status, attempts, lease_owner, lease_expires_at)
values ('06000090-0000-4000-8000-000000000003', '06000000-0000-4000-8000-000000000000', 'publication.build',
        '{"publication_id":"0600009f-0000-4000-8000-000000000003"}', 'publication.build:0600009f-0000-4000-8000-000000000003',
        'running', 1, 'test-publication', now() + interval '1 hour');

set local role etare_worker;
select is(
  app.worker_fail_publication('0600009f-0000-4000-8000-000000000003', 'PDF_RENDER_FAILED', '06000090-0000-4000-8000-000000000003', 1),
  true,
  'a failed build is recorded'
);
reset role;
select results_eq(
  $$ select status, failure_code from app.publication where id = '0600009f-0000-4000-8000-000000000003' $$,
  $$ values ('failed', 'PDF_RENDER_FAILED') $$,
  'with its code'
);
select is(
  (select active_publication_id from app.site where id = '06000002-0000-4000-8000-000000000001'),
  '0600009f-0000-4000-8000-000000000002'::uuid,
  'and the active version stays available'
);


-- The old unfenced functions are gone, including for service callers.
select is(to_regprocedure('app.worker_start_publication(uuid,uuid)'), null, 'unfenced start removed');
select is(to_regprocedure('app.worker_complete_publication(uuid,jsonb,jsonb,text,text)'), null, 'unfenced completion removed');
select is(to_regprocedure('app.worker_fail_publication(uuid,text)'), null, 'unfenced failure removed');
select throws_ok($$ update app.publication set pdf_storage_key = 'other.pdf' where id = '0600009f-0000-4000-8000-000000000002' $$,
  '42501', null, 'a published PDF key is immutable');

-- More independent publication requests, all still pointing to the same approved revision.
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
select ('0600009f-0000-4000-8000-00000000000' || n)::uuid, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by
from app.publication cross join generate_series(4, 7) n where id = '0600009f-0000-4000-8000-000000000002';
update app.publication set status = 'building' where id::text in
  ('0600009f-0000-4000-8000-000000000004','0600009f-0000-4000-8000-000000000005');
insert into app.job (id, tenant_id, job_type, payload, idempotency_key, status, attempts, max_attempts, lease_owner, lease_expires_at)
select ('06000090-0000-4000-8000-00000000000' || n)::uuid, '06000000-0000-4000-8000-000000000000', 'publication.build',
  jsonb_build_object('publication_id', '0600009f-0000-4000-8000-00000000000' || n),
  case when n = 7 then null else 'publication.build:0600009f-0000-4000-8000-00000000000' || n end,
  'running', case when n in (4,5) then 5 else 1 end, 5, 'test-publication',
  case when n = 5 then now() - interval '1 second' else now() + interval '1 hour' end
from generate_series(4, 7) n;

set local role etare_worker;
select is((select count(*) from app.worker_start_publication('0600009f-0000-4000-8000-000000000007',
  '06000000-0000-4000-8000-000000000000', '06000090-0000-4000-8000-000000000007', 1)), 0::bigint,
  'a job without the canonical idempotency key cannot start');
select is(app.worker_complete_publication('0600009f-0000-4000-8000-000000000005', '{}', '{"files":[]}', repeat('d',64), null, null,
  '06000090-0000-4000-8000-000000000005', 5), null, 'an expired lease cannot publish even before reclamation');
select is((select count(*) from app.worker_start_publication('0600009f-0000-4000-8000-000000000005',
  '06000000-0000-4000-8000-000000000000', '06000090-0000-4000-8000-000000000005', 5)), 0::bigint, 'an expired lease cannot start');
select is(app.worker_fail_publication('0600009f-0000-4000-8000-000000000005', 'LATE_FAILURE',
  '06000090-0000-4000-8000-000000000005', 5), false, 'an expired lease cannot fail');
select is(app.fail_job('06000090-0000-4000-8000-000000000004', 'test-publication', 'STORAGE_UNAVAILABLE', 30), 'dead',
  'the last transient failure exhausts retries');
select is(app.fail_job('06000090-0000-4000-8000-000000000006', 'test-publication', 'UNKNOWN_JOB_TYPE', null), 'dead',
  'a permanent queue failure is terminal even before the handler starts');
-- claim_jobs also reaps expired leases; no other queue changes escape this rollback.
select count(*) from app.claim_jobs('test-reaper', 1, 60);
reset role;
select results_eq($$ select status, failure_code from app.publication where id = '0600009f-0000-4000-8000-000000000004' $$,
  $$ values ('failed', 'STORAGE_UNAVAILABLE') $$, 'exhausted retries fail the publication');
select results_eq($$ select status, failure_code from app.publication where id = '0600009f-0000-4000-8000-000000000005' $$,
  $$ values ('failed', 'LEASE_EXPIRED') $$, 'the final expired lease fails the publication');
select results_eq($$ select status, failure_code from app.publication where id = '0600009f-0000-4000-8000-000000000006' $$,
  $$ values ('failed', 'UNKNOWN_JOB_TYPE') $$, 'a queued publication follows its dead job');
select is((select active_publication_id from app.site where id = '06000002-0000-4000-8000-000000000001'),
  '0600009f-0000-4000-8000-000000000002'::uuid, 'all terminal failures preserve the active version');

select * from finish();
rollback;
