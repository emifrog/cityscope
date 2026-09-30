-- RBAC, MFA structure and separation of duties (editor != validator).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(14);

-- ------------------------------------------------------------------ roles
select set_eq(
  $$ select code from app.role where is_system $$,
  array['SUPER_ADMIN', 'SIS_ADMIN', 'PREVISION_EDITOR', 'PREVISION_VALIDATOR', 'OPS_USER', 'EXPLOITANT', 'READER'],
  'the fundamental system roles exist'
);

select is(
  (select count(*) from app.role_permission rp join app.role r on r.id = rp.role_id where r.code = 'SUPER_ADMIN'),
  0::bigint,
  'SUPER_ADMIN grants no business permission'
);

select throws_ok(
  $$ insert into app.role_binding (tenant_id, membership_id, role_id)
     select '06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000001', id
     from app.role where code = 'SUPER_ADMIN' $$,
  '23514', null,
  'a platform role cannot be bound inside a tenant'
);

select is(
  (select count(*) from app.role_permission rp join app.role r on r.id = rp.role_id
   where r.code = 'SIS_ADMIN' and rp.permission_code in ('etare:approve', 'publication:publish')),
  0::bigint,
  'SIS_ADMIN cannot validate nor publish without the validator role'
);

select is(
  (select count(*) from app.role_permission rp join app.role r on r.id = rp.role_id
   where r.code = 'PREVISION_EDITOR' and rp.permission_code in ('etare:approve', 'publication:publish')),
  0::bigint,
  'PREVISION_EDITOR cannot validate nor publish'
);

-- ------------------------------------------------------------------ MFA (aal2)
set local role etare_api;
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') $$,
  'validateur06 without second factor'
);
select ok(not app.has_permission('etare:approve'), 'approval requires aal2 (second factor)');
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') $$,
  'validateur06 with second factor'
);
select ok(app.has_permission('etare:approve'), 'validateur06 may approve at aal2');

-- ------------------------------------------------------------------ separation of duties
-- redacteur06 submits revision 2 of ETARE 06-0428.
select lives_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') $$,
  'redacteur06 opens a request'
);
select lives_ok(
  $$ update app.etare_revision
     set status = 'submitted', snapshot = '{"schema_version": 1, "demo": true}',
         content_hash = encode(extensions.digest('{"demo": true, "schema_version": 1}', 'sha256'), 'hex'),
         submitted_by = app.current_user_id(), submitted_at = now()
     where id = '0600000d-0000-4000-8000-000000000002' $$,
  'the editor submits the draft revision'
);

-- The editor is also granted the validator role: cumulating roles must not allow self-approval.
reset role;
insert into app.role_binding (tenant_id, membership_id, role_id)
select '06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000002', id
from app.role where code = 'PREVISION_VALIDATOR';
set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset

select throws_like(
  $$ insert into app.approval (tenant_id, site_id, revision_id, revision_hash, decision)
     select tenant_id, site_id, id, content_hash, 'approved' from app.etare_revision where id = '0600000d-0000-4000-8000-000000000002' $$,
  '%SELF_APPROVAL_FORBIDDEN%',
  'the author of a revision cannot approve it, even with the validator role'
);

-- The distinct validator must review the exact content (hash).
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
select throws_like(
  $$ insert into app.approval (tenant_id, site_id, revision_id, revision_hash, decision)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '0600000d-0000-4000-8000-000000000002', repeat('0', 64), 'approved') $$,
  '%REVISION_HASH_MISMATCH%',
  'an approval bound to another content is rejected'
);

select lives_ok(
  $$ insert into app.approval (tenant_id, site_id, revision_id, revision_hash, decision)
     select tenant_id, site_id, id, content_hash, 'approved' from app.etare_revision where id = '0600000d-0000-4000-8000-000000000002' $$,
  'a distinct validator approves the exact submitted content'
);

select * from finish();
rollback;
