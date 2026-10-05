-- =============================================================================
-- Sprint 12 — EXP-03: supervision (ADR-028, architecture §29).
--
--   * Jobs keep when their current and first attempts started: queue wait and
--     compute time are measured apart.
--   * Each worker beats in app.worker_heartbeat: a platform without a live
--     worker is visible (and alerted) from the API alone.
--   * Receipts of the terminals are kept as history (90 days): the rate of
--     failed synchronizations is measured, not only the last outcome.
--   * Finished jobs, receipt history and heartbeats are purged by the hourly
--     job maintenance.database (rate-limit windows too).
--   * app.platform_metrics(): aggregated figures for the metrics endpoint of
--     the operator (no row, no name, labels bounded to job types, SIS slugs and
--     refusal actions). app.tenant_supervision(): the board of a SIS (audit:read).
-- =============================================================================

alter table app.job add column started_at timestamptz;
alter table app.job add column first_started_at timestamptz;
comment on column app.job.started_at is 'Claim of the current (or last) attempt: compute time = completed_at - started_at.';
comment on column app.job.first_started_at is 'First claim: queue wait = first_started_at - created_at.';
create index job_completed_idx on app.job (completed_at) where status in ('succeeded', 'dead');

-- Same claim as Sprint 11 (slots, excluded types), now stamping the start of each attempt.
create or replace function app.claim_jobs(
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
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now(),
      started_at = now(), first_started_at = coalesce(j.first_started_at, now())
  from next_jobs
  where j.id = next_jobs.id
  returning j.*;
end
$$;

-- -----------------------------------------------------------------------------
-- Heartbeat of the workers.
-- -----------------------------------------------------------------------------
create table app.worker_heartbeat (
  worker_id text primary key check (worker_id ~ '^[A-Za-z0-9._-]{1,64}$'),
  started_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  stopped_at timestamptz,
  version text not null check (length(version) <= 64),
  handlers text[] not null default '{}' check (cardinality(handlers) <= 50),
  concurrency integer not null check (concurrency between 1 and 64)
);
comment on table app.worker_heartbeat is 'Liveness of the workers (EXP-03): last beat, version, handlers; purged after a week.';
alter table app.worker_heartbeat enable row level security;

create function app.worker_beat(
  p_worker text, p_started_at timestamptz, p_version text, p_handlers text[], p_concurrency integer,
  p_stopping boolean default false
) returns void
language sql volatile
security definer
set search_path = ''
as $$
  insert into app.worker_heartbeat as h (worker_id, started_at, last_seen_at, stopped_at, version, handlers, concurrency)
  values (p_worker, p_started_at, now(), case when p_stopping then now() end, p_version, p_handlers, p_concurrency)
  on conflict (worker_id) do update
  set started_at = excluded.started_at, last_seen_at = excluded.last_seen_at, stopped_at = excluded.stopped_at,
      version = excluded.version, handlers = excluded.handlers, concurrency = excluded.concurrency
$$;

-- -----------------------------------------------------------------------------
-- History of the receipts of the terminals.
-- -----------------------------------------------------------------------------
create table app.device_sync_event (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  device_id uuid not null,
  occurred_at timestamptz not null default now(),
  status text not null check (status in ('installed', 'partial', 'error')),
  error_code text check (error_code is null or error_code ~ '^[A-Z0-9_]{1,64}$'),
  generation bigint,
  keyset_sequence integer,
  foreign key (tenant_id, device_id) references app.device (tenant_id, id)
);
comment on table app.device_sync_event is
  'Receipts of the terminals over time (EXP-03): failure rate of the synchronizations, kept 90 days.';
create index device_sync_event_tenant_time_idx on app.device_sync_event (tenant_id, occurred_at desc);
create index device_sync_event_time_idx on app.device_sync_event (occurred_at);
alter table app.device_sync_event enable row level security;

-- Receipt (Sprint 12, SEC-04) now also kept in the history.
create or replace function app.sync_receipt(
  p_device_id uuid, p_generation bigint, p_status text, p_error_code text, p_installed uuid[],
  p_keyset_sequence integer default null
) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_current bigint;
  v_count integer;
begin
  if p_status not in ('installed', 'partial', 'error') then
    raise exception 'invalid receipt status' using errcode = '22023';
  end if;
  if p_keyset_sequence is not null and p_keyset_sequence <= 0 then
    raise exception 'invalid key set sequence' using errcode = '22023';
  end if;
  select coalesce(max(g.generation), 0) into v_current from app.distribution_generation g where g.tenant_id = v_tenant;

  delete from app.device_publication where device_id = p_device_id;
  insert into app.device_publication (device_id, tenant_id, site_id, publication_id)
  select distinct on (p.site_id) p_device_id, v_tenant, p.site_id, p.id
  from app.publication p
  where p.id = any (coalesce(p_installed, '{}')) and p.tenant_id = v_tenant
    and p.status in ('published', 'superseded', 'withdrawn')
  order by p.site_id, p.publication_number desc;
  get diagnostics v_count = row_count;

  insert into app.device_sync_state as s (device_id, tenant_id, last_user_id, last_seen_at, last_sync_at,
                                           last_status, last_error_code, installed_generation, keyset_sequence)
  values (p_device_id, v_tenant, app.current_user_id(), now(), now(), p_status, p_error_code,
          case when p_status = 'installed' then least(p_generation, v_current) end, p_keyset_sequence)
  on conflict (device_id) do update
  set last_user_id = excluded.last_user_id, last_seen_at = excluded.last_seen_at,
      last_sync_at = excluded.last_sync_at, last_status = excluded.last_status,
      last_error_code = excluded.last_error_code,
      installed_generation = case when p_status = 'installed'
                                  then greatest(coalesce(s.installed_generation, 0), excluded.installed_generation)
                                  else s.installed_generation end,
      keyset_sequence = coalesce(excluded.keyset_sequence, s.keyset_sequence);

  insert into app.device_sync_event (tenant_id, device_id, status, error_code, generation, keyset_sequence)
  values (v_tenant, p_device_id, p_status, p_error_code, p_generation, p_keyset_sequence);
  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- Maintenance of the history (worker, platform job without SIS).
-- -----------------------------------------------------------------------------
create function app.worker_schedule_database_maintenance(p_slot text) returns uuid
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_slot is null or p_slot !~ '^\d{4}-\d{2}-\d{2}T\d{2}$' then
    raise exception 'invalid maintenance slot' using errcode = '22023';
  end if;
  insert into app.job (tenant_id, job_type, payload, idempotency_key, max_attempts)
  values (null, 'maintenance.database', jsonb_build_object('slot', p_slot), 'maintenance.database:' || p_slot, 3)
  on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;
  return v_id;
end
$$;

-- Succeeded jobs after 30 days, dead ones after 90 (diagnosis), receipts after 90 days, heartbeats
-- after a week, rate-limit windows after a day. Never a running or queued job.
create function app.worker_purge_history() returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_jobs integer;
  v_dead integer;
  v_events integer;
  v_beats integer;
begin
  delete from app.job j where j.status = 'succeeded' and j.completed_at < now() - interval '30 days';
  get diagnostics v_jobs = row_count;
  delete from app.job j where j.status = 'dead' and j.completed_at < now() - interval '90 days';
  get diagnostics v_dead = row_count;
  delete from app.device_sync_event e where e.occurred_at < now() - interval '90 days';
  get diagnostics v_events = row_count;
  delete from app.worker_heartbeat h where h.last_seen_at < now() - interval '7 days';
  get diagnostics v_beats = row_count;
  return jsonb_build_object(
    'jobs', v_jobs, 'dead_jobs', v_dead, 'sync_events', v_events, 'heartbeats', v_beats,
    'rate_limit_windows', app.worker_purge_rate_limits()
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Metrics of the platform (operator): aggregates only, bounded labels.
-- -----------------------------------------------------------------------------
create function app.platform_metrics() returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with job_types as (
    select distinct j.job_type from app.job j
    where j.status in ('queued', 'running') or j.updated_at > now() - interval '1 day'
  ),
  jobs as (
    select t.job_type,
           (select count(*) from app.job j where j.job_type = t.job_type and j.status = 'queued') as queued,
           (select count(*) from app.job j where j.job_type = t.job_type and j.status = 'queued' and j.attempts > 0)
             as retrying,
           (select count(*) from app.job j where j.job_type = t.job_type and j.status = 'running') as running,
           (select coalesce(extract(epoch from now() - min(j.run_after)), 0) from app.job j
             where j.job_type = t.job_type and j.status = 'queued' and j.run_after <= now()) as oldest_queued_seconds,
           (select count(*) from app.job j where j.job_type = t.job_type and j.status = 'dead'
             and j.completed_at > now() - interval '1 day') as dead_24h,
           (select count(*) from app.job j where j.job_type = t.job_type and j.status = 'succeeded'
             and j.completed_at > now() - interval '1 hour') as succeeded_1h,
           (select coalesce(percentile_cont(0.95) within group (order by extract(epoch from j.completed_at - j.started_at)), 0)
              from app.job j where j.job_type = t.job_type and j.status = 'succeeded'
              and j.completed_at > now() - interval '1 hour' and j.started_at is not null) as duration_p95_seconds,
           (select coalesce(percentile_cont(0.95) within group (order by extract(epoch from j.first_started_at - j.created_at)), 0)
              from app.job j where j.job_type = t.job_type and j.first_started_at > now() - interval '1 hour')
             as wait_p95_seconds
    from job_types t
  ),
  tenants as (select t.id, t.slug from app.tenant t where t.status = 'active'),
  publications as (
    select t.slug,
           (select count(*) from app.publication p where p.tenant_id = t.id and p.status = 'published') as in_force,
           (select count(*) from app.publication p where p.tenant_id = t.id and p.published_at > now() - interval '1 day')
             as published_24h,
           (select count(*) from app.publication p where p.tenant_id = t.id and p.status = 'failed'
             and p.updated_at > now() - interval '1 day') as failed_24h,
           (select count(*) from app.publication p where p.tenant_id = t.id and p.status in ('queued', 'building')
             and p.requested_at < now() - interval '15 minutes') as stuck,
           (select coalesce(percentile_cont(0.95) within group (order by extract(epoch from p.published_at - p.requested_at)), 0)
              from app.publication p where p.tenant_id = t.id and p.published_at > now() - interval '1 day')
             as duration_p95_seconds
    from tenants t
  ),
  devices as (
    select t.slug,
           count(d.id) filter (where d.status = 'active') as active,
           count(d.id) filter (where d.status = 'active' and (s.last_sync_at is null or s.last_sync_at < now() - interval '7 days'))
             as late,
           count(d.id) filter (where d.status = 'active' and s.last_seen_at > now() - interval '1 day') as contacted_24h,
           count(d.id) filter (where d.status = 'active' and s.last_seen_at > now() - interval '1 day'
             and s.installed_generation >= s.catalog_generation) as contacted_up_to_date_24h,
           (select count(distinct dp.device_id) from app.device_publication dp
            join app.publication p on p.id = dp.publication_id and p.status = 'withdrawn'
            join app.device d2 on d2.id = dp.device_id and d2.status = 'active'
            where dp.tenant_id = t.id) as holding_withdrawn
    from tenants t
    left join app.device d on d.tenant_id = t.id
    left join app.device_sync_state s on s.device_id = d.id
    group by t.slug, t.id
  ),
  receipts as (
    select t.slug, e.status, count(*) as count
    from tenants t join app.device_sync_event e on e.tenant_id = t.id
    where e.occurred_at > now() - interval '1 day'
    group by t.slug, e.status
  ),
  -- Content refused by the terminals (hash, signature, replay): the "taux de hashes invalides" (§29).
  integrity as (
    select t.slug,
           count(e.id) filter (where e.error_code ~ '(HASH_MISMATCH|SIGNATURE_INVALID|_REPLAYED|_CONFLICT|_MISMATCH)$')
             as integrity_errors_24h
    from tenants t left join app.device_sync_event e on e.tenant_id = t.id and e.occurred_at > now() - interval '1 day'
    group by t.slug
  ),
  files as (
    select t.slug,
           coalesce(sum(a.size_bytes) filter (where a.scan_status = 'clean'), 0) as clean_bytes,
           count(a.id) filter (where a.scan_status = 'pending') as pending,
           coalesce(extract(epoch from now() - min(a.created_at) filter (where a.scan_status = 'pending')), 0)
             as pending_oldest_seconds,
           count(a.id) filter (where a.scan_status = 'rejected' and coalesce(a.verified_at, a.created_at) > now() - interval '1 day')
             as rejected_24h
    from tenants t left join app.asset a on a.tenant_id = t.id
    group by t.slug
  ),
  reports as (
    select t.slug,
           count(r.id) filter (where r.status = 'new') as new,
           coalesce(extract(epoch from now() - min(r.received_at) filter (where r.status = 'new')), 0) as oldest_new_seconds
    from tenants t left join app.field_report r on r.tenant_id = t.id
    group by t.slug
  )
  select jsonb_build_object(
    'generated_at', now(),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.job_type) from jobs j), '[]'::jsonb),
    'workers', jsonb_build_object(
      'alive', (select count(*) from app.worker_heartbeat h
                where h.stopped_at is null and h.last_seen_at > now() - interval '2 minutes'),
      'last_seen_seconds', (select coalesce(extract(epoch from now() - max(h.last_seen_at)), -1)
                            from app.worker_heartbeat h)
    ),
    'publications', coalesce((select jsonb_agg(to_jsonb(p) order by p.slug) from publications p), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(d) order by d.slug) from devices d), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(to_jsonb(r) order by r.slug, r.status) from receipts r), '[]'::jsonb),
    'integrity', coalesce((select jsonb_agg(to_jsonb(i) order by i.slug) from integrity i), '[]'::jsonb),
    'files', coalesce((select jsonb_agg(to_jsonb(f) order by f.slug) from files f), '[]'::jsonb),
    'field_reports', coalesce((select jsonb_agg(to_jsonb(r) order by r.slug) from reports r), '[]'::jsonb),
    'basemaps', jsonb_build_object(
      'ready', (select count(*) from app.basemap_pack b where b.status = 'ready'),
      'ready_bytes', (select coalesce(sum(b.total_bytes), 0) from app.basemap_pack b where b.status = 'ready'),
      'failed', (select count(*) from app.basemap_pack b where b.status = 'failed'
                 and coalesce(b.started_at, b.requested_at) > now() - interval '1 day'),
      'renewal_due', (select count(*) from app.basemap_pack b where b.status = 'ready' and b.renew_after < now())
    ),
    'notifications', jsonb_build_object(
      'pending', (select count(*) from app.notification n where n.status = 'pending'),
      'pending_oldest_seconds', (select coalesce(extract(epoch from now() - min(n.created_at)), 0)
                                 from app.notification n where n.status = 'pending'),
      'failed_24h', (select count(*) from app.notification n where n.status = 'failed'
                     and n.created_at > now() - interval '1 day')
    ),
    'security', coalesce((
      select jsonb_agg(jsonb_build_object('action', e.action, 'count', e.count) order by e.action)
      from (select a.action, count(*) as count from app.audit_event a
            where a.outcome = 'denied' and a.occurred_at > now() - interval '1 hour'
            group by a.action) e
    ), '[]'::jsonb),
    'database', jsonb_build_object('size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()))
  )
