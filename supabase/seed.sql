-- =============================================================================
-- LOCAL DEVELOPMENT SEED — SYNTHETIC DATA ONLY.
--
-- Loaded by `supabase db reset` (local) and by the CI database job. Never run
-- against a shared environment: it sets local-only role passwords and creates
-- demo accounts with a public password. No real operational data here: every
-- site, address, person and phone number below is fictitious.
--
-- Demo accounts (password for all: Etare-Demo-2026!):
--   admin.sis06@demo.etare.test          SIS_ADMIN            SDIS DEMO 06
--   redacteur06@demo.etare.test          PREVISION_EDITOR     SDIS DEMO 06
--   validateur06@demo.etare.test         PREVISION_VALIDATOR  SDIS DEMO 06
--   ops06@demo.etare.test                OPS_USER             SDIS DEMO 06
--   exploitant.oliviers@demo.etare.test  EXPLOITANT (site: EHPAD Les Oliviers) SDIS DEMO 06
--   lecteur06@demo.etare.test            READER               SDIS DEMO 06
--   redacteur83@demo.etare.test          PREVISION_EDITOR     SDIS DEMO 83
--   multi.sis@demo.etare.test            READER @06 + PREVISION_EDITOR @83
--   plateforme@demo.etare.test           SUPER_ADMIN (platform, no business access)
-- =============================================================================

-- Local-only logins for the application roles (see .env.example).
alter role etare_api with login password 'etare_api_local_only';
alter role etare_worker with login password 'etare_worker_local_only';
-- Backup job (EXP-02): exercise of the backup and restore on the local stack (infra/backup/exercice.sh).
alter role etare_backup with login password 'etare_backup_local_only';

-- -----------------------------------------------------------------------------
-- Tenants
-- -----------------------------------------------------------------------------
insert into app.tenant (id, slug, name, settings) values
  ('06000000-0000-4000-8000-000000000000', 'sdis-demo-06', 'SDIS DEMO 06', '{"mfa_required_for_privileged": true}'),
  ('83000000-0000-4000-8000-000000000000', 'sdis-demo-83', 'SDIS DEMO 83', '{"mfa_required_for_privileged": true}');

-- -----------------------------------------------------------------------------
-- Supabase Auth accounts (auth schema) + product accounts (app schema).
-- -----------------------------------------------------------------------------
create temporary table seed_user (
  n int primary key,
  email text not null,
  display_name text not null,
  auth_id uuid not null,
  account_id uuid not null
);

