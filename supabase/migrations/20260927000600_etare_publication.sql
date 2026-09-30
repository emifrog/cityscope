-- =============================================================================
-- ETARE dossiers, revisions, approvals and immutable publications.
--
--   WORKING DATA --submit--> REVISION (frozen snapshot + SHA-256)
--     --approve (distinct validator, same hash)--> APPROVED REVISION
--     --publish--> PUBLICATION (immutable, numbered per site) --> offline package
--
-- Two separate state machines (ADR-005):
--   revision:    draft -> submitted -> approved | changes_requested ; draft|approved -> superseded
--   publication: queued -> building -> ready -> published -> superseded | withdrawn ; queued|building -> failed
--
-- Guarantees enforced in SQL (in addition to the application):
--   * a submitted revision's snapshot/hash never change;
--   * an approval is append-only, bound to the revision hash, and the approver
--     is neither the author, the submitter nor a contributor of the revision;
--   * a publication's payload/manifest never change once ready; numbers are
--     strictly increasing per site; only one publication is active per site and
--     an obsolete build can never replace a newer publication.
-- =============================================================================

create table app.etare (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id)
);
comment on table app.etare is 'ETARE dossier of a site (one active dossier per site). Workflow states live on revisions and publications.';
create unique index etare_active_site_uq on app.etare (site_id) where status = 'active';
call app.install_tenant_table_triggers('app.etare');

-- -----------------------------------------------------------------------------
create table app.etare_revision (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  etare_id uuid not null,
  revision_no integer not null check (revision_no > 0),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'changes_requested', 'superseded')),
  base_publication_id uuid,
  -- Canonical snapshot of the working data, frozen at submission.
  snapshot jsonb check (snapshot is null or jsonb_typeof(snapshot) = 'object'),
  content_hash text check (content_hash ~ '^[0-9a-f]{64}$'),
  change_summary text check (length(change_summary) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null default app.current_user_id(),
  submitted_at timestamptz,
  submitted_by uuid,
  decided_at timestamptz,
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  unique (etare_id, revision_no),
  foreign key (tenant_id, site_id, etare_id) references app.etare (tenant_id, site_id, id),
  check (status = 'draft' or status = 'superseded' or (snapshot is not null and content_hash is not null and submitted_by is not null))
);
comment on table app.etare_revision is 'EtareVersion: a candidate version of the dossier. Validation always targets one exact revision (hash).';
create unique index etare_revision_open_uq on app.etare_revision (etare_id) where status in ('draft', 'submitted');

create table app.etare_revision_contributor (
  tenant_id uuid not null,
  site_id uuid not null,
  revision_id uuid not null,
  user_id uuid not null references app.user_account (id),
  first_contributed_at timestamptz not null default now(),
  last_contributed_at timestamptz not null default now(),
  primary key (revision_id, user_id),
  foreign key (tenant_id, site_id, revision_id) references app.etare_revision (tenant_id, site_id, id)
);
comment on table app.etare_revision_contributor is 'Everyone who edited a revision: none of them may approve it (separation of duties).';

create function app.tg_etare_revision_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' and app.is_application_session() then
      raise exception 'a revision is created as draft' using errcode = '23514';
    end if;
    if app.is_application_session() and not app.has_permission('etare:edit', new.site_id) then
      raise exception 'permission etare:edit required' using errcode = '42501';
    end if;
    return new;
  end if;

  if (new.etare_id, new.revision_no, new.created_by) is distinct from (old.etare_id, old.revision_no, old.created_by) then
    raise exception 'revision identity is immutable' using errcode = '23000';
  end if;
  if old.status <> 'draft'
     and (new.snapshot is distinct from old.snapshot or new.content_hash is distinct from old.content_hash
          or new.submitted_by is distinct from old.submitted_by or new.submitted_at is distinct from old.submitted_at) then
    raise exception 'a submitted revision is frozen' using errcode = '23000';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('submitted', 'superseded'))
      or (old.status = 'submitted' and new.status in ('approved', 'changes_requested'))
      or (old.status = 'approved' and new.status = 'superseded')
    ) then
      raise exception 'invalid revision transition % -> %', old.status, new.status using errcode = '23514';
    end if;
    if app.is_application_session() then
      if new.status = 'submitted' and not app.has_permission('etare:submit', new.site_id) then
        raise exception 'permission etare:submit required' using errcode = '42501';
      end if;
      if new.status in ('approved', 'changes_requested') and not app.has_permission('etare:approve', new.site_id) then
        raise exception 'permission etare:approve required' using errcode = '42501';
      end if;
    end if;
    if new.status in ('approved', 'changes_requested') and not exists (
      select 1 from app.approval a
      where a.revision_id = new.id
        and a.revision_hash = new.content_hash
        and a.decision = case new.status when 'approved' then 'approved' else 'changes_requested' end
    ) then
      raise exception 'a matching approval decision must be recorded first' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

