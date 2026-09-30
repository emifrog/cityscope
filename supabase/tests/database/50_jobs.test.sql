-- PostgreSQL job queue: idempotent enqueue, leases, retries, dead jobs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(11);

set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') is not null as ctx \gset

select app.enqueue_job('system.noop', '{"n": 1}', 'demo-key') as job_id \gset
select is(app.enqueue_job('system.noop', '{"n": 1}', 'demo-key'), :'job_id'::uuid, 'enqueue is idempotent on its key');
select is((select tenant_id from app.job where id = :'job_id'), '06000000-0000-4000-8000-000000000000'::uuid,
          'the job belongs to the tenant of the request');
select throws_ok($$ select * from app.claim_jobs('api', 1, 30) $$, '42501', null, 'the API cannot claim jobs');

reset role;
set local role etare_worker;
select is((select count(*) from app.claim_jobs('worker-1', 10, 30)), 1::bigint, 'a worker leases the runnable job');
select is((select count(*) from app.claim_jobs('worker-2', 10, 30)), 0::bigint, 'a leased job is not handed out twice');
select ok(not app.complete_job(:'job_id', 'worker-2'), 'only the lease owner can complete the job');
select is(app.fail_job(:'job_id', 'worker-1', 'TEMPORARY', 0), 'queued', 'a failed attempt is retried');

reset role;
update app.job set max_attempts = 2 where id = :'job_id';
set local role etare_worker;
select is((select count(*) from app.claim_jobs('worker-1', 10, 30)), 1::bigint, 'the retried job is leased again');

reset role;
update app.job set lease_expires_at = now() - interval '1 second' where id = :'job_id';
set local role etare_worker;
select is((select count(*) from app.claim_jobs('worker-3', 10, 30)), 0::bigint, 'an expired lease on the last attempt is not retried');
reset role;
select is((select status from app.job where id = :'job_id'), 'dead', 'exhausted jobs go to the dead state');
select is((select last_error_code from app.job where id = :'job_id'), 'LEASE_EXPIRED', 'the reason is kept');

select * from finish();
rollback;
