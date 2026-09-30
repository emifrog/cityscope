-- Sprint 3: publication built by the worker from the approved snapshot only; names of members.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', null, 'web')
$$;

select plan(12);

-- Names of members: only within the current SIS.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');
select is(app.member_name('00000000-0000-4000-b000-000000000003'), 'Validateur Prévision 06 (démo)', 'a member of the SIS is named');
select is(app.member_name('00000000-0000-4000-b000-000000000007'), null, 'a member of another SIS is not');
select throws_ok(
  $$ select * from app.worker_start_publication('0600000f-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000') $$,
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

set local role etare_worker;
select is(
  (select count(*) from app.worker_start_publication('0600009f-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000000')),
  0::bigint,
  'a job of another SIS does not start the build'
);
select results_eq(
  $$ select publication_number, content_hash, approved_by_name
     from app.worker_start_publication('0600009f-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000') $$,
  $$ values (2, repeat('c', 64), 'Validateur Prévision 06 (démo)') $$,
  'the build reads the frozen revision and its approval'
);
select is(
  app.worker_complete_publication('0600009f-0000-4000-8000-000000000002', '{"data": {}}', '{"files": []}',
                                  repeat('d', 64), null),
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
set local role etare_worker;
select is(
  app.worker_fail_publication('0600009f-0000-4000-8000-000000000003', 'PDF_RENDER_FAILED'),
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

select * from finish();
rollback;
