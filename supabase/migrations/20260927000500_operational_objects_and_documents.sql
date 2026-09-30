-- =============================================================================
-- Operational objects, risks and documents (working data) + initial global
-- catalogues (data model doc, §12).
--
-- Catalogues: tenant_id NULL = global catalogue (read-only for tenants);
-- tenant_id set = SIS-specific entry (future ADMIN-03). Objects are structured
-- and queryable: a symbol on a plan is a row with typed properties, never a
-- drawing.
-- =============================================================================

create table app.object_type (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenant (id),
  code text not null check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  category text not null check (category in (
    'access', 'water', 'energy', 'safety', 'smoke_control', 'vertical', 'risk', 'refuge', 'communication', 'annotation'
  )),
  geometry_kind text not null check (geometry_kind in ('point', 'line', 'polygon')),
  icon_key text not null,
  -- JSON Schema of the type-specific properties (validated by the application).
  properties_schema jsonb not null default '{"type": "object"}'::jsonb check (jsonb_typeof(properties_schema) = 'object'),
  status text not null default 'active' check (status in ('active', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);
create unique index object_type_global_code_uq on app.object_type (code) where tenant_id is null;
create unique index object_type_tenant_code_uq on app.object_type (tenant_id, code) where tenant_id is not null;
create trigger touch_row before update on app.object_type for each row execute function app.tg_touch_row();
create trigger forbid_tenant_change before update on app.object_type for each row execute function app.tg_forbid_tenant_change();

create table app.risk_type (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenant (id),
  code text not null check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  default_severity smallint not null check (default_severity between 1 and 5),
  icon_key text not null,
  properties_schema jsonb not null default '{"type": "object"}'::jsonb check (jsonb_typeof(properties_schema) = 'object'),
  status text not null default 'active' check (status in ('active', 'deprecated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);
create unique index risk_type_global_code_uq on app.risk_type (code) where tenant_id is null;
create unique index risk_type_tenant_code_uq on app.risk_type (tenant_id, code) where tenant_id is not null;
create trigger touch_row before update on app.risk_type for each row execute function app.tg_touch_row();
create trigger forbid_tenant_change before update on app.risk_type for each row execute function app.tg_forbid_tenant_change();

-- A tenant row may only use a global catalogue entry or one of its own tenant.
create function app.tg_catalog_entry_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid;
  v_found boolean;
begin
  if tg_table_name = 'operational_object' then
    select tenant_id, true into v_owner, v_found from app.object_type where id = new.object_type_id;
  else
    select tenant_id, true into v_owner, v_found from app.risk_type where id = new.risk_type_id;
  end if;
  if v_found and v_owner is not null and v_owner <> new.tenant_id then
    raise exception 'catalogue entry belongs to another tenant' using errcode = '23514';
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
create table app.operational_object (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  building_id uuid,
  level_id uuid,
  zone_id uuid,
  object_type_id uuid not null references app.object_type (id),
  name text check (length(name) <= 200),
  label text check (length(label) <= 40),
  -- Exterior position (EPSG:4326), e.g. gate, hydrant, fire lane.
  geom extensions.geometry(Geometry, 4326) check (geom is null or extensions.st_isvalid(geom)),
  -- Interior position on a plan revision (local coordinates, SRID 0).
  plan_revision_id uuid,
  local_geom extensions.geometry(Geometry),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  instructions text,
  criticality text not null default 'info' check (criticality in ('info', 'important', 'critical')),
  display_priority smallint not null default 0,
  status text not null default 'active' check (status in ('active', 'out_of_service', 'unknown', 'archived')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  foreign key (tenant_id, site_id, building_id) references app.building (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, level_id) references app.level (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, zone_id) references app.zone (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, plan_revision_id) references app.plan_revision (tenant_id, site_id, id),
  check (local_geom is null or (plan_revision_id is not null and extensions.st_srid(local_geom) = 0 and extensions.st_isvalid(local_geom)))
);
create index operational_object_site_type_idx on app.operational_object (site_id, object_type_id);
create index operational_object_level_idx on app.operational_object (level_id);
create index operational_object_geom_gix on app.operational_object using gist (geom);
create index operational_object_local_geom_gix on app.operational_object using gist (local_geom);

create trigger catalog_entry_guard before insert or update on app.operational_object
for each row execute function app.tg_catalog_entry_guard();
call app.install_tenant_table_triggers('app.operational_object');

-- -----------------------------------------------------------------------------
create table app.risk_occurrence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  building_id uuid,
  level_id uuid,
  zone_id uuid,
  object_id uuid,
  risk_type_id uuid not null references app.risk_type (id),
  severity smallint not null check (severity between 1 and 5),
  description text,
  quantity numeric(14, 3) check (quantity >= 0),
  unit text check (length(unit) <= 20),
  geom extensions.geometry(Geometry, 4326) check (geom is null or extensions.st_isvalid(geom)),
  plan_revision_id uuid,
  local_geom extensions.geometry(Geometry),
  valid_from timestamptz,
  valid_to timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id),
  foreign key (tenant_id, site_id, building_id) references app.building (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, level_id) references app.level (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, zone_id) references app.zone (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, object_id) references app.operational_object (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, plan_revision_id) references app.plan_revision (tenant_id, site_id, id),
  check (valid_to is null or valid_from is null or valid_to > valid_from),
  check ((quantity is null) = (unit is null)),
  check (local_geom is null or (plan_revision_id is not null and extensions.st_srid(local_geom) = 0 and extensions.st_isvalid(local_geom)))
);
create index risk_occurrence_site_severity_idx on app.risk_occurrence (site_id, severity desc);
create index risk_occurrence_geom_gix on app.risk_occurrence using gist (geom);

create trigger catalog_entry_guard before insert or update on app.risk_occurrence
for each row execute function app.tg_catalog_entry_guard();
call app.install_tenant_table_triggers('app.risk_occurrence');

-- -----------------------------------------------------------------------------
create table app.document (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  category text not null check (category in ('fds', 'notice', 'instruction', 'plan', 'photo', 'other')),
  title text not null check (length(btrim(title)) between 1 and 200),
  offline_policy text not null default 'never' check (offline_policy in ('never', 'on_demand', 'always')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id) references app.site (tenant_id, id)
);
call app.install_tenant_table_triggers('app.document');

create table app.document_version (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  document_id uuid not null,
  version_no integer not null check (version_no > 0),
  asset_id uuid not null,
  valid_from date,
  expires_at date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default app.current_user_id(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  unique (document_id, version_no),
  foreign key (tenant_id, site_id, document_id) references app.document (tenant_id, site_id, id),
  foreign key (tenant_id, asset_id) references app.asset (tenant_id, id),
  check (expires_at is null or valid_from is null or expires_at >= valid_from)
);
call app.install_tenant_table_triggers('app.document_version');

-- -----------------------------------------------------------------------------
call app.install_audit_trigger('app.object_type');
call app.install_audit_trigger('app.risk_type');
call app.install_audit_trigger('app.operational_object');
call app.install_audit_trigger('app.risk_occurrence');
call app.install_audit_trigger('app.document');
call app.install_audit_trigger('app.document_version');

call app.install_site_scoped_policies('app.operational_object', 'site:read', 'site:write');
call app.install_site_scoped_policies('app.risk_occurrence', 'site:read', 'site:write');
call app.install_site_scoped_policies('app.document', 'site:read', 'site:write');
call app.install_site_scoped_policies('app.document_version', 'site:read', 'site:write');

alter table app.object_type enable row level security;
alter table app.risk_type enable row level security;
grant select, insert, update on app.object_type, app.risk_type to etare_api;

create policy object_type_select on app.object_type for select to etare_api
using (tenant_id is null or tenant_id = (select app.current_tenant_id()));
create policy object_type_insert on app.object_type for insert to etare_api
with check (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('catalog:manage')));
create policy object_type_update on app.object_type for update to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('catalog:manage')))
with check (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('catalog:manage')));

create policy risk_type_select on app.risk_type for select to etare_api
using (tenant_id is null or tenant_id = (select app.current_tenant_id()));
create policy risk_type_insert on app.risk_type for insert to etare_api
with check (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('catalog:manage')));
create policy risk_type_update on app.risk_type for update to etare_api
using (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('catalog:manage')))
with check (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('catalog:manage')));

