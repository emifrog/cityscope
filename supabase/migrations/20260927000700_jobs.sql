-- =============================================================================
-- Durable job queue in PostgreSQL (architecture §24, ADR-007).
--
--   * Enqueuing a job in the same transaction as the business change IS the
--     transactional outbox: no event can be lost between the two.
--   * At-least-once execution: workers lease jobs (FOR UPDATE SKIP LOCKED),
--     send heartbeats, and confirm only after persisting their result. An
--     expired lease makes the job runnable again; handlers must be idempotent.
--   * Retries use an increasing delay chosen by the worker; exhausted jobs go
--     to the 'dead' state (inspectable, replayable with an audited action).
--   * No external library: the queue schema stays in this single migration
--     history (a library would bring its own schema migrations).
-- =============================================================================

create table app.job (
  id uuid primary key default gen_random_uuid(),
  -- NULL only for platform maintenance jobs.
  tenant_id uuid references app.tenant (id),
  job_type text not null check (job_type ~ '^[a-z]+(\.[a-z_]+)+$'),
  payload_version smallint not null default 1 check (payload_version > 0),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'dead')),
  priority smallint not null default 100,
  run_after timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  lease_owner text,
  lease_expires_at timestamptz,
  idempotency_key text check (length(idempotency_key) <= 200),
  correlation_id uuid,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'running') = (lease_owner is not null and lease_expires_at is not null))
);
create unique index job_idempotency_uq on app.job (tenant_id, job_type, idempotency_key)
  nulls not distinct where idempotency_key is not null;
create index job_ready_idx on app.job (priority, run_after) where status = 'queued';
create index job_lease_idx on app.job (lease_expires_at) where status = 'running';
create index job_tenant_idx on app.job (tenant_id, created_at desc);

alter table app.job enable row level security;

-- Enqueue from the API, in the caller's tenant context (idempotent on key).
create function app.enqueue_job(
  p_job_type text,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_priority smallint default 100,
  p_run_after timestamptz default now(),
  p_max_attempts integer default 5
) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_id uuid;
begin
  -- Jobs requested by a user always belong to the user's current tenant.
  if app.current_user_id() is not null and v_tenant is null then
    raise exception 'tenant context required to enqueue a job' using errcode = '42501';
  end if;
  insert into app.job (tenant_id, job_type, payload, idempotency_key, priority, run_after, max_attempts, correlation_id)
  values (v_tenant, p_job_type, coalesce(p_payload, '{}'::jsonb), p_idempotency_key, p_priority, p_run_after,
          p_max_attempts, app.current_trace_id())
  on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from app.job
    where tenant_id is not distinct from v_tenant and job_type = p_job_type and idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end
$$;

-- Lease up to p_limit runnable jobs. Expired leases are recovered first.
create function app.claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer)
returns setof app.job
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 5 and 3600 then
    raise exception 'invalid claim parameters' using errcode = '22023';
  end if;

  update app.job
  set status = case when attempts >= max_attempts then 'dead' else 'queued' end,
      last_error_code = 'LEASE_EXPIRED', last_error_at = now(),
      lease_owner = null, lease_expires_at = null, updated_at = now(),
      completed_at = case when attempts >= max_attempts then now() else null end
  where status = 'running' and lease_expires_at < now();

  return query
  with next_jobs as (
    select j.id from app.job j
    where j.status = 'queued' and j.run_after <= now()
    order by j.priority, j.run_after, j.created_at
    limit p_limit
    for update skip locked
  )
  update app.job j
  set status = 'running', attempts = j.attempts + 1, lease_owner = p_worker,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  from next_jobs
  where j.id = next_jobs.id
  returning j.*;
end
$$;

create function app.heartbeat_job(p_job_id uuid, p_worker text, p_lease_seconds integer) returns boolean
language sql volatile
security definer
set search_path = ''
as $$
  with updated as (
    update app.job set lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    where id = p_job_id and status = 'running' and lease_owner = p_worker
    returning 1
  )
  select exists (select 1 from updated)
$$;

create function app.complete_job(p_job_id uuid, p_worker text) returns boolean
language sql volatile
security definer
set search_path = ''
as $$
  with updated as (
    update app.job set status = 'succeeded', lease_owner = null, lease_expires_at = null,
                       completed_at = now(), updated_at = now()
    where id = p_job_id and status = 'running' and lease_owner = p_worker
    returning 1
  )
  select exists (select 1 from updated)
$$;

-- p_retry_in_seconds = null means a permanent error (dead immediately).
create function app.fail_job(p_job_id uuid, p_worker text, p_error_code text, p_retry_in_seconds integer)
returns text
language sql volatile
security definer
set search_path = ''
as $$
  update app.job
  set status = case when p_retry_in_seconds is null or attempts >= max_attempts then 'dead' else 'queued' end,
      run_after = case when p_retry_in_seconds is null then run_after else now() + make_interval(secs => p_retry_in_seconds) end,
      last_error_code = left(p_error_code, 100), last_error_at = now(),
      lease_owner = null, lease_expires_at = null, updated_at = now(),
      completed_at = case when p_retry_in_seconds is null or attempts >= max_attempts then now() else null end
  where id = p_job_id and status = 'running' and lease_owner = p_worker
  returning status
$$;

grant execute on function app.enqueue_job(text, jsonb, text, smallint, timestamptz, integer) to etare_api, etare_worker;
grant execute on function
  app.claim_jobs(text, integer, integer), app.heartbeat_job(uuid, text, integer),
  app.complete_job(uuid, text), app.fail_job(uuid, text, text, integer)
to etare_worker;

-- The API may follow the jobs of its tenant (GET /jobs/{id}, later).
grant select on app.job to etare_api;
create policy job_select_tenant on app.job for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and created_by = (select app.current_user_id()));

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
