-- Sprint 5: field reports sent by terminals and instructed by the Prévision (OPS-04, ADR-017).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', 'bbbbbbbb-0000-4000-8000-000000000140', 'mobile')
$$;

-- A report as the terminal sends it (client identifier given by the test).
create function pg_temp.report(p_client text, p_description text default 'Portail secondaire condamné.',
                               p_item text default '06000009-0000-4000-8000-000000000004') returns jsonb
language sql as $$
  select jsonb_build_object(
    'client_report_id', p_client, 'site_id', '06000002-0000-4000-8000-000000000001',
    'publication_id', '0600009f-0000-4000-8000-000000000140', 'category', 'access', 'severity', 'urgent',
    'description', p_description, 'observed_at', '2026-10-01T08:00:00Z',
    'item_type', case when p_item is null then null else 'object' end, 'item_id', p_item,
    'plan_revision_id', null, 'plan_x', null, 'plan_y', null)
$$;

create function pg_temp.photo(p_asset text) returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'asset_id', p_asset,
    'storage_key', 'tenants/06000000-0000-4000-8000-000000000000/assets/' || p_asset || '/v1',
    'quarantine_key', 'tenants/06000000-0000-4000-8000-000000000000/quarantine/' || p_asset || '/v1',
    'filename', 'portail.jpg', 'mime_type', 'image/jpeg', 'size_bytes', 2048, 'sha256', repeat('c', 64)))
$$;

select plan(27);

select set_eq(
  $$ select r.code from app.role_permission rp join app.role r on r.id = rp.role_id
     where rp.permission_code = 'field_report:review' and r.tenant_id is null $$,
  array['SIS_ADMIN', 'PREVISION_EDITOR', 'PREVISION_VALIDATOR'],
  'reports are instructed by the Prévision and the SIS administration'
);

-- An enrolled terminal and a signed version of the EHPAD, as distributed.
insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by) values
  ('06000010-0000-4000-8000-000000000140', '06000000-0000-4000-8000-000000000000', 'TABLETTE SIGNALEMENTS', 'active',
   'android', 'QbpJ3fW0XHvp4u1tf5uEHNfvLE2fYVc2pMQ9rqhP5nI=', now(), '00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-b000-000000000001');
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
values ('0600009f-0000-4000-8000-000000000140', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000001',
        '00000000-0000-4000-b000-000000000003');
update app.publication set status = 'building' where id = '0600009f-0000-4000-8000-000000000140';
update app.publication
set status = 'ready', payload = '{"data": {}}'::jsonb,
    manifest = jsonb_build_object('data_file', 'data/site.json', 'files', '[]'::jsonb),
    manifest_hash = repeat('9', 64),
    manifest_signature = jsonb_build_object('algorithm', 'Ed25519', 'key_id', 'ed25519-test', 'signature', repeat('A', 86) || '==')
where id = '0600009f-0000-4000-8000-000000000140';
update app.publication set status = 'superseded', superseded_at = now() where id = '0600000f-0000-4000-8000-000000000001';
update app.publication set status = 'published', published_at = now(), published_by = '00000000-0000-4000-b000-000000000003'
where id = '0600009f-0000-4000-8000-000000000140';

-- -----------------------------------------------------------------------------
-- Sending from the terminal (OPS user: offline:download and field_report:create)
-- -----------------------------------------------------------------------------
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');