-- -----------------------------------------------------------------------------
-- Initial global catalogues (data model doc, §12). Reference data, not demo data.
-- -----------------------------------------------------------------------------
insert into app.object_type (code, name, category, geometry_kind, icon_key) values
  ('ACCES_SECOURS', 'Entrée secours', 'access', 'point', 'access-entrance'),
  ('PORTAIL', 'Portail', 'access', 'point', 'access-gate'),
  ('VOIE_ENGINS', 'Voie engins', 'access', 'line', 'access-fire-lane'),
  ('AIRE_EPA', 'Aire EPA', 'access', 'polygon', 'access-aerial-ladder'),
  ('BOITE_A_CLES', 'Clé / boîte à clés', 'access', 'point', 'access-key-box'),
  ('PEI', 'Point d''eau incendie', 'water', 'point', 'water-hydrant'),
  ('RESERVE_INCENDIE', 'Réserve incendie', 'water', 'point', 'water-reserve'),
  ('COLONNE_SECHE', 'Colonne sèche', 'water', 'point', 'water-dry-riser'),
  ('COLONNE_HUMIDE', 'Colonne humide', 'water', 'point', 'water-wet-riser'),
  ('RIA', 'Robinet d''incendie armé', 'safety', 'point', 'safety-hose-reel'),
  ('SPRINKLER', 'Sprinkler', 'safety', 'polygon', 'safety-sprinkler'),
  ('SSI', 'Système de sécurité incendie', 'safety', 'point', 'safety-ssi'),
  ('CMSI', 'Centralisateur de mise en sécurité incendie', 'safety', 'point', 'safety-cmsi'),
  ('DESENFUMAGE', 'Commande de désenfumage', 'smoke_control', 'point', 'smoke-control'),
  ('TGBT', 'Tableau général basse tension', 'energy', 'point', 'energy-tgbt'),
  ('COUPURE_GAZ', 'Coupure gaz', 'energy', 'point', 'energy-gas-shutoff'),
  ('COUPURE_PV', 'Coupure photovoltaïque', 'energy', 'point', 'energy-pv-shutoff'),
  ('ASCENSEUR', 'Ascenseur', 'vertical', 'point', 'vertical-elevator'),
  ('CHAUFFERIE', 'Chaufferie', 'energy', 'polygon', 'energy-boiler-room'),
  ('LOCAL_BATTERIES', 'Local batteries', 'risk', 'polygon', 'risk-battery-room'),
  ('STOCKAGE_O2', 'Stockage oxygène', 'risk', 'point', 'risk-oxygen'),
  ('STOCKAGE_GPL', 'Stockage GPL', 'risk', 'point', 'risk-lpg'),
  ('ZONE_REFUGE', 'Zone refuge / de mise à l''abri', 'refuge', 'polygon', 'refuge-zone'),
  ('PC_SECURITE', 'PC sécurité', 'communication', 'point', 'communication-security-post'),
  ('ANNOTATION', 'Annotation', 'annotation', 'point', 'annotation-text');

