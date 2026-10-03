-- Sprint 9 (SEC-02): second factor of enrolled accounts enforced by the database, terminal key as
-- possession factor, second-factor policy of the SIS, sessions checked and revocable.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.open(p_subject text, p_aal text, p_session uuid default null, p_device uuid default null,
                             p_purpose text default null, p_tenant uuid default '06000000-0000-4000-8000-000000000000')
returns text[]
language sql as $$
  select permissions from app.begin_request('supabase', p_subject, p_tenant, p_aal,
    'bbbbbbbb-0000-4000-8000-000000000210', 'web', p_session, p_device, p_purpose)
$$;

create function pg_temp.version_of(p_membership uuid) returns integer
language sql as $$ select row_version from app.membership where id = p_membership $$;

select plan(31);

-- Independent of earlier sign-ins on the local stack (rolled back with the test).
delete from auth.sessions where user_id in ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000006');
delete from auth.mfa_factors where user_id in (
  '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004'
);

-- validateur06 (…0003) and ops06 (…0004) have a verified TOTP factor; redacteur06 (…0002) has none.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('21000000-0000-4000-8000-000000000003', '00000000-0000-4000-a000-000000000003', 'test', 'totp', 'verified', now(), now()),
  ('21000000-0000-4000-8000-000000000004', '00000000-0000-4000-a000-000000000004', 'test', 'totp', 'verified', now(), now()),
  ('21000000-0000-4000-8000-000000000002', '00000000-0000-4000-a000-000000000002', 'pending', 'totp', 'unverified', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('21000001-0000-4000-8000-000000000001', '00000000-0000-4000-a000-000000000003', now(), now(), 'aal2'),
  ('21000001-0000-4000-8000-000000000002', '00000000-0000-4000-a000-000000000003', now() - interval '1 day', now(), 'aal1'),
  ('21000001-0000-4000-8000-000000000006', '00000000-0000-4000-a000-000000000006', now(), now(), 'aal1'),
  ('21000001-0000-4000-8000-000000000007', '00000000-0000-4000-a000-000000000006', now(), now(), 'aal1');
insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by) values
  ('06000010-0000-4000-8000-000000000210', '06000000-0000-4000-8000-000000000000', 'TABLETTE 210', 'active',
   'android', 'RBT2z2voNAO9JYKeVAH6W8barTg7dr9gu6JIi5OjM0U=', now(), '00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-b000-000000000001');

set local role etare_api;

-- Enrolled accounts -----------------------------------------------------------
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal1') $$,
  'ETMFA', null,
  'an enrolled account without its code is refused for any request, not only sensitive ones'
);
select ok(
  'publication:publish' = any (pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal2')),
  'with its code, the enrolled account has all its permissions'
);
select is(
  pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal1', p_purpose => 'profile'),
  '{}'::text[],
  'reading one''s own profile is allowed without the code, with no permission at all'
);
select is(
  pg_temp.open('00000000-0000-4000-a000-000000000002', 'aal1') @> array['site:write'],
  true,
  'an account without a verified factor keeps its ordinary permissions (unverified enrollment ignored)'
);

-- The key of an enrolled terminal is the possession factor -------------------
select set_eq(
  $$ select unnest(pg_temp.open('00000000-0000-4000-a000-000000000004', 'aal1',
       p_device => '06000010-0000-4000-8000-000000000210')) $$,
  array['field_report:create', 'offline:download', 'publication:read'],
  'an enrolled agent on an enrolled terminal keeps the synchronisation permissions'
);
select is(app.current_factor_scope(), 'device', 'the request runs in the terminal scope');
select ok(
  not ('site:read' = any (pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal1',
         p_device => '06000010-0000-4000-8000-000000000210'))),
  'nothing beyond synchronisation in the terminal scope, whatever the roles of the person'
);
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000004', 'aal1', p_device => '06000010-0000-4000-8000-000000000121') $$,
  'ETMFA', null,
  'a terminal that is not enrolled (pending) is no possession factor'
);
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000004', 'aal1', p_device => '83000010-0000-4000-8000-000000000121') $$,
  'ETMFA', null,
  'nor is a terminal of another SIS'
);
select is(
  pg_temp.open('00000000-0000-4000-a000-000000000004', 'aal1', p_purpose => 'enrollment'),
  array['offline:download'],
  'the single-use enrollment code lets an enrolled agent enroll a terminal, nothing else'
);
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000004', 'aal1', p_device => '06000010-0000-4000-8000-000000000210',
       p_purpose => 'enrollment') $$,
  '22023', null,
  'a terminal request has no other purpose'
);

