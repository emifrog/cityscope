-- =============================================================================
-- Sprint 11 — worker slots: a long job (preparation of a base map, ADR-024) must
-- never hold back the others. Each slot of a worker claims its own job, and the
-- worker may exclude job types it already runs (one preparation at a time).
-- =============================================================================

drop function app.claim_jobs(text, integer, integer);

-- Lease up to p_limit runnable jobs, none of the excluded types. Expired leases are recovered first.
create function app.claim_jobs(
  p_worker text,
  p_limit integer,
  p_lease_seconds integer,
  p_exclude_types text[] default '{}'
)
returns setof app.job
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 5 and 3600
     or cardinality(coalesce(p_exclude_types, '{}')) > 20 then
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
      and not (j.job_type = any (coalesce(p_exclude_types, '{}')))
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

revoke all on function app.claim_jobs(text, integer, integer, text[]) from public;
grant execute on function app.claim_jobs(text, integer, integer, text[]) to etare_worker;