insert into seed_user values
  (1, 'admin.sis06@demo.etare.test', 'Admin SIS 06 (démo)', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001'),
  (2, 'redacteur06@demo.etare.test', 'Rédacteur Prévision 06 (démo)', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-b000-000000000002'),
  (3, 'validateur06@demo.etare.test', 'Validateur Prévision 06 (démo)', '00000000-0000-4000-a000-000000000003', '00000000-0000-4000-b000-000000000003'),
  (4, 'ops06@demo.etare.test', 'Intervenant OPS 06 (démo)', '00000000-0000-4000-a000-000000000004', '00000000-0000-4000-b000-000000000004'),
  (5, 'exploitant.oliviers@demo.etare.test', 'Direction EHPAD (démo)', '00000000-0000-4000-a000-000000000005', '00000000-0000-4000-b000-000000000005'),
  (6, 'lecteur06@demo.etare.test', 'Lecteur 06 (démo)', '00000000-0000-4000-a000-000000000006', '00000000-0000-4000-b000-000000000006'),
  (7, 'redacteur83@demo.etare.test', 'Rédacteur Prévision 83 (démo)', '00000000-0000-4000-a000-000000000007', '00000000-0000-4000-b000-000000000007'),
  (8, 'multi.sis@demo.etare.test', 'Agent multi-SIS (démo)', '00000000-0000-4000-a000-000000000008', '00000000-0000-4000-b000-000000000008'),
  (9, 'plateforme@demo.etare.test', 'Exploitation plateforme (démo)', '00000000-0000-4000-a000-000000000009', '00000000-0000-4000-b000-000000000009');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', s.auth_id, 'authenticated', 'authenticated', s.email,
       extensions.crypt('Etare-Demo-2026!', extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(),
       '', '', '', ''
from seed_user s;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select s.auth_id::text, s.auth_id,
       jsonb_build_object('sub', s.auth_id::text, 'email', s.email, 'email_verified', true),
       'email', now(), now(), now()
from seed_user s;

insert into app.user_account (id, auth_provider, auth_subject, email, display_name)
select s.account_id, 'supabase', s.auth_id::text, s.email, s.display_name from seed_user s;

-- Memberships: (tenant, user n)
insert into app.membership (id, tenant_id, user_id)
select m.id::uuid, m.tenant_id::uuid, s.account_id
from (values
  ('0600000a-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', 1),
  ('0600000a-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', 2),
  ('0600000a-0000-4000-8000-000000000003', '06000000-0000-4000-8000-000000000000', 3),
  ('0600000a-0000-4000-8000-000000000004', '06000000-0000-4000-8000-000000000000', 4),
  ('0600000a-0000-4000-8000-000000000005', '06000000-0000-4000-8000-000000000000', 5),
  ('0600000a-0000-4000-8000-000000000006', '06000000-0000-4000-8000-000000000000', 6),
  ('0600000a-0000-4000-8000-000000000008', '06000000-0000-4000-8000-000000000000', 8),
  ('8300000a-0000-4000-8000-000000000007', '83000000-0000-4000-8000-000000000000', 7),
  ('8300000a-0000-4000-8000-000000000008', '83000000-0000-4000-8000-000000000000', 8)
) as m (id, tenant_id, n)
join seed_user s on s.n = m.n;

-- -----------------------------------------------------------------------------
-- Referential data of SDIS DEMO 06
-- -----------------------------------------------------------------------------
insert into app.address (id, tenant_id, label, street, postal_code, city, insee_code, geom) values
  ('06000001-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000',
   '12 avenue des Mimosas, 06000 Nice', '12 avenue des Mimosas', '06000', 'Nice', '06088',
   extensions.st_setsrid(extensions.st_makepoint(7.2518, 43.7079), 4326)),
  ('06000001-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000',
   '4 chemin des Lavandes, 06600 Antibes', '4 chemin des Lavandes', '06600', 'Antibes', '06004',
   extensions.st_setsrid(extensions.st_makepoint(7.1106, 43.5847), 4326));

insert into app.site (id, tenant_id, name, short_name, status, site_type, sensitivity, address_id, geom, footprint, etare_number, last_verified_at) values
  ('06000002-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000',
   'EHPAD Les Oliviers', 'Les Oliviers', 'active', 'health', 'normal', '06000001-0000-4000-8000-000000000001',
   extensions.st_setsrid(extensions.st_makepoint(7.2518, 43.7079), 4326),
   extensions.st_multi(extensions.st_geomfromtext('POLYGON((7.2512 43.7075, 7.2525 43.7075, 7.2525 43.7084, 7.2512 43.7084, 7.2512 43.7075))', 4326)),
   '06-0428', '2026-09-18T09:00:00Z'),
  ('06000002-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000',
   'Entrepôt logistique Démo Antibes', 'Entrepôt Démo', 'draft', 'industrial', 'restricted', '06000001-0000-4000-8000-000000000002',
   extensions.st_setsrid(extensions.st_makepoint(7.1106, 43.5847), 4326), null, null, null);

insert into app.building (id, tenant_id, site_id, name, code, sort_order, construction_type, height_m, floors_above, floors_below) values
  ('06000003-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'Bâtiment A', 'A', 1, 'Béton', 12.50, 3, 1),
  ('06000003-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'Bâtiment B', 'B', 2, 'Béton', 7.00, 1, 0);

insert into app.level (id, tenant_id, site_id, building_id, label, sort_order, elevation_m)
select l.id::uuid, '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', l.building::uuid, l.label, l.sort_order, l.elevation
from (values
  ('06000004-0000-4000-8000-000000000001', '06000003-0000-4000-8000-000000000001', 'R-1', -1, -3.00),
  ('06000004-0000-4000-8000-000000000002', '06000003-0000-4000-8000-000000000001', 'RDC', 0, 0.00),
  ('06000004-0000-4000-8000-000000000003', '06000003-0000-4000-8000-000000000001', 'R+1', 1, 3.00),
  ('06000004-0000-4000-8000-000000000004', '06000003-0000-4000-8000-000000000001', 'R+2', 2, 6.00),
  ('06000004-0000-4000-8000-000000000005', '06000003-0000-4000-8000-000000000001', 'R+3', 3, 9.00),
  ('06000004-0000-4000-8000-000000000006', '06000003-0000-4000-8000-000000000002', 'RDC', 0, 0.00),
  ('06000004-0000-4000-8000-000000000007', '06000003-0000-4000-8000-000000000002', 'R+1', 1, 3.50)
) as l (id, building, label, sort_order, elevation);

-- Plan background: synthetic drawing (scripts/generate-demo-plan.ts), uploaded to the storage key
-- by `pnpm seed:assets` (run by `pnpm db:reset` and `pnpm setup:local`). Seeded as already checked.
insert into app.asset (id, tenant_id, site_id, storage_key, filename, mime_type, size_bytes, sha256, scan_status, scan_detail, verified_at) values
  ('06000005-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000001/06000005-0000-4000-8000-0000000000a1',
   'plan-batiment-a-rdc-demo.png', 'image/png', 16642, '467df55eecc701442c1349b2107981bc9c9c8a01e0399cdcfd903a0e540c28d4',
   'clean', '{"detected_type": "image/png", "antivirus": "not_scanned", "engine": "seed"}', '2026-09-17T08:00:00Z');

insert into app.plan (id, tenant_id, site_id, building_id, level_id, plan_type, title) values
  ('06000006-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '06000003-0000-4000-8000-000000000001', '06000004-0000-4000-8000-000000000002', 'level', 'Bâtiment A - RDC');

insert into app.plan_revision (id, tenant_id, site_id, plan_id, revision_no, asset_id, width, height, local_unit) values
  ('06000007-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '06000006-0000-4000-8000-000000000001', 1, '06000005-0000-4000-8000-000000000001', 1600, 1000, 'pixel');

insert into app.zone (id, tenant_id, site_id, level_id, name, zone_type, plan_revision_id, local_geom) values
  ('06000008-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '06000004-0000-4000-8000-000000000002', 'Local technique façade C', 'technical', '06000007-0000-4000-8000-000000000001',
   extensions.st_geomfromtext('POLYGON((380 250, 460 250, 460 330, 380 330, 380 250))', 0)),
  ('06000008-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '06000004-0000-4000-8000-000000000002', 'Local pharmacie façade C', 'storage', '06000007-0000-4000-8000-000000000001',
   extensions.st_geomfromtext('POLYGON((480 250, 560 250, 560 330, 480 330, 480 250))', 0));

insert into app.operational_object (
  id, tenant_id, site_id, building_id, level_id, zone_id, object_type_id, name, label,
  geom, plan_revision_id, local_geom, properties, instructions, criticality, verified_at
)
select o.id::uuid, '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
       o.building::uuid, o.level::uuid, o.zone::uuid, t.id, o.name, o.label,
       case when o.lon is null then null else extensions.st_setsrid(extensions.st_makepoint(o.lon, o.lat), 4326) end,
       case when o.x is null then null else '06000007-0000-4000-8000-000000000001'::uuid end,
       case when o.x is null then null else extensions.st_makepoint(o.x, o.y) end,
       o.properties::jsonb, o.instructions, o.criticality, '2026-09-18T09:00:00Z'
from (values
  ('06000009-0000-4000-8000-000000000001', 'TGBT', 'TGBT principal', 'TGBT',
   '06000003-0000-4000-8000-000000000001', '06000004-0000-4000-8000-000000000002', '06000008-0000-4000-8000-000000000001',
   null::float8, null::float8, 412::float8, 288::float8, '{}',
   'Coupure générale du bâtiment A. Accès par porte métallique.', 'critical'),
  ('06000009-0000-4000-8000-000000000002', 'STOCKAGE_O2', 'Stockage O₂ médical', 'O₂',
   '06000003-0000-4000-8000-000000000001', '06000004-0000-4000-8000-000000000002', '06000008-0000-4000-8000-000000000002',
   null, null, 520, 290, '{"quantite": 18, "unite": "bouteilles"}',
   'Ventiler le local si fuite suspectée. Ne pas obstruer l''accès à la vanne de coupure.', 'critical'),
  ('06000009-0000-4000-8000-000000000003', 'PORTAIL', 'Portail principal avenue des Mimosas', 'P1',
   null, null, null, 7.2514, 43.7076, null, null, '{"ouverture": "code (voir fiche accès)"}',
   'Accès principal des engins.', 'important'),
  ('06000009-0000-4000-8000-000000000004', 'PEI', 'PEI principal', 'PEI 1',
   null, null, null, 7.2509, 43.7074, null, null, '{"numero": "NIC-0428-1", "nature": "poteau", "debit_m3h": 120, "pression_bar": 3.5}',
   null, 'important'),
  ('06000009-0000-4000-8000-000000000005', 'COUPURE_PV', 'Coupure photovoltaïque toiture B', 'PV',
   '06000003-0000-4000-8000-000000000002', null, null, 7.2522, 43.7081, null, null, '{}',
   'Coupure au pied du bâtiment B, façade nord.', 'important')
) as o (id, type_code, name, label, building, level, zone, lon, lat, x, y, properties, instructions, criticality)
join app.object_type t on t.code = o.type_code and t.tenant_id is null;

insert into app.risk_occurrence (id, tenant_id, site_id, building_id, level_id, object_id, risk_type_id, severity, description, quantity, unit)
select r.id::uuid, '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
       r.building::uuid, r.level::uuid, r.object::uuid, t.id, r.severity, r.description, r.quantity, r.unit
from (values
  ('0600000b-0000-4000-8000-000000000001', 'OXYGENE', '06000003-0000-4000-8000-000000000001', '06000004-0000-4000-8000-000000000002',
   '06000009-0000-4000-8000-000000000002', 4, 'Oxygène médical - local RDC façade C', 18::numeric, 'bouteilles'),
  ('0600000b-0000-4000-8000-000000000002', 'PUBLIC_VULNERABLE', null, null, null, 5,
   'Public non autonome (86 résidents) - évacuation horizontale', null, null),
  ('0600000b-0000-4000-8000-000000000003', 'PHOTOVOLTAIQUE', '06000003-0000-4000-8000-000000000002', null,
   '06000009-0000-4000-8000-000000000005', 3, 'Photovoltaïque en toiture du bâtiment B', null, null)
) as r (id, type_code, building, level, object, severity, description, quantity, unit)
join app.risk_type t on t.code = r.type_code and t.tenant_id is null;

-- Hazardous substances (RISK-03): the oxygen store and the heating fuel of the EHPAD, no sheet yet.
insert into app.hazardous_substance (id, tenant_id, site_id, building_id, level_id, name, hazard_classes, un_number, physical_state, quantity, unit, location_note)
values
  ('0600000c-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '06000003-0000-4000-8000-000000000001', '06000004-0000-4000-8000-000000000002', 'Oxygène médical (bouteilles B50)',
   '{GHS03,GHS04}', '1072', 'gas', 18, 'bouteilles', 'Local oxygène, RDC façade C'),
  ('0600000c-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   null, null, 'Fioul domestique', '{GHS02,GHS07,GHS08,GHS09}', '1202', 'liquid', 2000, 'L', 'Cuve enterrée, parking nord');

-- Classifications and contacts (phone numbers from the ranges ARCEP reserves for fiction).
insert into app.site_classification (tenant_id, site_id, classification_type, code, category, label, valid_from, source) values
  ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'ERP', 'J', '3', 'Établissement médico-social, locaux à sommeil', '2019-06-01', 'Commission de sécurité (démo)');

insert into app.contact (tenant_id, site_id, name, role, phone, availability, visibility, sort_order, verified_at) values
  ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'PC sécurité (démo)', 'Accueil de nuit', '01 99 00 12 34', '24/7', 'ops', 1, '2026-09-18T09:00:00Z'),
  ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'Astreinte technique (démo)', 'Maintenance', '06 39 98 12 34', '24/7', 'ops', 2, '2026-09-18T09:00:00Z'),
  ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'Direction de l''établissement (démo)', 'Directrice', '01 99 00 56 78', 'Heures ouvrées', 'prevision', 3, null);

-- -----------------------------------------------------------------------------
-- Referential data of SDIS DEMO 83 (must never be visible from SDIS DEMO 06)
-- -----------------------------------------------------------------------------
insert into app.address (id, tenant_id, label, street, postal_code, city, insee_code, geom) values
  ('83000001-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000000',
   '8 rue des Pins, 83000 Toulon', '8 rue des Pins', '83000', 'Toulon', '83137',
   extensions.st_setsrid(extensions.st_makepoint(5.9304, 43.1242), 4326));

insert into app.site (id, tenant_id, name, status, site_type, address_id, geom, etare_number) values
  ('83000002-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000000',
   'Résidence Les Pins (démo 83)', 'active', 'health', '83000001-0000-4000-8000-000000000001',
   extensions.st_setsrid(extensions.st_makepoint(5.9304, 43.1242), 4326), '83-0107'),
  ('83000002-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000000',
   'Plateforme industrielle Démo Var', 'draft', 'industrial', null,
   extensions.st_setsrid(extensions.st_makepoint(5.8870, 43.1030), 4326), null);

insert into app.building (id, tenant_id, site_id, name, code, sort_order) values
  ('83000003-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000000', '83000002-0000-4000-8000-000000000001',
   'Bâtiment principal', 'P', 1);

-- -----------------------------------------------------------------------------
-- Role bindings (after the sites: the exploitant is scoped to one site)
-- -----------------------------------------------------------------------------
insert into app.role_binding (tenant_id, membership_id, role_id, scope_type, scope_id)
select b.tenant_id::uuid, b.membership_id::uuid, r.id, b.scope_type, b.scope_id::uuid
from (values
  ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000001', 'SIS_ADMIN', 'tenant', null),
  ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000002', 'PREVISION_EDITOR', 'tenant', null),
  ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000003', 'PREVISION_VALIDATOR', 'tenant', null),
  ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000004', 'OPS_USER', 'tenant', null),
  ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000005', 'EXPLOITANT', 'site', '06000002-0000-4000-8000-000000000001'),
  ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000006', 'READER', 'tenant', null),
  ('06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000008', 'READER', 'tenant', null),
  ('83000000-0000-4000-8000-000000000000', '8300000a-0000-4000-8000-000000000007', 'PREVISION_EDITOR', 'tenant', null),
  ('83000000-0000-4000-8000-000000000000', '8300000a-0000-4000-8000-000000000008', 'PREVISION_EDITOR', 'tenant', null)
) as b (tenant_id, membership_id, role_code, scope_type, scope_id)
join app.role r on r.code = b.role_code and r.tenant_id is null;

-- -----------------------------------------------------------------------------
-- Sectors of SDIS DEMO 06 (PER-01): groups of sites by commune, used for the
-- perimeters of terminals and members (nobody is limited in the seed).
-- -----------------------------------------------------------------------------
insert into app.sector (id, tenant_id, name, code, description) values
  ('0600001a-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', 'CIS Nice Centre', 'NICE-C',
   'Premier appel du centre de Nice (démo).'),
  ('0600001a-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', 'CIS Antibes', 'ANTIBES',
   'Premier appel d''Antibes (démo).');
insert into app.sector_commune (tenant_id, sector_id, insee_code, label) values
  ('06000000-0000-4000-8000-000000000000', '0600001a-0000-4000-8000-000000000001', '06088', 'Nice'),
  ('06000000-0000-4000-8000-000000000000', '0600001a-0000-4000-8000-000000000002', '06004', 'Antibes');

insert into app.platform_admin (user_id, reason)
values ('00000000-0000-4000-b000-000000000009', 'Compte de démonstration de l''exploitation plateforme (local).');

-- -----------------------------------------------------------------------------
-- ETARE 06-0428: revision 1 written by the editor, approved by a distinct
-- validator, published as publication #1; revision 2 open as a draft.
-- -----------------------------------------------------------------------------
insert into app.etare (id, tenant_id, site_id, created_by) values
  ('0600000c-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000',
   '06000002-0000-4000-8000-000000000001', '00000000-0000-4000-b000-000000000002');

insert into app.etare_revision (id, tenant_id, site_id, etare_id, revision_no, created_by, change_summary) values
  ('0600000d-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '0600000c-0000-4000-8000-000000000001', 1, '00000000-0000-4000-b000-000000000002', 'Création initiale du dossier (démo).');

insert into app.etare_revision_contributor (tenant_id, site_id, revision_id, user_id) values
  ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '0600000d-0000-4000-8000-000000000001', '00000000-0000-4000-b000-000000000002');

-- Frozen snapshot (the application will build the canonical form; this is a simplified demo payload).
with snapshot as (
  select jsonb_build_object(
    'schema_version', 1,
    'site', (select jsonb_build_object('id', s.id, 'name', s.name, 'etare_number', s.etare_number, 'site_type', s.site_type)
             from app.site s where s.id = '06000002-0000-4000-8000-000000000001'),
    'objects', (select jsonb_agg(jsonb_build_object('id', o.id, 'type', t.code, 'name', o.name, 'criticality', o.criticality) order by o.id)
                from app.operational_object o join app.object_type t on t.id = o.object_type_id
                where o.site_id = '06000002-0000-4000-8000-000000000001'),
    'risks', (select jsonb_agg(jsonb_build_object('id', r.id, 'type', t.code, 'severity', r.severity) order by r.id)
              from app.risk_occurrence r join app.risk_type t on t.id = r.risk_type_id
              where r.site_id = '06000002-0000-4000-8000-000000000001')
  ) as body
)
update app.etare_revision
set status = 'submitted',
    snapshot = snapshot.body,
    content_hash = encode(extensions.digest(snapshot.body::text, 'sha256'), 'hex'),
    submitted_by = '00000000-0000-4000-b000-000000000002',
    submitted_at = '2026-09-17T08:00:00Z'
from snapshot
where id = '0600000d-0000-4000-8000-000000000001';

insert into app.approval (id, tenant_id, site_id, revision_id, revision_hash, decision, actor_id, comment)
select '0600000e-0000-4000-8000-000000000001', tenant_id, site_id, id, content_hash, 'approved',
       '00000000-0000-4000-b000-000000000003', 'Dossier conforme (démo).'
from app.etare_revision where id = '0600000d-0000-4000-8000-000000000001';

update app.etare_revision set status = 'approved', decided_at = '2026-09-18T09:00:00Z'
where id = '0600000d-0000-4000-8000-000000000001';

insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by) values
  ('0600000f-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '0600000c-0000-4000-8000-000000000001', '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000001',
   '00000000-0000-4000-b000-000000000003');

update app.publication set status = 'building' where id = '0600000f-0000-4000-8000-000000000001';

update app.publication p
set status = 'ready',
    payload = r.snapshot,
    manifest = jsonb_build_object(
      'manifest_version', 1, 'publication_number', p.publication_number, 'revision_id', r.id,
      'files', jsonb_build_array(jsonb_build_object('path', 'data/site.json',
        'sha256', encode(extensions.digest(r.snapshot::text, 'sha256'), 'hex'), 'required', true))),
    manifest_hash = encode(extensions.digest(r.snapshot::text || p.publication_number::text, 'sha256'), 'hex'),
    ready_at = '2026-09-18T09:05:00Z'
from app.etare_revision r
where p.id = '0600000f-0000-4000-8000-000000000001' and r.id = p.revision_id;

update app.publication
set status = 'published', published_by = '00000000-0000-4000-b000-000000000003', published_at = '2026-09-18T09:06:00Z'
where id = '0600000f-0000-4000-8000-000000000001';

insert into app.etare_revision (id, tenant_id, site_id, etare_id, revision_no, created_by, base_publication_id, change_summary) values
  ('0600000d-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   '0600000c-0000-4000-8000-000000000001', 2, '00000000-0000-4000-b000-000000000002',
   '0600000f-0000-4000-8000-000000000001', 'Mise à jour du stockage O₂ (brouillon démo).');

drop table seed_user;
