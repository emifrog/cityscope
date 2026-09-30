-- =============================================================================
-- Working data ("données de travail"): addresses, sites, buildings, levels,
-- assets (file metadata), plans and zones.
--
-- Isolation rules enforced by SQL, independently from RLS:
--   * every row carries tenant_id NOT NULL;
--   * foreign keys include tenant_id (and site_id below the site), so a row can
--     never reference a parent of another tenant or of another site;
--   * no ON DELETE CASCADE, no DELETE grant: business deletions are logical.
--
-- Geometry: global coordinates are EPSG:4326 (GeoJSON lon/lat). Interior
-- positions drawn on a plan use a LOCAL geometry (SRID 0) tied to the exact
-- plan revision they were drawn on (units: pixel, normalized or metre once
-- calibrated). GPS is never used to invent an interior position.
-- =============================================================================

-- Policies of a tenant-owned, site-scoped working table.
create procedure app.install_site_scoped_policies(
  p_table regclass,
  p_read_permission text,
  p_write_permission text,
  p_site_column text default 'site_id'
)
language plpgsql
set search_path = ''
as $$
declare
  v_name text := replace(p_table::text, 'app.', '');
begin
  execute format('alter table %s enable row level security', p_table);
  execute format('grant select, insert, update on %s to etare_api', p_table);
  execute format(
    'create policy %I on %s for select to etare_api using (
       tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission(%L)) or app.has_permission(%L, %I)))',
    v_name || '_select', p_table, p_read_permission, p_read_permission, p_site_column);
  execute format(
    'create policy %I on %s for insert to etare_api with check (
       tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission(%L)) or app.has_permission(%L, %I)))',
    v_name || '_insert', p_table, p_write_permission, p_write_permission, p_site_column);
  execute format(
    'create policy %I on %s for update to etare_api
       using (tenant_id = (select app.current_tenant_id())
              and ((select app.has_permission(%L)) or app.has_permission(%L, %I)))
       with check (tenant_id = (select app.current_tenant_id())
              and ((select app.has_permission(%L)) or app.has_permission(%L, %I)))',
    v_name || '_update', p_table,
    p_write_permission, p_write_permission, p_site_column,
    p_write_permission, p_write_permission, p_site_column);
end
$$;

-- -----------------------------------------------------------------------------
create table app.address (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  label text not null check (length(btrim(label)) between 1 and 300),
  street text,
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  city text not null,
  insee_code text check (insee_code ~ '^[0-9][0-9AB][0-9]{3}$'),
  geom extensions.geometry(Point, 4326) check (geom is null or extensions.st_isvalid(geom)),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, id)
);
create index address_label_trgm on app.address using gin (label extensions.gin_trgm_ops);

call app.install_tenant_table_triggers('app.address');

-- -----------------------------------------------------------------------------
create table app.site (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  name text not null check (length(btrim(name)) between 1 and 200),
  short_name text check (length(short_name) <= 80),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'archived')),
  site_type text not null check (site_type in ('erp', 'industrial', 'health', 'education', 'heritage', 'other')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal', 'restricted', 'high')),
  address_id uuid,
  geom extensions.geometry(Point, 4326) check (geom is null or extensions.st_isvalid(geom)),
  footprint extensions.geometry(MultiPolygon, 4326) check (footprint is null or extensions.st_isvalid(footprint)),
  etare_number text check (length(etare_number) <= 40),
  data_quality_score smallint check (data_quality_score between 0 and 100),
  last_verified_at timestamptz,
  -- Pointer to the publication currently distributed (maintained by the publication trigger).
  active_publication_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, address_id) references app.address (tenant_id, id)
);
comment on column app.site.geom is 'Reference point (EPSG:4326).';
comment on column app.site.footprint is 'Optional site footprint (EPSG:4326).';

