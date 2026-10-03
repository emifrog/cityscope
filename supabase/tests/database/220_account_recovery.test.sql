-- Sprint 9 (SEC-02): recovery codes, reset by the SIS administration, new second factor required.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.open(p_subject text, p_aal text, p_purpose text default null,
                             p_tenant uuid default '06000000-0000-4000-8000-000000000000',
                             p_session uuid default null)
returns text[]
language sql as $$
  select permissions from app.begin_request('supabase', p_subject, p_tenant, p_aal,
    'bbbbbbbb-0000-4000-8000-000000000220', 'web', p_session, null, p_purpose)
$$;

create function pg_temp.version_of(p_membership uuid) returns integer
language sql as $$ select row_version from app.membership where id = p_membership $$;

create temp table codes (code text) on commit drop;
grant select, insert on codes to etare_api;

select plan(26);

-- Independent of earlier sign-ins on the local stack (rolled back with the test).
delete from auth.mfa_factors where user_id in ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000006');
delete from auth.sessions where user_id in ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000006');

-- validateur06 (…0003) has a verified factor and two sessions; lecteur06 (…0006) has a factor too.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('22000000-0000-4000-8000-000000000003', '00000000-0000-4000-a000-000000000003', 'test', 'totp', 'verified', now(), now()),
  ('22000000-0000-4000-8000-000000000006', '00000000-0000-4000-a000-000000000006', 'test', 'totp', 'verified', now(), now());
insert into auth.sessions (id, user_id, created_at, updated_at, aal) values
  ('22000001-0000-4000-8000-000000000001', '00000000-0000-4000-a000-000000000003', now(), now(), 'aal1'),
  ('22000001-0000-4000-8000-000000000002', '00000000-0000-4000-a000-000000000003', now(), now(), 'aal2'),
  ('22000001-0000-4000-8000-000000000006', '00000000-0000-4000-a000-000000000006', now(), now(), 'aal2');

set local role etare_api;

-- Codes ------------------------------------------------------------------------------
select pg_temp.open('00000000-0000-4000-a000-000000000002', 'aal1');
select throws_ok(
  $$ select app.regenerate_recovery_codes() $$,
  'ETRCF', null,
  'no recovery code without a second factor'
);
select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal2', p_tenant => null);
insert into codes select app.regenerate_recovery_codes();
select is((select count(*) from codes), 10::bigint, 'ten codes, shown once');
select ok(
  (select bool_and(code ~ '^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$') from codes),
  'readable codes: two groups of five unambiguous characters'
);
select results_eq(
  $$ select remaining from app.recovery_codes_state() $$,
  array[10],
  'the account knows how many codes remain, never the codes'
);
select throws_ok($$ select * from app.recovery_code $$, '42501', null, 'the API cannot read the codes');
insert into codes select app.regenerate_recovery_codes();
select results_eq(
  $$ select remaining from app.recovery_codes_state() $$,
  array[10],
  'regenerating replaces the previous codes'
);

-- Recovery -------------------------------------------------------------------------------
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal1', p_tenant => null) $$,
  'ETMFA', null,
  'without the factor, the enrolled account is refused...'
);
select lives_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal1', 'recovery', null,
       '22000001-0000-4000-8000-000000000001') $$,
  '...except to use a recovery code'
);
select throws_ok(
  $$ select app.use_recovery_code((select code from codes limit 1)) $$,
  'ETRCV', null,
  'a replaced code is worthless'
);
select throws_ok($$ select app.use_recovery_code('AAAAA-AAAAA') $$, 'ETRCV', null, 'an unknown code is refused');
select lives_ok(
  $$ select app.use_recovery_code(lower((select code from codes offset 15 limit 1))) $$,
  'a valid code is accepted (case and dashes do not matter)'
);
select throws_ok(
  $$ select app.use_recovery_code((select code from codes offset 15 limit 1)) $$,
  'ETRCV', null,
  'a code is used once'
);
reset role;
select is(
  (select count(*) from auth.mfa_factors where user_id = '00000000-0000-4000-a000-000000000003'),
  0::bigint,
  'the lost factor is removed'
);
select results_eq(
  $$ select id from auth.sessions where user_id = '00000000-0000-4000-a000-000000000003' $$,
  array['22000001-0000-4000-8000-000000000001'::uuid],
  'the other sessions are closed, not the one recovering'
);
select is(
  (select count(*) from app.recovery_code
   where user_id = '00000000-0000-4000-b000-000000000003' and used_at is null and revoked_at is null),
  0::bigint,
  'the remaining codes are revoked'
);
select is(
  (select kind from app.notification where recipient_id = '00000000-0000-4000-b000-000000000003'
   order by created_at desc limit 1),
  'second_factor_recovered',
  'the person is alerted by e-mail'
);
select is(
  (select count(*) from app.audit_event where action = 'account.second_factor_recover'
   and entity_id = '00000000-0000-4000-b000-000000000003' and occurred_at >= now()),
  1::bigint,
  'the recovery is audited'
);
set local role etare_api;
select throws_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal1') $$,
  'ETMFR', null,
  'a new factor is required before any access'
);
select lives_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal1', 'profile', null) $$,
  'the profile stays readable'
);
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('22000000-0000-4000-8000-000000000013', '00000000-0000-4000-a000-000000000003', 'new', 'totp', 'verified', now(), now());
set local role etare_api;
select lives_ok(
  $$ select pg_temp.open('00000000-0000-4000-a000-000000000003', 'aal2') $$,
  'with the new factor in use, access is back'
);
select ok(
  not (select second_factor_reenrollment from app.user_account where id = '00000000-0000-4000-b000-000000000003'),
  'and nothing more is awaited'
);

-- Reset by the administration ---------------------------------------------------------------
select pg_temp.open('00000000-0000-4000-a000-000000000001', 'aal2');
select throws_ok(
  $$ select app.admin_reset_second_factor('0600000a-0000-4000-8000-000000000002',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000002')) $$,
  'ETRCF', null,
  'nothing to reset without a second factor'
);
select throws_ok(
  $$ select app.admin_reset_second_factor('0600000a-0000-4000-8000-000000000001',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000001')) $$,
  'ETSLF', null,
  'nobody resets their own second factor'
);
select lives_ok(
  $$ select app.admin_reset_second_factor('0600000a-0000-4000-8000-000000000006',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000006')) $$,
  'the administrator resets the second factor of lecteur06'
);
reset role;
select is(
  (select count(*) from auth.sessions where user_id = '00000000-0000-4000-a000-000000000006')
    + (select count(*) from auth.mfa_factors where user_id = '00000000-0000-4000-a000-000000000006'),
  0::bigint,
  'factor and sessions of the member are gone'
);
set local role etare_api;
select pg_temp.open('00000000-0000-4000-a000-000000000001', 'aal1');
select throws_ok(
  $$ select app.admin_reset_second_factor('0600000a-0000-4000-8000-000000000003',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000003')) $$,
  '42501', null,
  'a reset needs the second factor of the administrator'
);

select * from finish();
rollback;
