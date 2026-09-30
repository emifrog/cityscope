-- Sprint 1: administration of the members of a SIS, anti-escalation rules enforced by the database.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid, p_aal text) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, p_aal, 'bbbbbbbb-0000-4000-8000-000000000080', 'web')
$$;

create function pg_temp.tenant_roles(p_membership uuid) returns text[]
language sql as $$
  select coalesce(array_agg(r.code order by r.code), '{}')
  from app.role_binding b join app.role r on r.id = b.role_id
  where b.membership_id = p_membership and b.revoked_at is null and b.scope_type = 'tenant'
$$;

create function pg_temp.version_of(p_membership uuid) returns integer
language sql as $$ select row_version from app.membership where id = p_membership $$;

select plan(21);

-- admin.sis06 = subject ...a000...0001, membership 0600000a-...-01 ; lecteur06 = membership 0600000a-...-06
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal1');

select throws_ok(
  $$ select * from app.admin_add_member('nouveau.membre@demo.etare.test', 'Nouveau', array['READER']) $$,
  '42501', null,
  'managing members requires the second factor, even for a SIS administrator'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');

select is(
  (select count(*) from app.admin_add_member('nouveau.membre@demo.etare.test', 'Nouveau', array['READER'])),
  0::bigint,
  'an unknown address without identity is not created (the invitation comes first)'
);

select is(
  (select account_created from app.admin_add_member('nouveau.membre@demo.etare.test', ' Nouveau Membre ', array['READER', 'OPS_USER'],
                                                    'cccccccc-0000-4000-8000-000000000001')),
  true,
  'with the identity of the invitation, the account and the membership are created'
);
select is(
  pg_temp.tenant_roles((select m.id from app.membership m join app.user_account u on u.id = m.user_id
                        where u.email = 'nouveau.membre@demo.etare.test')),
  array['OPS_USER', 'READER'],
  'the new member holds exactly the granted tenant-wide roles'
);

select is(
  (select account_created from app.admin_add_member('redacteur83@demo.etare.test', null, array['READER'])),
  false,
  'an existing account (member of another SIS) is attached without a new identity'
);
select throws_ok(
  $$ select * from app.admin_add_member('redacteur83@demo.etare.test', null, array['READER']) $$,
  '23505', null,
  'a person is member of a SIS only once'
);
select throws_ok(
  $$ select * from app.admin_add_member('autre@demo.etare.test', null, array['READER'], 'cccccccc-0000-4000-8000-000000000002') $$
  || $$ union all select * from app.admin_add_member('autre@demo.etare.test', null, array['READER'], 'cccccccc-0000-4000-8000-000000000003') $$,
  '23505', null,
  'an address already linked to another identity is refused'
);

select throws_ok(
  $$ select * from app.admin_add_member('plateforme2@demo.etare.test', null, array['SUPER_ADMIN'], 'cccccccc-0000-4000-8000-000000000004') $$,
  '22023', null,
  'a platform role is never granted inside a SIS'
);
select throws_ok(
  $$ select * from app.admin_add_member('exploitant2@demo.etare.test', null, array['EXPLOITANT'], 'cccccccc-0000-4000-8000-000000000005') $$,
  '22023', null,
  'EXPLOITANT is never granted tenant-wide (always limited to sites)'
);

select throws_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000001', pg_temp.version_of('0600000a-0000-4000-8000-000000000001'),
                                    array['SIS_ADMIN', 'PREVISION_VALIDATOR']) $$,
  'ETSLF', null,
  'an administrator cannot change their own roles (no self-escalation)'
);
select throws_ok(
  $$ select * from app.admin_add_member('admin.sis06@demo.etare.test', null, array['READER']) $$,
  'ETSLF', null,
  'an administrator cannot add themselves'
);

select is(
  app.admin_update_member('0600000a-0000-4000-8000-000000000006', pg_temp.version_of('0600000a-0000-4000-8000-000000000006'),
                          array['PREVISION_EDITOR']),
  (select row_version + 1 from app.membership where id = '0600000a-0000-4000-8000-000000000006'),
  'changing roles bumps the version of the membership'
);
select is(pg_temp.tenant_roles('0600000a-0000-4000-8000-000000000006'), array['PREVISION_EDITOR'], 'removed roles are revoked');
select lives_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000006', pg_temp.version_of('0600000a-0000-4000-8000-000000000006'),
                                    array['READER', 'PREVISION_EDITOR']) $$,
  'a revoked role can be granted again (history is kept)'
);
select throws_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000006', 1, array['READER']) $$,
  'ET412', null,
  'a change based on a stale version is refused'
);
select throws_ok(
  $$ select app.admin_update_member('8300000a-0000-4000-8000-000000000007', 1, array['READER']) $$,
  'ET404', null,
  'a membership of another SIS does not exist from here'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal2');
select throws_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000006', pg_temp.version_of('0600000a-0000-4000-8000-000000000006'),
                                    array['SIS_ADMIN']) $$,
  '42501', null,
  'an editor cannot manage members, second factor or not'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');
select lives_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000006', pg_temp.version_of('0600000a-0000-4000-8000-000000000006'),
                                    null, 'suspended') $$,
  'an administrator suspends a member'
);

reset role;
select is(
  (select count(*) from app.audit_event
   where action = 'role_binding.insert' and trace_id = 'bbbbbbbb-0000-4000-8000-000000000080'
     and actor_user_id = '00000000-0000-4000-b000-000000000001'),
  5::bigint,
  'every granted role is audited with the administrator as actor'
);

-- A custom role holding member:manage (future tenant roles) must not remove the last administrator.
insert into app.role (id, tenant_id, code, name, level, is_system)
values ('dddddddd-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', 'MEMBER_MANAGER_TEST', 'Test', 'tenant', false);
insert into app.role_permission (role_id, permission_code) values ('dddddddd-0000-4000-8000-000000000001', 'member:manage');
insert into app.role_binding (tenant_id, membership_id, role_id)
values ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001');

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2');
select throws_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000001', pg_temp.version_of('0600000a-0000-4000-8000-000000000001'),
                                    array['READER']) $$,
  'ETADM', null,
  'a SIS always keeps at least one active administrator'
);

select throws_ok(
  $$ select app.begin_request('supabase', '00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') $$,
  'ET403', null,
  'a suspended member can no longer open a request in the SIS'
);

select * from finish();
rollback;