select is(
  (select created from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
     pg_temp.report('0600aaaa-0000-4000-8000-000000000001'), pg_temp.photo('06000005-0000-4000-8000-0000000014a1'))),
  true, 'an agent sends a report with a photo from an enrolled terminal'
);
select is(
  (select created from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
     pg_temp.report('0600aaaa-0000-4000-8000-000000000001'), pg_temp.photo('06000005-0000-4000-8000-0000000014a2'))),
  false, 'the same report sent again (lost acknowledgement) is not recorded twice'
);
select throws_ok(
  $$ select * from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
       pg_temp.report('0600aaaa-0000-4000-8000-000000000001', 'Autre constat'), '[]'::jsonb) $$,
  'ETRPM', null, 'another content under the same identifier is refused'
);
select throws_ok(
  $$ select * from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
       pg_temp.report('0600aaaa-0000-4000-8000-000000000002', 'Constat', '06000009-0000-4000-8000-0000000000ff'), '[]'::jsonb) $$,
  'ETRPI', null, 'a report designates an element of the version consulted'
);
select throws_ok(
  $$ select * from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
       pg_temp.report('0600aaaa-0000-4000-8000-000000000003') || jsonb_build_object(
         'plan_revision_id', '06000007-0000-4000-8000-000000000001', 'plan_x', 10, 'plan_y', 10), '[]'::jsonb) $$,
  'ETRPI', null, 'a position designates a plan of the version consulted'
);
select throws_ok(
  $$ select * from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
       pg_temp.report('0600aaaa-0000-4000-8000-000000000004') || '{"observed_at": "2099-01-01T00:00:00Z"}'::jsonb,
       '[]'::jsonb) $$,
  'ETRPI', null, 'an observation is never dated in the future'
);
select is(
  (select count(*) from app.sync_report_photos('06000010-0000-4000-8000-000000000140',
     (select id from app.field_report where client_report_id = '0600aaaa-0000-4000-8000-000000000001'))
   where scan_status = 'pending'),
  1::bigint, 'the photo waits for its file (the replay did not add another one)'
);
select is(
  app.sync_report_uploaded('06000010-0000-4000-8000-000000000140',
    (select id from app.field_report where client_report_id = '0600aaaa-0000-4000-8000-000000000001')),
  1, 'once sent, the photo is planned for verification'
);
select is(
  (select jsonb_array_length(app.sync_reports('06000010-0000-4000-8000-000000000140'))),
  1, 'the agent follows the reports sent from this terminal'
);
update app.field_report set status = 'rejected', decision_comment = 'non';
select is(
  (select status from app.field_report where client_report_id = '0600aaaa-0000-4000-8000-000000000001'),
  'new', 'an agent sees their report but cannot instruct it'
);

reset role;
select is(
  (select count(*) from app.site_edit where user_id = '00000000-0000-4000-b000-000000000004'),
  0::bigint, 'sending a photo does not make the agent a contributor of the working data'
);
select is(
  (select count(*) from app.job where idempotency_key = 'asset.verify:06000005-0000-4000-8000-0000000014a1'),
  1::bigint, 'one verification job per photo'
);
select isnt(
  (select count(*) from app.audit_event where entity_type = 'field_report' and action = 'field_report.insert'),
  0::bigint, 'the reception is audited'
);
select throws_ok(
  $$ update app.field_report set description = 'Réécrit' where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'an observation from the field is never modified, even by the owner of the tables'
);
select throws_ok(
  $$ delete from app.field_report where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  '42501', null, 'reports are never deleted'
);

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ select * from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
       pg_temp.report('0600aaaa-0000-4000-8000-000000000005'), '[]'::jsonb) $$,
  '42501', null, 'a reader without offline access sends nothing'
);
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ select * from app.sync_submit_report('06000010-0000-4000-8000-000000000140',
       pg_temp.report('0600aaaa-0000-4000-8000-000000000006'), '[]'::jsonb) $$,
  '42501', null, 'creating a report requires field_report:create'
);

-- -----------------------------------------------------------------------------
-- Instruction by the Prévision
-- -----------------------------------------------------------------------------
select is((select count(*) from app.field_report where client_report_id = '0600aaaa-0000-4000-8000-000000000001'),
  1::bigint, 'the Prévision sees the reports of its sites');
select lives_ok(
  $$ update app.field_report set status = 'triaged', assigned_to = '00000000-0000-4000-b000-000000000002'
     where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  'an editor takes the report in charge'
);
select throws_ok(
  $$ update app.field_report set assigned_to = '00000000-0000-4000-b000-000000000007'
     where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'a report is assigned to a member of the SIS only'
);
select throws_ok(
  $$ update app.field_report set resolution_revision_id = '0600000d-0000-4000-8000-000000000001'
     where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'a correction is integrated into a draft revision, never an approved one'
);
select lives_ok(
  $$ update app.field_report set resolution_revision_id = '0600000d-0000-4000-8000-000000000002'
     where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  'the report is linked to the draft revision that integrates the correction'
);
select throws_ok(
  $$ update app.field_report set status = 'resolved' where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'a decision is always motivated'
);
select lives_ok(
  $$ update app.field_report set status = 'resolved', decision_comment = 'Accès corrigé dans la révision n° 2.'
     where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  'the editor resolves the report with a motivated decision'
);
select throws_ok(
  $$ update app.field_report set status = 'rejected', decision_comment = 'Finalement non.'
     where client_report_id = '0600aaaa-0000-4000-8000-000000000001' $$,
  '23514', null, 'a decision is final'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000007', '83000000-0000-4000-8000-000000000000');
select is((select count(*) from app.field_report), 0::bigint, 'another SIS sees none of these reports');

select * from finish();
rollback;
