-- =============================================================================
-- Backups (EXP-02, ADR-031)
--
--   * etare_backup: identity of the nightly backup job. It reads every table
--     (pg_read_all_data, BYPASSRLS so that pg_dump sees every row) and writes
--     nothing but its own run record. Created NOLOGIN like the application roles:
--     the login is granted per environment (local: supabase/seed.sql, hosted:
--     pnpm integration roles-sql).
--   * app.backup_run: the successful backups, recorded by the job once its
--     encrypted archive is stored outside the platform.
--   * app.platform_metrics(): age of the last successful backup, for the
--     "sauvegarde absente" alert (ADR-028).
-- =============================================================================

do $$
begin
  if not exists (select from pg_roles where rolname = 'etare_backup') then
    create role etare_backup nologin inherit nosuperuser nocreatedb nocreaterole bypassrls connection limit 4;
  end if;
end
$$;

comment on role etare_backup is
  'Nightly backup (EXP-02): reads every table (pg_read_all_data, BYPASSRLS for pg_dump), writes only its run record.';

grant pg_read_all_data to etare_backup;

revoke all on all routines in schema app from public;
-- Like the application roles: the migration identity may impersonate it (tests), without inheriting its rights.
grant etare_backup to current_user with inherit false, set true;

-- -----------------------------------------------------------------------------
-- Successful backups
-- -----------------------------------------------------------------------------
create table app.backup_run (
  id bigint generated always as identity primary key,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  archive_name text not null unique check (archive_name ~ '^[A-Za-z0-9._-]{1,200}$'),
  archive_bytes bigint not null check (archive_bytes > 0),
  object_count integer not null check (object_count >= 0),
  object_bytes bigint not null check (object_bytes >= 0),
  -- Objects listed by the database but gone from the storage when the job copied them.
  missing_objects integer not null default 0 check (missing_objects >= 0),
  check (started_at <= finished_at)
);
comment on table app.backup_run is
  'Successful backups (EXP-02), recorded by the backup job once its archive is stored; read by app.platform_metrics().';
-- No grant: written by app.backup_record_run() only, read by app.platform_metrics().
alter table app.backup_run enable row level security;

create function app.backup_record_run(
  p_started_at timestamptz,
  p_archive_name text,
  p_archive_bytes bigint,
  p_object_count integer,
  p_object_bytes bigint,
  p_missing_objects integer
) returns void
language sql volatile
security definer
set search_path = ''
as $$
  insert into app.backup_run (started_at, archive_name, archive_bytes, object_count, object_bytes, missing_objects)
  values (p_started_at, p_archive_name, p_archive_bytes, p_object_count, p_object_bytes, p_missing_objects)
  on conflict (archive_name) do nothing
$$;

-- -----------------------------------------------------------------------------
-- Metrics of the platform: same figures, plus the last successful backup.
-- -----------------------------------------------------------------------------
create or replace function app.platform_metrics() returns jsonb
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
    -- Last successful backup (EXP-02): -1 when none was ever recorded.
    'backups', jsonb_build_object(
      'last_success_seconds', (select coalesce(extract(epoch from now() - max(b.finished_at)), -1) from app.backup_run b),
      'last_archive_bytes', coalesce((select b.archive_bytes from app.backup_run b order by b.finished_at desc limit 1), 0),
      'last_missing_objects', coalesce((select b.missing_objects from app.backup_run b order by b.finished_at desc limit 1), 0)
    ),
    'database', jsonb_build_object('size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()))
  )
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function app.backup_record_run(timestamptz, text, bigint, integer, bigint, integer) to etare_backup;