-- Sessions ---------------------------------------------------------------------
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal2', '21000001-0000-4000-8000-0000000000ff') $$,
  'ETSES', null,
  'a token whose session is closed is refused'
);
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000002', 'aal1', '21000001-0000-4000-8000-000000000001') $$,
  'ETSES', null,
  'the session of another person does not open a request'
);
select lives_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal2', '21000001-0000-4000-8000-000000000001') $$,
  'an open session opens the request'
);
select results_eq(
  $$ select is_current from app.my_sessions() order by created_at $$,
  array[false, true],
  'one''s own sessions, the current one flagged'
);
select is(app.revoke_my_sessions(), 1, 'closing the other sessions keeps the current one');
select is(
  (select count(*) from app.my_sessions()),
  1::bigint,
  'only the current session remains'
);
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal2', '21000001-0000-4000-8000-000000000002') $$,
  'ETSES', null,
  'the token of a closed session is refused at its next request'
);

-- A suspension closes every session of the member -----------------------------
select pg_temp.open('00000000-0000-4000-a000-000000000001', 'aal2');
select lives_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000006',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000006'), null, 'suspended') $$,
  'the administrator suspends lecteur06'
);
reset role;
select is(
  (select count(*) from auth.sessions where user_id = '00000000-0000-4000-a000-000000000006'),
  0::bigint,
  'every session of the suspended member is closed'
);
select is(
  (select metadata ->> 'count' from app.audit_event where action = 'member.sessions_revoke' order by occurred_at desc limit 1),
  '2',
  'the closing is audited with the number of sessions'
);
set local role etare_api;
select pg_temp.open('00000000-0000-4000-a000-000000000001', 'aal2');
select results_eq(
  $$ select second_factor from app.member_identity_states()
     where user_id in ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-b000-000000000002') order by user_id $$,
  array[false, true],
  'administrators see who has a second factor'
);

-- Second-factor policy of the SIS -----------------------------------------------
select is((select second_factor_policy from app.security_settings()), 'privileged', 'default policy: sensitive actions');
select is(app.update_security_settings('all'), 'all', 'the administrator, with the code, requires it for every access');
reset role;
select is(
  (select metadata ->> 'after' from app.audit_event where action = 'tenant.security_settings' order by occurred_at desc limit 1),
  'all',
  'the change is audited'
);
set local role etare_api;
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000002', 'aal1') $$,
  'ETMFE', null,
  'a member without a second factor must enroll one before any access'
);
select pg_temp.open('00000000-0000-4000-a000-000000000002', 'aal2');
select is(
  (select second_factor_required from app.my_memberships()),
  true,
  'GET /me tells whether the SIS requires it'
);
select throws_ok(
  $$ select app.update_security_settings('privileged') $$,
  '42501', null,
  'only member managers change the policy'
);
select lives_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000005', 'aal1') $$,
  'exploitants stay governed by the portal setting'
);
select pg_temp.open('00000000-0000-4000-a000-000000000001', 'aal2');
select is(app.update_security_settings('privileged'), 'privileged', 'back to the default policy');
select pg_temp.open('00000000-0000-4000-a000-000000000001', 'aal1');
select throws_ok(
  $$ select app.update_security_settings('none') $$,
  '42501', null,
  'without the code, an administrator holds no member:manage'
);

select * from finish();
rollback;