$$;

-- -----------------------------------------------------------------------------
-- Board of a SIS (audit:read): what the administration must act upon.
-- -----------------------------------------------------------------------------
create function app.tenant_supervision() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null or not app.has_permission('audit:read') then
    raise exception 'audit:read required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'publications', (
      select jsonb_build_object(
        'in_force', count(*) filter (where p.status = 'published'),
        'published_7d', count(*) filter (where p.published_at > now() - interval '7 days'),
        'failed_7d', count(*) filter (where p.status = 'failed' and p.updated_at > now() - interval '7 days'),
        'stuck', count(*) filter (where p.status in ('queued', 'building') and p.requested_at < now() - interval '15 minutes'),
        'duration_p95_seconds_7d', coalesce(percentile_cont(0.95) within group (
          order by extract(epoch from p.published_at - p.requested_at))
          filter (where p.published_at > now() - interval '7 days'), 0)
      )
      from app.publication p where p.tenant_id = v_tenant
    ),
    'devices', (
      select jsonb_build_object(
        'active', count(*) filter (where d.status = 'active'),
        'never_synced', count(*) filter (where d.status = 'active' and s.last_sync_at is null),
        'late', count(*) filter (where d.status = 'active' and s.last_sync_at < now() - interval '7 days'),
        'error', count(*) filter (where d.status = 'active' and s.last_sync_at >= now() - interval '7 days'
                                  and s.last_status <> 'installed'),
        'up_to_date', count(*) filter (where d.status = 'active' and s.last_sync_at >= now() - interval '7 days'
                                       and s.last_status = 'installed'),
        'holding_withdrawn', (
          select count(distinct dp.device_id) from app.device_publication dp
          join app.publication p on p.id = dp.publication_id and p.status = 'withdrawn'
          join app.device d2 on d2.id = dp.device_id and d2.status = 'active'
          where dp.tenant_id = v_tenant)
      )
      from app.device d left join app.device_sync_state s on s.device_id = d.id
      where d.tenant_id = v_tenant
    ),
    'receipts_7d', (
      select jsonb_build_object(
        'installed', count(*) filter (where e.status = 'installed'),
        'partial', count(*) filter (where e.status = 'partial'),
        'error', count(*) filter (where e.status = 'error')
      )
      from app.device_sync_event e where e.tenant_id = v_tenant and e.occurred_at > now() - interval '7 days'
    ),
    'field_reports', (
      select jsonb_build_object('new', count(*), 'oldest_new_at', min(r.received_at))
      from app.field_report r where r.tenant_id = v_tenant and r.status = 'new'
    ),
    'files', (
      select jsonb_build_object(
        'pending', count(*) filter (where a.scan_status = 'pending'),
        'rejected_7d', count(*) filter (where a.scan_status = 'rejected'
                                        and coalesce(a.verified_at, a.created_at) > now() - interval '7 days'),
        'clean_bytes', coalesce(sum(a.size_bytes) filter (where a.scan_status = 'clean'), 0)
      )
      from app.asset a where a.tenant_id = v_tenant
    ),
    'notifications', (
      select jsonb_build_object(
        'pending', count(*) filter (where n.status = 'pending'),
        'failed', count(*) filter (where n.status = 'failed')
      )
      from app.notification n where n.tenant_id = v_tenant
    ),
    'basemaps', (
      select jsonb_build_object(
        'ready', count(*) filter (where b.status = 'ready'),
        'failed', count(*) filter (where b.status = 'failed'
                                   and not exists (select 1 from app.basemap_pack r
                                                   where r.sector_id = b.sector_id and r.status = 'ready'
                                                     and r.built_at > coalesce(b.started_at, b.requested_at))),
        'renewal_due', count(*) filter (where b.status = 'ready' and b.renew_after < now())
      )
      from app.basemap_pack b where b.tenant_id = v_tenant
    )
  );
end
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function app.claim_jobs(text, integer, integer, text[]) to etare_worker;
grant execute on function
  app.worker_beat(text, timestamptz, text, text[], integer, boolean),
  app.worker_schedule_database_maintenance(text),
  app.worker_purge_history()
to etare_worker;
grant execute on function
  app.platform_metrics(),
  app.tenant_supervision()
to etare_api;

revoke all on all routines in schema app from public;
