-- =============================================================================
-- Sprint 1 — editable site referential.
--
--   * site_edit: who edited the working data of each site, maintained by
--     PostgreSQL (never by the caller). At submission, every user who edited
--     the site since the last approved revision becomes a contributor of the
--     submitted revision, and therefore cannot approve it (separation of duties
--     covering all working data, not only the revision row).
--   * site_classification (ERP/IGH/ICPE/SEVESO/...): multi-valued, dated,
--     history kept by the audit journal (no deletion).
--   * contact: site contacts with an explicit audience (visibility), default
--     "prevision" (least exposure).
--   * external_identifier: keys of external systems (SIG, SGO, DECI...).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Working-data authorship
-- -----------------------------------------------------------------------------
create table app.site_edit (
  tenant_id uuid not null,
  site_id uuid not null,
  user_id uuid not null references app.user_account (id),
  first_edited_at timestamptz not null default clock_timestamp(),
  last_edited_at timestamptz not null default clock_timestamp(),
  primary key (site_id, user_id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id)
);
comment on table app.site_edit is 'Authors of working-data changes per site (feeds revision contributors).';

-- TG_ARGV[0] names the column holding the site id ("id" for app.site itself).
create function app.tg_record_site_edit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  -- Migrations and seeds have no verified actor: they are not authorship.
  if app.current_user_id() is null or v_site is null then
    return null;
  end if;
  -- System-maintained columns (e.g. the active publication pointer set when a
  -- validator publishes) are not an edit of the working data.
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['updated_at', 'row_version', 'active_publication_id'])
       = (to_jsonb(old) - array['updated_at', 'row_version', 'active_publication_id']) then
    return null;
  end if;
  insert into app.site_edit (tenant_id, site_id, user_id)
  values (new.tenant_id, v_site, app.current_user_id())
  on conflict (site_id, user_id) do update set last_edited_at = clock_timestamp();
  return null;
end
$$;

create procedure app.install_site_edit_trigger(p_table regclass, p_site_column text default 'site_id')
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create trigger record_site_edit after insert or update on %s for each row execute function app.tg_record_site_edit(%L)',
    p_table, p_site_column
  );
end
$$;

call app.install_site_edit_trigger('app.site', 'id');
call app.install_site_edit_trigger('app.building');
call app.install_site_edit_trigger('app.level');
call app.install_site_edit_trigger('app.zone');
call app.install_site_edit_trigger('app.plan');
call app.install_site_edit_trigger('app.plan_revision');
call app.install_site_edit_trigger('app.operational_object');
call app.install_site_edit_trigger('app.risk_occurrence');
call app.install_site_edit_trigger('app.document');
call app.install_site_edit_trigger('app.document_version');
call app.install_site_edit_trigger('app.asset');

-- At submission, the authors of working changes since the last approved revision
-- become contributors of the submitted revision.
create function app.tg_revision_collect_contributors() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  if not (old.status = 'draft' and new.status = 'submitted') then
    return null;
  end if;
  select max(r.submitted_at) into v_since
  from app.etare_revision r
  where r.etare_id = new.etare_id
    and r.id <> new.id
    and r.status in ('approved', 'superseded')
    and r.submitted_at is not null;

  insert into app.etare_revision_contributor
    (tenant_id, site_id, revision_id, user_id, first_contributed_at, last_contributed_at)
  select new.tenant_id, new.site_id, new.id, e.user_id, e.first_edited_at, e.last_edited_at
  from app.site_edit e
  where e.site_id = new.site_id
    and e.last_edited_at > coalesce(v_since, '-infinity'::timestamptz)
  on conflict (revision_id, user_id) do nothing;
  return null;
end
$$;

create trigger revision_collect_contributors after update of status on app.etare_revision
for each row execute function app.tg_revision_collect_contributors();

alter table app.site_edit enable row level security;
grant select on app.site_edit to etare_api;
create policy site_edit_select on app.site_edit for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('etare:read')) or app.has_permission('etare:read', site_id)));