create trigger etare_revision_guard before insert or update on app.etare_revision
for each row execute function app.tg_etare_revision_guard();
call app.install_tenant_table_triggers('app.etare_revision');

-- -----------------------------------------------------------------------------
create table app.approval (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  revision_id uuid not null,
  revision_hash text not null check (revision_hash ~ '^[0-9a-f]{64}$'),
  decision text not null check (decision in ('approved', 'changes_requested', 'rejected')),
  actor_id uuid not null default app.current_user_id() references app.user_account (id),
  comment text check (length(comment) <= 4000),
  created_at timestamptz not null default now(),
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, revision_id) references app.etare_revision (tenant_id, site_id, id),
  check (decision = 'approved' or comment is not null)
);
comment on table app.approval is 'Append-only validation decisions, bound to the exact revision hash.';

create function app.tg_approval_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_revision app.etare_revision;
begin
  if tg_op <> 'INSERT' then
    raise exception 'approvals are append-only' using errcode = '42501';
  end if;

  select * into v_revision from app.etare_revision where id = new.revision_id;
  if v_revision.status <> 'submitted' then
    raise exception 'only a submitted revision can be decided (status %)', v_revision.status using errcode = '23514';
  end if;
  if v_revision.content_hash is distinct from new.revision_hash then
    raise exception 'REVISION_HASH_MISMATCH: the revision changed since it was reviewed' using errcode = '23514';
  end if;
  if app.is_application_session() and not app.has_permission('etare:approve', new.site_id) then
    raise exception 'permission etare:approve required' using errcode = '42501';
  end if;
  if new.actor_id = v_revision.created_by
     or new.actor_id = v_revision.submitted_by
     or exists (select 1 from app.etare_revision_contributor c where c.revision_id = new.revision_id and c.user_id = new.actor_id) then
    raise exception 'SELF_APPROVAL_FORBIDDEN: the validator contributed to this revision' using errcode = '42501';
  end if;
  if app.is_application_session() and new.actor_id is distinct from app.current_user_id() then
    raise exception 'an approval is recorded by its actor' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger approval_guard before insert or update or delete on app.approval
for each row execute function app.tg_approval_guard();

-- -----------------------------------------------------------------------------
create table app.publication (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  etare_id uuid not null,
  revision_id uuid not null,
  approval_id uuid not null,
  publication_number integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'building', 'ready', 'published', 'superseded', 'withdrawn', 'failed')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'restricted', 'high')),
  schema_version integer not null default 1 check (schema_version > 0),
  template_version text,
  payload jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  manifest jsonb check (manifest is null or jsonb_typeof(manifest) = 'object'),
  manifest_hash text check (manifest_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text check (length(idempotency_key) <= 200),
  requested_by uuid not null default app.current_user_id(),
  requested_at timestamptz not null default now(),
  ready_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  superseded_at timestamptz,
  withdrawn_at timestamptz,
  withdrawal_reason text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, id),
  unique (tenant_id, site_id, id),
  unique (site_id, publication_number),
  foreign key (tenant_id, site_id, etare_id) references app.etare (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, revision_id) references app.etare_revision (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, approval_id) references app.approval (tenant_id, site_id, id),
  check (status in ('queued', 'building', 'failed') or (payload is not null and manifest is not null and manifest_hash is not null)),
  check (status <> 'published' or (published_at is not null and published_by is not null)),
  check (status <> 'withdrawn' or (withdrawn_at is not null and withdrawal_reason is not null)),
  check (status <> 'failed' or failure_code is not null)
);
comment on table app.publication is 'Immutable published version of a site ETARE, consumed by OPS terminals (never the working tables).';
create unique index publication_active_site_uq on app.publication (site_id) where status = 'published';
create unique index publication_idempotency_uq on app.publication (tenant_id, idempotency_key) where idempotency_key is not null;