create unique index site_etare_number_uq on app.site (tenant_id, etare_number) where etare_number is not null;
create index site_tenant_status_idx on app.site (tenant_id, status);
create index site_tenant_name_idx on app.site (tenant_id, name, id);
create index site_geom_gix on app.site using gist (geom);
create index site_footprint_gix on app.site using gist (footprint);
create index site_name_trgm on app.site using gin (name extensions.gin_trgm_ops);

call app.install_tenant_table_triggers('app.site');

-- -----------------------------------------------------------------------------
create table app.building (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  code text check (length(code) <= 40),
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order integer not null default 0,
  geom extensions.geometry(MultiPolygon, 4326) check (geom is null or extensions.st_isvalid(geom)),
  construction_type text,
  height_m numeric(6, 2) check (height_m >= 0),
  floors_above integer check (floors_above >= 0),
  floors_below integer check (floors_below >= 0),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id)
);
create index building_site_idx on app.building (site_id, sort_order);
create index building_geom_gix on app.building using gist (geom);

call app.install_tenant_table_triggers('app.building');

-- -----------------------------------------------------------------------------
create table app.level (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  building_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 40),
  sort_order integer not null,
  elevation_m numeric(7, 2),
  geom extensions.geometry(MultiPolygon, 4326) check (geom is null or extensions.st_isvalid(geom)),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  unique (building_id, label),
  foreign key (tenant_id, site_id, building_id) references app.building (tenant_id, site_id, id)
);
comment on table app.level is 'Building level (niveau: R-1, RDC, R+1...).';

call app.install_tenant_table_triggers('app.level');

-- -----------------------------------------------------------------------------
-- Binary files live in object storage; the database keeps metadata, integrity
-- (SHA-256), classification and scan state. Storage keys always start with the
-- tenant prefix: tenants/{tenant_id}/assets/{asset_id}/{version_id}.
create table app.asset (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  site_id uuid,
  storage_key text not null unique check (length(storage_key) <= 512),
  filename text not null check (length(filename) between 1 and 255),
  mime_type text not null check (mime_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  classification text not null default 'normal' check (classification in ('normal', 'restricted', 'high')),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'rejected')),
  offline_allowed boolean not null default false,
  thumbnail_key text,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  check (storage_key like 'tenants/' || tenant_id::text || '/%'),
  check (thumbnail_key is null or thumbnail_key like 'tenants/' || tenant_id::text || '/%'),
  check (offline_allowed = false or scan_status = 'clean')
);

-- The stored bytes of an asset never change: a new file is a new asset.
create function app.tg_asset_immutable_content() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.storage_key, new.sha256, new.size_bytes, new.mime_type)
     is distinct from (old.storage_key, old.sha256, old.size_bytes, old.mime_type) then
    raise exception 'asset content is immutable; create a new asset' using errcode = '23000';
  end if;
  return new;
end
$$;

create trigger asset_immutable_content before update on app.asset
for each row execute function app.tg_asset_immutable_content();
call app.install_tenant_table_triggers('app.asset');