-- -----------------------------------------------------------------------------
-- Classifications
-- -----------------------------------------------------------------------------
create table app.site_classification (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  classification_type text not null
    check (classification_type in ('ERP', 'IGH', 'ICPE', 'SEVESO', 'ETARE', 'PPI', 'OTHER')),
  code text check (length(btrim(code)) between 1 and 40),
  category text check (length(btrim(category)) between 1 and 40),
  label text check (length(label) <= 200),
  valid_from date,
  valid_to date,
  source text check (length(source) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
comment on table app.site_classification is 'Regulatory classifications of a site (ERP type J 3e cat., IGH, ICPE, SEVESO...), dated.';
create index site_classification_site_idx on app.site_classification (site_id);

call app.install_tenant_table_triggers('app.site_classification');
call app.install_audit_trigger('app.site_classification');
call app.install_site_edit_trigger('app.site_classification');
call app.install_site_scoped_policies('app.site_classification', 'site:read', 'site:write');

-- -----------------------------------------------------------------------------
-- Contacts
-- -----------------------------------------------------------------------------
create table app.contact (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  role text check (length(role) <= 200),
  phone text not null check (phone ~ '^\+?[0-9][0-9 .()-]{5,23}$'),
  phone_alt text check (phone_alt ~ '^\+?[0-9][0-9 .()-]{5,23}$'),
  email extensions.citext check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  availability text check (length(availability) <= 200),
  -- Audience: 'ops' distributed to field terminals, 'prevision' internal to the SIS,
  -- 'operator' shared with the site operator.
  visibility text not null default 'prevision' check (visibility in ('ops', 'prevision', 'operator')),
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id)
);
comment on table app.contact is 'Professional contacts of a site (on-call, security post...). Personal data: keep minimal.';
create index contact_site_idx on app.contact (site_id, sort_order);

call app.install_tenant_table_triggers('app.contact');
call app.install_audit_trigger('app.contact');
call app.install_site_edit_trigger('app.contact');
call app.install_site_scoped_policies('app.contact', 'site:read', 'site:write');

-- -----------------------------------------------------------------------------
-- External identifiers
-- -----------------------------------------------------------------------------
create table app.external_identifier (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  entity_type text not null check (entity_type in ('site', 'building', 'operational_object')),
  entity_id uuid not null,
  system_code text not null check (system_code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  external_id text not null check (length(btrim(external_id)) between 1 and 200),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, system_code, external_id),
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id)
);
comment on table app.external_identifier is 'Identifiers of the same entity in external systems (SIG, SGO/NexSIS, DECI...).';
create index external_identifier_entity_idx on app.external_identifier (entity_type, entity_id);

-- The referenced entity must belong to the same site (the reference is polymorphic, so no FK).
create function app.tg_external_identifier_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  v_ok := case new.entity_type
    when 'site' then new.entity_id = new.site_id
    when 'building' then exists (
      select 1 from app.building b where b.id = new.entity_id and b.site_id = new.site_id and b.tenant_id = new.tenant_id)
    when 'operational_object' then exists (
      select 1 from app.operational_object o where o.id = new.entity_id and o.site_id = new.site_id and o.tenant_id = new.tenant_id)
    else false
  end;
  if not v_ok then
    raise exception 'external identifier target does not belong to the site' using errcode = '23503';
  end if;
  return new;
end
$$;

create trigger external_identifier_guard before insert or update on app.external_identifier
for each row execute function app.tg_external_identifier_guard();
call app.install_tenant_table_triggers('app.external_identifier');
call app.install_audit_trigger('app.external_identifier');
call app.install_site_edit_trigger('app.external_identifier');
call app.install_site_scoped_policies('app.external_identifier', 'site:read', 'site:write');

-- -----------------------------------------------------------------------------
-- Search support (SITE-06)
-- -----------------------------------------------------------------------------
create index address_city_idx on app.address (tenant_id, city);
create index site_etare_number_trgm on app.site using gin (etare_number extensions.gin_trgm_ops);

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
