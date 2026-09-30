begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(6);

set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
select throws_ok(
  $$ update app.etare_revision set snapshot = '{"edited": true}' where id = '0600000d-0000-4000-8000-000000000002' $$,
  '42501', null, 'a validator cannot use the decision update policy to edit a draft');

reset role;
insert into app.role_binding (tenant_id, membership_id, role_id)
select '06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000003', id
from app.role where code = 'PREVISION_EDITOR';
set local role etare_api;
select lives_ok(
  $$ update app.etare_revision set snapshot = '{"edited": true}' where id = '0600000d-0000-4000-8000-000000000002' $$,
  'a validator with an explicit editor role may edit');
select is(
  (select count(*) from app.etare_revision_contributor
   where revision_id = '0600000d-0000-4000-8000-000000000002' and user_id = '00000000-0000-4000-b000-000000000003'),
  1::bigint, 'the actual editor is recorded automatically');
select throws_ok(
  $$ update app.etare_revision_contributor set user_id = '00000000-0000-4000-b000-000000000006'
     where revision_id = '0600000d-0000-4000-8000-000000000002' and user_id = app.current_user_id() $$,
  '42501', null, 'contributors cannot rewrite attribution to bypass separation of duties');

select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
select throws_ok(
  $$ update app.etare_revision set status = 'submitted', content_hash = repeat('a', 64),
     submitted_by = '00000000-0000-4000-b000-000000000006', submitted_at = now()
     where id = '0600000d-0000-4000-8000-000000000002' $$,
  '42501', null, 'a submission cannot be attributed to another user');
update app.etare_revision set status = 'submitted', content_hash = repeat('a', 64),
  submitted_by = app.current_user_id(), submitted_at = now()
where id = '0600000d-0000-4000-8000-000000000002';

select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
select throws_like(
  $$ insert into app.approval (tenant_id, site_id, revision_id, revision_hash, decision)
     select tenant_id, site_id, id, content_hash, 'approved'
     from app.etare_revision where id = '0600000d-0000-4000-8000-000000000002' $$,
  '%SELF_APPROVAL_FORBIDDEN%', 'a contributor cannot approve, even when another person authored and submitted');

select * from finish();
rollback;