-- -----------------------------------------------------------------------------
create table app.plan (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  building_id uuid,
  level_id uuid,
  plan_type text not null check (plan_type in ('site', 'level', 'network', 'evacuation', 'other')),
  title text not null check (length(btrim(title)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  foreign key (tenant_id, site_id, building_id) references app.building (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, level_id) references app.level (tenant_id, site_id, id),
  check (plan_type <> 'level' or level_id is not null)
);

call app.install_tenant_table_triggers('app.plan');

-- A plan revision is an immutable background (PDF page or image) plus its
-- calibration. Replacing a plan creates a new revision; objects drawn on the
-- previous one must be re-checked visually (architecture §08).
create table app.plan_revision (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  plan_id uuid not null,
  revision_no integer not null check (revision_no > 0),
  asset_id uuid not null,
  page_number integer not null default 1 check (page_number > 0),
  width numeric(10, 2) not null check (width > 0),
  height numeric(10, 2) not null check (height > 0),
  -- Unit of the local coordinates. Axes: origin top-left, x to the right, y downwards.
  local_unit text not null default 'pixel' check (local_unit in ('pixel', 'normalized', 'metre')),
  calibration jsonb check (calibration is null or jsonb_typeof(calibration) = 'object'),
  georeference jsonb check (georeference is null or jsonb_typeof(georeference) = 'object'),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  unique (plan_id, revision_no),
  foreign key (tenant_id, site_id, plan_id) references app.plan (tenant_id, site_id, id),
  foreign key (tenant_id, asset_id) references app.asset (tenant_id, id),
  check (local_unit <> 'metre' or calibration is not null)
);
create unique index plan_revision_current_uq on app.plan_revision (plan_id) where is_current;

create function app.tg_plan_revision_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.plan_id, new.revision_no, new.asset_id, new.page_number, new.width, new.height, new.local_unit)
     is distinct from (old.plan_id, old.revision_no, old.asset_id, old.page_number, old.width, old.height, old.local_unit) then
    raise exception 'a plan revision background is immutable; create a new revision' using errcode = '23000';
  end if;
  return new;
end
$$;

create trigger plan_revision_immutable before update on app.plan_revision
for each row execute function app.tg_plan_revision_immutable();
call app.install_tenant_table_triggers('app.plan_revision');

-- -----------------------------------------------------------------------------
create table app.zone (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  level_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  zone_type text not null check (zone_type in ('room', 'refuge', 'technical', 'storage', 'public', 'circulation', 'other')),
  plan_revision_id uuid,
  local_geom extensions.geometry(Polygon),
  geom extensions.geometry(Polygon, 4326) check (geom is null or extensions.st_isvalid(geom)),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, level_id) references app.level (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, plan_revision_id) references app.plan_revision (tenant_id, site_id, id),
  check (local_geom is null or (plan_revision_id is not null and extensions.st_srid(local_geom) = 0 and extensions.st_isvalid(local_geom)))
);
create index zone_level_idx on app.zone (level_id);

call app.install_tenant_table_triggers('app.zone');

-- -----------------------------------------------------------------------------
-- Audit, grants and policies.
-- -----------------------------------------------------------------------------
call app.install_audit_trigger('app.address');
call app.install_audit_trigger('app.site');
call app.install_audit_trigger('app.building');
call app.install_audit_trigger('app.level');
call app.install_audit_trigger('app.asset');
call app.install_audit_trigger('app.plan');
call app.install_audit_trigger('app.plan_revision');
call app.install_audit_trigger('app.zone');

-- Addresses are shared by the sites of a tenant: tenant-wide permissions only.
alter table app.address enable row level security;
grant select, insert, update on app.address to etare_api;
create policy address_select on app.address for select to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('site:read')));
create policy address_insert on app.address for insert to etare_api
with check (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('site:write')));
create policy address_update on app.address for update to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('site:write')))
with check (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('site:write')));

call app.install_site_scoped_policies('app.site', 'site:read', 'site:write', 'id');
call app.install_site_scoped_policies('app.building', 'site:read', 'site:write');
call app.install_site_scoped_policies('app.level', 'site:read', 'site:write');
call app.install_site_scoped_policies('app.plan', 'site:read', 'site:write');
call app.install_site_scoped_policies('app.plan_revision', 'site:read', 'site:write');
call app.install_site_scoped_policies('app.zone', 'site:read', 'site:write');

-- Assets may be tenant-level (no site): tenant-wide permissions, or site-scoped when attached to a site.
alter table app.asset enable row level security;
grant select, insert, update on app.asset to etare_api;
create policy asset_select on app.asset for select to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('site:read')) or (site_id is not null and app.has_permission('site:read', site_id))));
create policy asset_insert on app.asset for insert to etare_api
with check (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('site:write')) or (site_id is not null and app.has_permission('site:write', site_id))));
create policy asset_update on app.asset for update to etare_api
using (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('site:write')) or (site_id is not null and app.has_permission('site:write', site_id))))
with check (tenant_id = (select app.current_tenant_id())
       and ((select app.has_permission('site:write')) or (site_id is not null and app.has_permission('site:write', site_id))));

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
