-- Publication consistency after Sprint 3.
-- Created with `supabase migration new`; sequenced after the existing Sprint 3
-- migrations, whose timestamps already run through 20261003000300.
-- Deploy this migration and the updated worker together (old unsafe signatures removed).

alter table app.publication add column pdf_storage_key text;
comment on column app.publication.pdf_storage_key is
  'Immutable content-addressed PDF object; null for legacy etare.pdf or publications without a PDF.';

-- The old signatures must not provide a way around lease fencing.
drop function app.worker_start_publication(uuid, uuid);
drop function app.worker_complete_publication(uuid, jsonb, jsonb, text, text);
drop function app.worker_fail_publication(uuid, text);

-- Lock the queue row before the publication, like terminal-job propagation below.
-- Checking the clock after acquiring the lock rejects leases that expired while waiting.
-- The canonical idempotency key is unique per tenant and job type: a second job
-- cannot acquire an independent lease for this publication.
create function app.lock_publication_job(p_publication_id uuid, p_job_id uuid, p_attempt integer)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare v_job app.job;
begin
  select * into v_job from app.job where id = p_job_id for update;
  if not found then return false; end if;
  return coalesce(v_job.status = 'running' and v_job.attempts = p_attempt
    and v_job.lease_expires_at > clock_timestamp()
    and v_job.job_type = 'publication.build'
    and v_job.idempotency_key = 'publication.build:' || p_publication_id::text
    and v_job.payload ->> 'publication_id' = p_publication_id::text
    and exists (select 1 from app.publication p where p.id = p_publication_id and p.tenant_id = v_job.tenant_id), false);
end
$$;

create function app.worker_start_publication(p_publication_id uuid, p_tenant_id uuid, p_job_id uuid, p_attempt integer)
returns table (
  tenant_id uuid, site_id uuid, publication_number integer, revision_id uuid, revision_no integer,
  content_hash text, snapshot jsonb, requested_by uuid, requested_by_name text, requested_at timestamptz,
  submitted_by uuid, submitted_by_name text, submitted_at timestamptz,
  approved_by uuid, approved_by_name text, approved_at timestamptz
)
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  if not app.lock_publication_job(p_publication_id, p_job_id, p_attempt) then return; end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  -- A job only acts on a publication of its own SIS. A build interrupted by a crash (still
  -- "building") is taken over by the next attempt.
  update app.publication p set status = 'building'
  where p.id = p_publication_id and p.tenant_id = p_tenant_id and p.status = 'queued';

  return query
  select p.tenant_id, p.site_id, p.publication_number, r.id, r.revision_no, r.content_hash, r.snapshot,
         p.requested_by, coalesce(ru.display_name, 'Membre du SIS'), p.requested_at,
         r.submitted_by, coalesce(su.display_name, 'Membre du SIS'), r.submitted_at,
         a.actor_id, coalesce(au.display_name, 'Membre du SIS'), a.created_at
  from app.publication p
  join app.etare_revision r on r.id = p.revision_id
  join app.approval a on a.id = p.approval_id
  left join app.user_account ru on ru.id = p.requested_by
  left join app.user_account su on su.id = r.submitted_by
  left join app.user_account au on au.id = a.actor_id
  where p.id = p_publication_id and p.tenant_id = p_tenant_id and p.status = 'building';
end
$$;

create function app.worker_complete_publication(
  p_publication_id uuid, p_payload jsonb, p_manifest jsonb, p_manifest_hash text, p_template_version text,
  p_pdf_storage_key text, p_job_id uuid, p_attempt integer
) returns text
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_publication app.publication;
  v_pdf_hash text;
