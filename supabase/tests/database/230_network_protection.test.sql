-- Sprint 9 (SEC-03): rate-limit counters and traces of the sensitive refusals.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(10);

set local role etare_api;

select results_eq(
  $$ select allowed from app.consume_rate_limit(repeat('a', 64), 2, 600) $$,
  array[true],
  'a first hit is allowed'
);
select results_eq(
  $$ select allowed, hits from app.consume_rate_limit(repeat('a', 64), 2, 600) $$,
  $$ values (true, 2) $$,
  'the second hit is counted in the same window'
);
select results_eq(
  $$ select allowed, retry_after between 1 and 600 from app.consume_rate_limit(repeat('a', 64), 2, 600) $$,
  $$ values (false, true) $$,
  'beyond the limit, refused with the delay before the next window'
);
select throws_ok(
  $$ select * from app.consume_rate_limit(repeat('b', 64), 0, 600) $$,
  '22023', null,
  'a limit must be positive'
);
select throws_ok(
  $$ select * from app.consume_rate_limit('not a hash', 5, 60) $$,
  '23514', null,
  'keys are hashes: no identifier nor address in clear'
);
select throws_ok($$ select * from app.rate_limit_bucket $$, '42501', null, 'the API cannot read the counters');

-- Refusals: the person when the token was verified, the SIS only when the person belongs to it.
select lives_ok(
  $$ select app.record_security_event('supabase', '00000000-0000-4000-a000-000000000007',
       '06000000-0000-4000-8000-000000000000', 'security.forbidden', 'Accès refusé.',
       'bbbbbbbb-0000-4000-8000-000000000230', 'web', '{"route": "/sites"}') $$,
  'a refusal is recorded'
);
select throws_ok(
  $$ select app.record_security_event(null, null, null, 'member.update', 'x', null, 'web', '{}') $$,
  '22023', null,
  'only security events'
);
reset role;
select results_eq(
  $$ select outcome, tenant_id, actor_user_id from app.audit_event
     where trace_id = 'bbbbbbbb-0000-4000-8000-000000000230' $$,
  $$ values ('denied'::text, null::uuid, '00000000-0000-4000-b000-000000000007'::uuid) $$,
  'redacteur83 is named, SIS 06 is not (not a member)'
);

set local role etare_worker;
select lives_ok($$ select app.worker_purge_rate_limits() $$, 'the worker purges old windows');

select * from finish();
rollback;
