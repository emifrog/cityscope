-- Sprint 12 (EXP-03): timing of the jobs, heartbeat, receipt history, purge and metrics (ADR-028).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid, p_aal text default 'aal1') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, p_aal, 'bbbbbbbb-0000-4000-8000-000000000300', 'web')
$$;

select plan(22);

-- A queue of its own: whatever the local stack holds is out of the way (rolled back).
update app.job set status = 'succeeded', lease_owner = null, lease_expires_at = null, completed_at = now()
where status in ('queued', 'running');

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('app.worker_heartbeat'::regclass, 'app.device_sync_event'::regclass)),
  'row level security is on for the heartbeats and the receipt history'
);

-- -----------------------------------------------------------------------------
-- Jobs: queue wait and compute time apart
-- -----------------------------------------------------------------------------
insert into app.job (id, tenant_id, job_type, created_at, run_after)
values ('0600009a-0000-4000-8000-000000000300', null, 'system.noop', now() - interval '2 minutes', now() - interval '2 minutes');
set local role etare_worker;
select is((select count(*) from app.claim_jobs('pgtap-300', 1, 60)), 1::bigint, 'the worker claims the job');
reset role;
select ok(
  (select started_at is not null and first_started_at = started_at
          and first_started_at - created_at >= interval '2 minutes'
   from app.job where id = '0600009a-0000-4000-8000-000000000300'),
  'a claim stamps the start of the attempt and the first start (queue wait measurable)'
);
update app.job set status = 'queued', lease_owner = null, lease_expires_at = null,
                   first_started_at = now() - interval '1 minute'
where id = '0600009a-0000-4000-8000-000000000300';
set local role etare_worker;
select is((select count(*) from app.claim_jobs('pgtap-300', 1, 60)), 1::bigint, 'a retry is claimed again');
reset role;
select ok(
  (select first_started_at < started_at from app.job where id = '0600009a-0000-4000-8000-000000000300'),
  'a retry keeps the first start and stamps its own'
);

-- -----------------------------------------------------------------------------
-- Heartbeat and hourly maintenance
-- -----------------------------------------------------------------------------
set local role etare_worker;
select lives_ok(
  $$ select app.worker_beat('pgtap-300', now() - interval '1 hour', '1.2.3', array['publication.build'], 2) $$,
  'the worker beats'
);
select lives_ok(
  $$ select app.worker_beat('pgtap-300', now() - interval '1 hour', '1.2.3', array['publication.build'], 2, true) $$,
  'and says when it stops cleanly'
);
select isnt(app.worker_schedule_database_maintenance('2026-10-28T10'), null, 'one maintenance per hour slot');
select is(app.worker_schedule_database_maintenance('2026-10-28T10'), null, 'never twice for the same slot');
select throws_ok($$ select count(*) from app.worker_heartbeat $$, '42501', null, 'heartbeats are read through functions only');
reset role;
select results_eq(
  $$ select version, stopped_at is not null from app.worker_heartbeat where worker_id = 'pgtap-300' $$,
  $$ values ('1.2.3', true) $$,
  'the heartbeat keeps the version and the clean shutdown'
);

-- Old history to purge, recent history to keep.
insert into app.job (tenant_id, job_type, status, created_at, completed_at) values
  (null, 'system.noop', 'succeeded', now() - interval '40 days', now() - interval '40 days'),
  (null, 'system.noop', 'succeeded', now() - interval '2 days', now() - interval '2 days'),
  (null, 'system.noop', 'dead', now() - interval '40 days', now() - interval '40 days'),
  (null, 'system.noop', 'dead', now() - interval '100 days', now() - interval '100 days');
insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by)
values ('06000010-0000-4000-8000-000000000300', '06000000-0000-4000-8000-000000000000', 'TABLETTE SUPERVISION', 'active',
        'android', 'Daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=', now(), '00000000-0000-4000-b000-000000000004',
        '00000000-0000-4000-b000-000000000001');
insert into app.device_sync_event (tenant_id, device_id, occurred_at, status) values
  ('06000000-0000-4000-8000-000000000000', '06000010-0000-4000-8000-000000000300', now() - interval '100 days', 'installed');
insert into app.worker_heartbeat (worker_id, started_at, last_seen_at, version, concurrency)
values ('pgtap-300-old', now() - interval '10 days', now() - interval '8 days', 'old', 1);
set local role etare_worker;
select ok(
  (select (r ->> 'jobs')::int >= 1 and (r ->> 'dead_jobs')::int >= 1 and (r ->> 'sync_events')::int >= 1
          and (r ->> 'heartbeats')::int >= 1 and r ? 'rate_limit_windows'
   from app.worker_purge_history() r),
  'the maintenance purges old jobs, receipts, heartbeats and rate-limit windows'
);
reset role;
select results_eq(
  $$ select status, count(*) from app.job where job_type = 'system.noop' and completed_at < now() - interval '1 day'
     group by status order by status $$,
  $$ values ('dead', 1::bigint), ('succeeded', 1::bigint) $$,
  'a succeeded job is kept 30 days, a dead one 90 days'
);

-- -----------------------------------------------------------------------------
-- Receipt history
-- -----------------------------------------------------------------------------
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');
select is(
  app.sync_receipt('06000010-0000-4000-8000-000000000300', 1, 'error', 'FILE_HASH_MISMATCH', '{}'::uuid[], 2),
  0, 'a receipt in error'
);
select is(
  app.sync_receipt('06000010-0000-4000-8000-000000000300', 1, 'installed', null, '{}'::uuid[], 2),
  0, 'then an installation'
);
select throws_ok($$ select count(*) from app.device_sync_event $$, '42501', null, 'the history is not readable by the API');
reset role;
select results_eq(
  $$ select status, error_code from app.device_sync_event where device_id = '06000010-0000-4000-8000-000000000300'
     order by id $$,
  $$ values ('error', 'FILE_HASH_MISMATCH'), ('installed', null) $$,
  'each receipt is kept in the history'
);

-- -----------------------------------------------------------------------------
-- Metrics of the platform, board of the SIS
-- -----------------------------------------------------------------------------
set local role etare_api;
select ok(
  (select m ? 'jobs' and m ? 'workers' and m ? 'devices' and m ? 'integrity' and m ? 'security'
          and (m -> 'database' ->> 'size_bytes')::bigint > 0
   from app.platform_metrics() m),
  'the API reads the aggregates of the platform'
);
select ok(
  (select (e ->> 'integrity_errors_24h')::int >= 1 from jsonb_array_elements(app.platform_metrics() -> 'integrity') e
   where e ->> 'slug' = 'sdis-demo-06'),
  'a content refused by a terminal counts as an integrity error'
);
reset role;
set local role etare_worker;
select throws_ok($$ select app.platform_metrics() $$, '42501', null, 'the worker does not read the metrics');
reset role;

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');
select throws_ok($$ select app.tenant_supervision() $$, '42501', null, 'the board of the SIS requires audit:read');
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000');
select ok(
  (select (b -> 'receipts_7d' ->> 'error')::int >= 1 and (b -> 'devices' ->> 'active')::int >= 1
   from app.tenant_supervision() b),
  'the administration of the SIS reads its board'
);

select * from finish();
rollback;