begin
  if not app.lock_publication_job(p_publication_id, p_job_id, p_attempt) then return null; end if;
  -- Bind the immutable storage object to the PDF listed in the manifest.
  select f ->> 'sha256' into v_pdf_hash
  from jsonb_array_elements(p_manifest -> 'files') f where f ->> 'path' = 'etare.pdf';
  if (v_pdf_hash is null) <> (p_pdf_storage_key is null) or
     (v_pdf_hash is not null and (v_pdf_hash !~ '^[a-f0-9]{64}$' or p_pdf_storage_key <>
       'tenants/' || (select tenant_id::text from app.publication where id = p_publication_id) ||
       '/publications/' || p_publication_id::text || '/etare-' || v_pdf_hash || '.pdf')) then
    raise exception 'PDF_STORAGE_KEY_MISMATCH' using errcode = '23514';
  end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);

  update app.publication
  set status = 'ready', payload = p_payload, manifest = p_manifest, manifest_hash = p_manifest_hash,
      template_version = p_template_version, pdf_storage_key = p_pdf_storage_key, ready_at = now()
  where id = p_publication_id and status = 'building'
  returning * into v_publication;
  if not found then
    return null;
  end if;

  -- Serialized per site with the numbering of new publications.
  perform pg_advisory_xact_lock(hashtextextended('app.publication:' || v_publication.site_id::text, 0));
  if exists (
    select 1 from app.publication p
    where p.site_id = v_publication.site_id and p.id <> v_publication.id
      and p.status in ('published', 'superseded', 'withdrawn')
      and p.publication_number > v_publication.publication_number
  ) then
    -- An obsolete build never replaces a newer publication.
    update app.publication set status = 'superseded', superseded_at = now() where id = v_publication.id;
    return 'superseded';
  end if;

  update app.publication set status = 'superseded', superseded_at = now()
  where site_id = v_publication.site_id and status = 'published' and id <> v_publication.id;
  update app.publication
  set status = 'published', published_at = now(), published_by = v_publication.requested_by
  where id = v_publication.id;
  return 'published';
end
$$;

create function app.worker_fail_publication(p_publication_id uuid, p_failure_code text, p_job_id uuid, p_attempt integer) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  if not app.lock_publication_job(p_publication_id, p_job_id, p_attempt) then return false; end if;
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  -- The previous publication stays active (architecture §09).
  update app.publication set status = 'failed', failure_code = left(p_failure_code, 100)
  where id = p_publication_id and status in ('queued', 'building');
  return found;
end
$$;

grant execute on function
  app.worker_start_publication(uuid, uuid, uuid, integer),
  app.worker_complete_publication(uuid, jsonb, jsonb, text, text, text, uuid, integer),
  app.worker_fail_publication(uuid, text, uuid, integer)
to etare_worker;

-- An expired owner cannot revive or acknowledge a job that must be reclaimed.
create or replace function app.heartbeat_job(p_job_id uuid, p_worker text, p_lease_seconds integer) returns boolean
language sql volatile
security definer
set search_path = ''
as $$
  with updated as (
    update app.job set lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    where id = p_job_id and status = 'running' and lease_owner = p_worker and lease_expires_at > clock_timestamp()
    returning 1
  )
  select exists (select 1 from updated)
$$;

create or replace function app.complete_job(p_job_id uuid, p_worker text) returns boolean
language sql volatile
security definer
set search_path = ''
as $$
  with updated as (
    update app.job set status = 'succeeded', lease_owner = null, lease_expires_at = null,
                       completed_at = now(), updated_at = now()
    where id = p_job_id and status = 'running' and lease_owner = p_worker and lease_expires_at > clock_timestamp()
    returning 1
  )
  select exists (select 1 from updated)
$$;

-- p_retry_in_seconds = null means a permanent error (dead immediately).
create or replace function app.fail_job(p_job_id uuid, p_worker text, p_error_code text, p_retry_in_seconds integer)
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
  where id = p_job_id and status = 'running' and lease_owner = p_worker and lease_expires_at > clock_timestamp()
  returning status
$$;

-- Any terminal queue failure (including the final lease expiring after a crash)
-- releases the publication for a new publication request. Never change an active version.
create function app.fail_publication_on_dead_job() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.job_type = 'publication.build' then
    perform set_config('app.actor_type', 'worker', true);
    perform set_config('app.origin', 'worker', true);
    update app.publication p set status = 'failed',
      failure_code = left(coalesce(new.last_error_code, 'PUBLICATION_JOB_DEAD'), 100)
    where p.tenant_id = new.tenant_id and p.id::text = new.payload ->> 'publication_id'
      and new.idempotency_key = 'publication.build:' || p.id::text
      and p.status in ('queued', 'building');
  end if;
  return new;
end
$$;
create trigger job_publication_terminal_failure after update of status on app.job
for each row when (new.status = 'dead' and old.status is distinct from new.status)
execute function app.fail_publication_on_dead_job();

-- Repair publications stranded by terminal jobs before this migration.
-- A transaction-local worker context keeps the repair visible in the audit trail.
do $$
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  update app.publication p set status = 'failed',
    failure_code = left(coalesce(j.last_error_code, 'PUBLICATION_JOB_DEAD'), 100)
  from app.job j
  where j.status = 'dead' and j.job_type = 'publication.build' and j.tenant_id = p.tenant_id
    and j.payload ->> 'publication_id' = p.id::text
    and j.idempotency_key = 'publication.build:' || p.id::text
    and p.status in ('queued', 'building');
end
$$;

-- Helper and trigger functions remain private; only the fenced entry points are granted.
revoke all on all routines in schema app from public;