insert into app.risk_type (code, name, default_severity, icon_key) values
  ('INFLAMMABLE', 'Inflammable', 4, 'risk-flammable'),
  ('EXPLOSIF', 'Explosif', 5, 'risk-explosive'),
  ('TOXIQUE', 'Toxique', 5, 'risk-toxic'),
  ('CORROSIF', 'Corrosif', 4, 'risk-corrosive'),
  ('COMBURANT', 'Comburant', 4, 'risk-oxidizing'),
  ('GAZ_SOUS_PRESSION', 'Gaz sous pression', 4, 'risk-pressurized-gas'),
  ('ELECTRIQUE_HT', 'Électrique haute tension', 5, 'risk-high-voltage'),
  ('LITHIUM_ION', 'Batteries lithium-ion', 4, 'risk-lithium'),
  ('PHOTOVOLTAIQUE', 'Photovoltaïque', 3, 'risk-photovoltaic'),
  ('RADIOACTIF', 'Radioactif', 5, 'risk-radioactive'),
  ('BIOLOGIQUE', 'Biologique', 5, 'risk-biological'),
  ('OXYGENE', 'Oxygène', 4, 'risk-oxygen'),
  ('STRUCTURE_FRAGILE', 'Structure fragile', 4, 'risk-fragile-structure'),
  ('PUBLIC_VULNERABLE', 'Public vulnérable', 5, 'risk-vulnerable-public'),
  ('PATRIMOINE_PRIORITAIRE', 'Patrimoine prioritaire', 3, 'risk-heritage');

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