create function app.tg_publication_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_approval app.approval;
begin
  if tg_op = 'DELETE' then
    raise exception 'publications are never deleted' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'queued' and app.is_application_session() then
      raise exception 'a publication is created queued' using errcode = '23514';
    end if;
    if app.is_application_session() and not app.has_permission('publication:publish', new.site_id) then
      raise exception 'permission publication:publish required' using errcode = '42501';
    end if;
    select * into v_approval from app.approval where id = new.approval_id;
    if v_approval.decision <> 'approved' or v_approval.revision_id <> new.revision_id then
      raise exception 'a publication requires an approval of the same revision' using errcode = '23514';
    end if;
    -- Strictly increasing number per site, serialized per site.
    perform pg_advisory_xact_lock(hashtextextended('app.publication:' || new.site_id::text, 0));
    select coalesce(max(p.publication_number), 0) + 1 into new.publication_number
    from app.publication p where p.site_id = new.site_id;
    return new;
  end if;

  -- UPDATE
  if (new.site_id, new.etare_id, new.revision_id, new.approval_id, new.publication_number, new.requested_by, new.requested_at)
     is distinct from (old.site_id, old.etare_id, old.revision_id, old.approval_id, old.publication_number, old.requested_by, old.requested_at) then
    raise exception 'publication identity is immutable' using errcode = '23000';
  end if;
  if old.status in ('ready', 'published', 'superseded', 'withdrawn')
     and (new.payload is distinct from old.payload or new.manifest is distinct from old.manifest
          or new.manifest_hash is distinct from old.manifest_hash or new.schema_version is distinct from old.schema_version
          or new.template_version is distinct from old.template_version or new.sensitivity is distinct from old.sensitivity) then
    raise exception 'PUBLICATION_IMMUTABLE: a built publication never changes; publish a new version' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'queued' and new.status in ('building', 'failed'))
      or (old.status = 'building' and new.status in ('ready', 'failed'))
      or (old.status = 'ready' and new.status in ('published', 'superseded'))
      or (old.status = 'published' and new.status in ('superseded', 'withdrawn'))
    ) then
      raise exception 'invalid publication transition % -> %', old.status, new.status using errcode = '23514';
    end if;
    if new.status = 'published' and exists (
      select 1 from app.publication p
      where p.site_id = new.site_id and p.id <> new.id
        and p.status in ('published', 'superseded', 'withdrawn')
        and p.publication_number > new.publication_number
    ) then
      raise exception 'OBSOLETE_PUBLICATION: a newer publication already exists for this site' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

create trigger publication_guard before insert or update or delete on app.publication
for each row execute function app.tg_publication_guard();
create trigger touch_row before update on app.publication for each row execute function app.tg_touch_row();
create trigger forbid_tenant_change before update on app.publication for each row execute function app.tg_forbid_tenant_change();

-- Keeps site.active_publication_id in sync with the published publication.
create function app.tg_publication_activate() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' then
    update app.site set active_publication_id = new.id
    where id = new.site_id and tenant_id = new.tenant_id;
  elsif tg_op = 'UPDATE' then
    if old.status = 'published' then
      update app.site set active_publication_id = null
      where id = new.site_id and tenant_id = new.tenant_id and active_publication_id = new.id;
    end if;
  end if;
  return null;
end
$$;

create trigger publication_activate after insert or update of status on app.publication
for each row execute function app.tg_publication_activate();

alter table app.site
  add constraint site_active_publication_fk
  foreign key (tenant_id, active_publication_id) references app.publication (tenant_id, id);
alter table app.etare_revision
  add constraint etare_revision_base_publication_fk
  foreign key (tenant_id, base_publication_id) references app.publication (tenant_id, id);

-- -----------------------------------------------------------------------------
-- Audit (large payloads are never copied into the journal), grants, policies.
-- -----------------------------------------------------------------------------
call app.install_audit_trigger('app.etare');
call app.install_audit_trigger('app.etare_revision', array['snapshot']);
call app.install_audit_trigger('app.etare_revision_contributor');
call app.install_audit_trigger('app.approval');
call app.install_audit_trigger('app.publication', array['payload', 'manifest']);

call app.install_site_scoped_policies('app.etare', 'etare:read', 'etare:edit');
call app.install_site_scoped_policies('app.etare_revision', 'etare:read', 'etare:edit');
call app.install_site_scoped_policies('app.etare_revision_contributor', 'etare:read', 'etare:edit');

-- Status changes by validators (approve / request changes) go through the guard trigger
-- above; the update policy must therefore also admit etare:approve holders.
create policy etare_revision_update_decision on app.etare_revision for update to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('etare:approve')) or app.has_permission('etare:approve', site_id)))
with check (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('etare:approve')) or app.has_permission('etare:approve', site_id)));

alter table app.approval enable row level security;
grant select, insert on app.approval to etare_api;
create policy approval_select on app.approval for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('etare:read')) or app.has_permission('etare:read', site_id)));
create policy approval_insert on app.approval for insert to etare_api
with check (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('etare:approve')) or app.has_permission('etare:approve', site_id)));

alter table app.publication enable row level security;
grant select, insert, update on app.publication to etare_api;
create policy publication_select on app.publication for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('publication:read')) or app.has_permission('publication:read', site_id)));
create policy publication_insert on app.publication for insert to etare_api
with check (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('publication:publish')) or app.has_permission('publication:publish', site_id)));
create policy publication_update on app.publication for update to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('publication:publish')) or app.has_permission('publication:publish', site_id)))
with check (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('publication:publish')) or app.has_permission('publication:publish', site_id)));

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
