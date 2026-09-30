-- =============================================================================
-- Sprint 3 — revision, validation and publication workflow (WF-01, WF-02, ETARE-01).
--
--   * member_name(): the workflow shows who wrote, submitted and decided a
--     revision. Identity tables stay closed (RLS); this function only names
--     members of the current SIS, never their e-mail;
--   * worker functions build a publication from the frozen snapshot of its
--     revision only (architecture §09): start (queued -> building), complete
--     (ready -> published, previous one superseded, an obsolete build never
--     replaces a newer publication), fail.
-- =============================================================================

create function app.member_name(p_user_id uuid) returns text
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(u.display_name, 'Membre du SIS')
  from app.user_account u
  where u.id = p_user_id
    and exists (
      select 1 from app.membership m
      where m.user_id = u.id and m.tenant_id = app.current_tenant_id()
    )
$$;
comment on function app.member_name(uuid) is 'Display name of a member of the current SIS (workflow authors), null otherwise.';
grant execute on function app.member_name(uuid) to etare_api;

-- -----------------------------------------------------------------------------
-- Publication build (worker)
-- -----------------------------------------------------------------------------
create function app.worker_start_publication(p_publication_id uuid, p_tenant_id uuid)
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
  p_publication_id uuid, p_payload jsonb, p_manifest jsonb, p_manifest_hash text, p_template_version text
) returns text
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_publication app.publication;
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);

  update app.publication
  set status = 'ready', payload = p_payload, manifest = p_manifest, manifest_hash = p_manifest_hash,
      template_version = p_template_version, ready_at = now()
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

create function app.worker_fail_publication(p_publication_id uuid, p_failure_code text) returns boolean
language plpgsql volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor_type', 'worker', true);
  perform set_config('app.origin', 'worker', true);
  -- The previous publication stays active (architecture §09).
  update app.publication set status = 'failed', failure_code = left(p_failure_code, 100)
  where id = p_publication_id and status in ('queued', 'building');
  return found;
end
$$;

grant execute on function
  app.worker_start_publication(uuid, uuid),
  app.worker_complete_publication(uuid, jsonb, jsonb, text, text),
  app.worker_fail_publication(uuid, text)
to etare_worker;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
