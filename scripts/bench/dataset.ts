/**
 * Synthetic bench data of CAP-01 (two fictitious SIS, local stack only): sites with
 * addresses, buildings, levels, a plan, zones, objects, risks, contacts, sectors,
 * published and signed versions, members (tenant-wide and limited to a sector),
 * terminals with what they hold, receipts and a long job history. Everything is
 * inserted by the migration identity in set-based statements, row triggers on
 * (audit journal, placement, publication guards), as the application would leave it.
 */

export interface BenchTenant {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly department: string;
  readonly sites: number;
  readonly devices: number;
  readonly center: readonly [number, number];
  /** INSEE code, commune, postal code: one sector per commune. */
  readonly communes: readonly (readonly [string, string, string])[];
  /** Accounts of the bench, by role key (`admin`, `editor`...), with their scope. */
  readonly users: readonly BenchUser[];
}

export interface BenchUser {
  readonly key: string;
  readonly email: string;
  readonly role: 'SIS_ADMIN' | 'PREVISION_EDITOR' | 'PREVISION_VALIDATOR' | 'OPS_USER';
  /** Limited to the first sector of the SIS (perimeter of the RLS), or the whole SIS. */
  readonly scope: 'tenant' | 'sector';
  readonly authId: string;
  readonly accountId: string;
}

const user = (tenant: 'a' | 'b', n: number, key: string, role: BenchUser['role'], scope: BenchUser['scope']) => ({
  key,
  email: `${key}.banc-${tenant}@bench.etare.test`,
  role,
  scope,
  authId: `beac0000-0000-4000-a${tenant === 'a' ? '00a' : '00b'}-${String(n).padStart(12, '0')}`,
  accountId: `beac0000-0000-4000-b${tenant === 'a' ? '00a' : '00b'}-${String(n).padStart(12, '0')}`,
});

/** The two SIS of the bench: 80 % and 20 % of the sites (architecture §31: at least two SIS). */
export function benchTenants(totalSites: number): BenchTenant[] {
  const a = Math.round(totalSites * 0.8);
  return [
    {
      id: 'beac0000-0000-4000-8000-00000000000a',
      slug: 'sdis-banc-a',
      name: 'SDIS BANC A (fictif)',
      department: '06',
      sites: a,
      devices: Math.max(10, Math.round(a / 20)),
      center: [7.1, 43.7],
      communes: [
        ['06088', 'Nice', '06000'],
        ['06004', 'Antibes', '06600'],
        ['06029', 'Cannes', '06400'],
        ['06069', 'Grasse', '06130'],
        ['06083', 'Menton', '06500'],
        ['06027', 'Cagnes-sur-Mer', '06800'],
        ['06123', 'Saint-Laurent-du-Var', '06700'],
        ['06085', 'Mougins', '06250'],
        ['06155', 'Vallauris', '06220'],
        ['06157', 'Vence', '06140'],
        ['06079', 'Mandelieu-la-Napoule', '06210'],
        ['06030', 'Le Cannet', '06110'],
        ['06152', 'Valbonne', '06560'],
        ['06033', 'Carros', '06510'],
        ['06104', 'Roquebrune-Cap-Martin', '06190'],
        ['06090', 'Pégomas', '06580'],
      ],
      users: [
        user('a', 1, 'admin', 'SIS_ADMIN', 'tenant'),
        user('a', 2, 'redacteur', 'PREVISION_EDITOR', 'tenant'),
        user('a', 3, 'validateur', 'PREVISION_VALIDATOR', 'tenant'),
        user('a', 4, 'ops', 'OPS_USER', 'tenant'),
        user('a', 5, 'redacteur-secteur', 'PREVISION_EDITOR', 'sector'),
        user('a', 6, 'ops-secteur', 'OPS_USER', 'sector'),
      ],
    },
    {
      id: 'beac0000-0000-4000-8000-00000000000b',
      slug: 'sdis-banc-b',
      name: 'SDIS BANC B (fictif)',
      department: '83',
      sites: totalSites - a,
      devices: Math.max(5, Math.round((totalSites - a) / 20)),
      center: [6.1, 43.25],
      communes: [
        ['83137', 'Toulon', '83000'],
        ['83069', 'Hyères', '83400'],
        ['83050', 'Draguignan', '83300'],
        ['83061', 'Fréjus', '83600'],
      ],
      users: [
        user('b', 1, 'admin', 'SIS_ADMIN', 'tenant'),
        user('b', 2, 'redacteur', 'PREVISION_EDITOR', 'tenant'),
        user('b', 3, 'validateur', 'PREVISION_VALIDATOR', 'tenant'),
        user('b', 4, 'ops', 'OPS_USER', 'tenant'),
      ],
    },
  ];
}

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** SQL creating one bench SIS (one transaction; numbers and identifiers come from benchTenants only). */
export function tenantSql(tenant: BenchTenant, password: string): string {
  const t = quote(tenant.id);
  const communes = tenant.communes
    .map(([insee, city, postal], index) => `(${index + 1}, ${quote(insee)}, ${quote(city)}, ${quote(postal)})`)
    .join(',\n    ');
  const users = tenant.users
    .map(
      (u) =>
        `(${quote(u.key)}, ${quote(u.email)}, ${quote(u.role)}, ${quote(u.scope)}, ${quote(u.authId)}::uuid, ${quote(u.accountId)}::uuid)`,
    )
    .join(',\n    ');
  const [lon, lat] = tenant.center;
  return `
-- ---------------------------------------------------------------- SIS, accounts
insert into app.tenant (id, slug, name, settings)
values (${t}, ${quote(tenant.slug)}, ${quote(tenant.name)}, '{"mfa_required_for_privileged": true}');

create temporary table bench_user (key text, email text, role text, scope text, auth_id uuid, account_id uuid) on commit drop;
insert into bench_user values
    ${users};

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.auth_id, 'authenticated', 'authenticated', u.email,
       extensions.crypt(${quote(password)}, extensions.gen_salt('bf')), now(),
       '{"provider": "email", "providers": ["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
from bench_user u;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.auth_id::text, u.auth_id, jsonb_build_object('sub', u.auth_id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from bench_user u;
insert into app.user_account (id, auth_provider, auth_subject, email, display_name)
select u.account_id, 'supabase', u.auth_id::text, u.email, initcap(replace(u.key, '-', ' ')) || ' (banc)' from bench_user u;
insert into app.membership (tenant_id, user_id) select ${t}, u.account_id from bench_user u;

-- ---------------------------------------------------------------- communes and sectors
create temporary table bench_commune (k int, insee text, city text, postal text, sector_id uuid default gen_random_uuid()) on commit drop;
insert into bench_commune (k, insee, city, postal) values
    ${communes};
insert into app.sector (id, tenant_id, name, code, description)
select c.sector_id, ${t}, 'CIS ' || c.city, 'S' || lpad(c.k::text, 2, '0'), 'Secteur du banc de volumétrie.'
from bench_commune c;
insert into app.sector_commune (tenant_id, sector_id, insee_code, label)
select ${t}, c.sector_id, c.insee, c.city from bench_commune c;

insert into app.role_binding (tenant_id, membership_id, role_id, scope_type, scope_id)
select ${t}, m.id, r.id, u.scope, case when u.scope = 'sector' then (select sector_id from bench_commune where k = 1) end
from bench_user u
join app.membership m on m.tenant_id = ${t} and m.user_id = u.account_id
join app.role r on r.code = u.role and r.tenant_id is null;

-- ---------------------------------------------------------------- sites
create temporary table bench_site on commit drop as
select n,
       gen_random_uuid() as site_id,
       gen_random_uuid() as address_id,
       gen_random_uuid() as asset_id,
       gen_random_uuid() as plan_id,
       gen_random_uuid() as revision_id,
       1 + (n % (select count(*) from bench_commune))::int as commune,
       (array['EHPAD', 'Collège', 'Entrepôt', 'Centre commercial', 'Hôtel', 'Usine', 'Musée', 'Clinique', 'Lycée', 'Gymnase'])[1 + n % 10] as kind,
       (array['des Lavandes', 'du Port', 'Saint-Michel', 'des Oliviers', 'Pasteur', 'Jean Moulin', 'du Parc', 'de la Gare',
              'Victor Hugo', 'des Pins', 'Bellevue', 'du Château'])[1 + (n / 10) % 12] as label,
       case when n % 50 = 0 then 'high' when n % 12 = 0 then 'restricted' else 'normal' end as sensitivity,
       (n % 10) < 6 as published
from generate_series(1, ${tenant.sites}) n;
create index on bench_site (n);

insert into app.address (id, tenant_id, label, street, postal_code, city, insee_code, geom)
select s.address_id, ${t},
       (s.n % 180 + 1) || ' rue ' || s.label || ', ' || c.postal || ' ' || c.city,
       (s.n % 180 + 1) || ' rue ' || s.label, c.postal, c.city, c.insee,
       extensions.st_setsrid(extensions.st_makepoint(
         ${lon} + (c.k % 4) * 0.12 + ((s.n * 7919) % 1000) / 12000.0,
         ${lat} + (c.k / 4) * 0.08 + ((s.n * 104729) % 1000) / 16000.0), 4326)
from bench_site s join bench_commune c on c.k = s.commune;

insert into app.site (id, tenant_id, name, short_name, status, site_type, sensitivity, address_id, geom, etare_number, last_verified_at)
select s.site_id, ${t}, s.kind || ' ' || s.label || ' ' || s.n, left(s.kind || ' ' || s.n, 80),
       case when s.n % 40 = 0 then 'draft' else 'active' end,
       case s.kind when 'EHPAD' then 'health' when 'Clinique' then 'health' when 'Collège' then 'education'
                   when 'Lycée' then 'education' when 'Usine' then 'industrial' when 'Entrepôt' then 'industrial'
                   when 'Musée' then 'heritage' else 'erp' end,
       s.sensitivity, s.address_id, a.geom, ${quote(tenant.department)} || '-' || lpad(s.n::text, 5, '0'),
       now() - make_interval(days => (s.n % 700))
from bench_site s join app.address a on a.id = s.address_id;

-- Two buildings, three levels each.
create temporary table bench_building on commit drop as
select s.site_id, b, gen_random_uuid() as building_id from bench_site s cross join generate_series(1, 2) b;
insert into app.building (id, tenant_id, site_id, name, code, sort_order, construction_type, height_m, floors_above, floors_below)
select b.building_id, ${t}, b.site_id, 'Bâtiment ' || chr(64 + b.b), chr(64 + b.b), b.b, 'Béton', 9.5, 2, 0
from bench_building b;
create temporary table bench_level on commit drop as
select b.site_id, b.b, b.building_id, l, gen_random_uuid() as level_id
from bench_building b cross join generate_series(0, 2) l;
insert into app.level (id, tenant_id, site_id, building_id, label, sort_order, elevation_m)
select l.level_id, ${t}, l.site_id, l.building_id, case l.l when 0 then 'RDC' else 'R+' || l.l end, l.l, l.l * 3.0
from bench_level l;

-- A plan of the ground floor of building A, its background checked (bytes not stored: never downloaded here).
insert into app.asset (id, tenant_id, site_id, storage_key, filename, mime_type, size_bytes, sha256, scan_status, scan_detail, verified_at)
select s.asset_id, ${t}, s.site_id, 'tenants/' || ${t} || '/assets/' || s.asset_id || '/' || s.asset_id,
       'plan-rdc.png', 'image/png', 180000 + s.n % 50000, encode(extensions.digest(s.asset_id::text, 'sha256'), 'hex'),
       'clean', '{"engine": "bench"}', now()
from bench_site s;
insert into app.plan (id, tenant_id, site_id, building_id, level_id, plan_type, title)
select s.plan_id, ${t}, s.site_id, l.building_id, l.level_id, 'level', 'Bâtiment A - RDC'
from bench_site s join bench_level l on l.site_id = s.site_id and l.b = 1 and l.l = 0;
insert into app.plan_revision (id, tenant_id, site_id, plan_id, revision_no, asset_id, width, height, local_unit)
select s.revision_id, ${t}, s.site_id, s.plan_id, 1, s.asset_id, 1600, 1000, 'pixel' from bench_site s;

insert into app.zone (tenant_id, site_id, level_id, name, zone_type, plan_revision_id, local_geom)
select ${t}, s.site_id, l.level_id, 'Zone ' || z, case z when 1 then 'technical' else 'storage' end, s.revision_id,
       extensions.st_geomfromtext(format('POLYGON((%s 200, %s 200, %s 320, %s 320, %s 200))',
         z * 300, z * 300 + 200, z * 300 + 200, z * 300, z * 300), 0)
from bench_site s join bench_level l on l.site_id = s.site_id and l.b = 1 and l.l = 0
cross join generate_series(1, 2) z;

-- 25 objects per site: 15 on the plan, 10 located outside.
insert into app.operational_object (tenant_id, site_id, building_id, level_id, object_type_id, name, label,
  geom, plan_revision_id, local_geom, properties, instructions, criticality, verified_at)
select ${t}, s.site_id,
       case when j <= 15 then l.building_id end, case when j <= 15 then l.level_id end,
       ot.id, ot.name || ' ' || j, left(ot.code, 6) || j,
       case when j > 15 then extensions.st_setsrid(extensions.st_makepoint(
         extensions.st_x(a.geom) + (j - 20) * 0.0001, extensions.st_y(a.geom) + (j % 3) * 0.0001), 4326) end,
       case when j <= 15 then s.revision_id end,
       case when j <= 15 then extensions.st_makepoint(80 + j * 90, 100 + (j % 5) * 170) end,
       jsonb_build_object('repere', j, 'observations', 'Objet de banc ' || j),
       case when j % 3 = 0 then 'Consigne de banc : accès par la façade ' || chr(65 + j % 4) || '.' end,
       (array['critical', 'important', 'info'])[1 + j % 3], now() - make_interval(days => j)
from bench_site s
join app.address a on a.id = s.address_id
join bench_level l on l.site_id = s.site_id and l.b = 1 and l.l = 0
cross join generate_series(1, 25) j
join lateral (select o.id, o.code, o.name from app.object_type o where o.tenant_id is null and o.geometry_kind = 'point'
              order by o.code
              offset (j % (select count(*) from app.object_type where tenant_id is null and geometry_kind = 'point'))
              limit 1) ot on true;

-- Five risks per site.
insert into app.risk_occurrence (tenant_id, site_id, risk_type_id, severity, description)
select ${t}, s.site_id, rt.id, 1 + (s.n + j) % 5, 'Risque de banc ' || j
from bench_site s cross join generate_series(1, 5) j
join lateral (select r.id from app.risk_type r where r.tenant_id is null
              order by r.code offset ((s.n + j) % (select count(*) from app.risk_type where tenant_id is null)) limit 1) rt on true;

insert into app.site_classification (tenant_id, site_id, classification_type, code, category, label, valid_from, source)
select ${t}, s.site_id, 'ERP', (array['J', 'R', 'M', 'L', 'O'])[1 + s.n % 5], (1 + s.n % 5)::text, 'Classement de banc', '2020-01-01', 'Banc'
from bench_site s;
insert into app.contact (tenant_id, site_id, name, role, phone, availability, visibility, sort_order)
select ${t}, s.site_id, 'Contact ' || c || ' (banc)', 'Rôle ' || c, '01 99 00 ' || lpad((s.n % 100)::text, 2, '0') || ' ' || lpad(c::text, 2, '0'),
       '24/7', case when c = 3 then 'prevision' else 'ops' end, c
from bench_site s cross join generate_series(1, 3) c;

-- ---------------------------------------------------------------- dossiers, published versions
create temporary table bench_dossier on commit drop as
select s.site_id, s.n, s.published, gen_random_uuid() as etare_id, gen_random_uuid() as revision_id,
       gen_random_uuid() as approval_id, gen_random_uuid() as publication_id
from bench_site s;
insert into app.etare (id, tenant_id, site_id, created_by)
select d.etare_id, ${t}, d.site_id, (select account_id from bench_user where key = 'redacteur') from bench_dossier d;
insert into app.etare_revision (id, tenant_id, site_id, etare_id, revision_no, created_by, change_summary)
select d.revision_id, ${t}, d.site_id, d.etare_id, 1, (select account_id from bench_user where key = 'redacteur'), 'Création (banc)'
from bench_dossier d where d.published;
insert into app.etare_revision_contributor (tenant_id, site_id, revision_id, user_id)
select ${t}, d.site_id, d.revision_id, (select account_id from bench_user where key = 'redacteur')
from bench_dossier d where d.published;

update app.etare_revision r
set status = 'submitted', snapshot = x.body, content_hash = encode(extensions.digest(x.body::text, 'sha256'), 'hex'),
    submitted_by = (select account_id from bench_user where key = 'redacteur'), submitted_at = now() - interval '2 days'
from (
  select d.revision_id, jsonb_build_object(
    'schema_version', 1,
    'site', jsonb_build_object('id', st.id, 'name', st.name, 'etare_number', st.etare_number, 'site_type', st.site_type),
    'objects', (select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'label', o.label, 'criticality', o.criticality,
                                                    'properties', o.properties, 'instructions', o.instructions))
                from app.operational_object o where o.site_id = d.site_id),
    'risks', (select jsonb_agg(jsonb_build_object('id', r.id, 'severity', r.severity, 'description', r.description))
              from app.risk_occurrence r where r.site_id = d.site_id),
    'contacts', (select jsonb_agg(jsonb_build_object('name', c.name, 'phone', c.phone)) from app.contact c where c.site_id = d.site_id)
  ) as body
  from bench_dossier d join app.site st on st.id = d.site_id
  where d.published
) x
where r.id = x.revision_id;

insert into app.approval (id, tenant_id, site_id, revision_id, revision_hash, decision, actor_id, comment)
select d.approval_id, ${t}, d.site_id, d.revision_id, r.content_hash, 'approved',
       (select account_id from bench_user where key = 'validateur'), 'Conforme (banc)'
from bench_dossier d join app.etare_revision r on r.id = d.revision_id where d.published;
update app.etare_revision r set status = 'approved', decided_at = now() - interval '1 day'
from bench_dossier d where r.id = d.revision_id and d.published;

insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by, requested_at)
select d.publication_id, ${t}, d.site_id, d.etare_id, d.revision_id, d.approval_id,
       (select account_id from bench_user where key = 'validateur'), now() - interval '1 day'
from bench_dossier d where d.published;
update app.publication p set status = 'building' from bench_dossier d where p.id = d.publication_id and d.published;
update app.publication p
set status = 'ready',
    payload = jsonb_build_object('publication', jsonb_build_object('id', p.id, 'publication_number', 1), 'data', r.snapshot),
    manifest = jsonb_build_object(
      'manifest_version', 1, 'tenant_id', p.tenant_id, 'publication_id', p.id, 'site_id', p.site_id,
      'publication_number', 1, 'revision_id', r.id, 'content_hash', r.content_hash, 'data_file', 'data/site.json',
      'files', jsonb_build_array(
        jsonb_build_object('path', 'data/site.json', 'sha256', encode(extensions.digest(r.snapshot::text, 'sha256'), 'hex'),
                           'size_bytes', length(r.snapshot::text), 'media_type', 'application/json', 'required', true),
        jsonb_build_object('path', 'plans/rdc.png', 'sha256', a.sha256, 'size_bytes', a.size_bytes,
                           'media_type', 'image/png', 'required', true),
        jsonb_build_object('path', 'etare.pdf', 'sha256', encode(extensions.digest(p.id::text || 'pdf', 'sha256'), 'hex'),
                           'size_bytes', 350000, 'media_type', 'application/pdf', 'required', true))),
    manifest_hash = encode(extensions.digest(p.id::text || 'manifest', 'sha256'), 'hex'),
    manifest_signature = jsonb_build_object('algorithm', 'Ed25519', 'key_id', 'ed25519-banc000000000000',
                                            'signature', replace(encode(extensions.digest(p.id::text, 'sha512'), 'base64'), E'\\n', '')),
    ready_at = now() - interval '23 hours'
from bench_dossier d
join app.etare_revision r on r.id = d.revision_id
join bench_site s on s.site_id = d.site_id
join app.asset a on a.id = s.asset_id
where p.id = d.publication_id and d.published;
update app.publication p
set status = 'published', published_by = (select account_id from bench_user where key = 'validateur'),
    published_at = now() - interval '23 hours'
from bench_dossier d where p.id = d.publication_id and d.published;

-- A draft being written on one dossier in ten.
insert into app.etare_revision (tenant_id, site_id, etare_id, revision_no, created_by, base_publication_id, change_summary)
select ${t}, d.site_id, d.etare_id, case when d.published then 2 else 1 end,
       (select account_id from bench_user where key = 'redacteur'),
       case when d.published then d.publication_id end, 'Mise à jour (banc)'
from bench_dossier d where d.n % 10 = 9;

-- ---------------------------------------------------------------- terminals
create temporary table bench_device on commit drop as
select n, gen_random_uuid() as device_id, case when n % 20 = 0 then null else 1 + n % (select count(*) from bench_commune) end as commune
from generate_series(1, ${tenant.devices}) n;
insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by, scope)
select d.device_id, ${t}, 'TABLETTE BANC ' || lpad(d.n::text, 4, '0'), 'active', 'android',
       encode(extensions.gen_random_bytes(32), 'base64'), now() - interval '30 days',
       (select account_id from bench_user where key = 'ops'), (select account_id from bench_user where key = 'admin'),
       case when d.commune is null then 'tenant' else 'sectors' end
from bench_device d;
insert into app.device_sector (tenant_id, device_id, sector_id)
select ${t}, d.device_id, c.sector_id from bench_device d join bench_commune c on c.k = d.commune;

insert into app.device_publication (device_id, tenant_id, site_id, publication_id)
select d.device_id, ${t}, p.site_id, p.id
from bench_device d
join app.publication p on p.tenant_id = ${t} and p.status = 'published' and p.sensitivity = 'normal'
join bench_site s on s.site_id = p.site_id
where d.commune is null or d.commune = s.commune;

insert into app.device_sync_state (device_id, tenant_id, last_user_id, last_seen_at, last_sync_at, last_status, last_error_code,
                                   catalog_generation, installed_generation, app_version, keyset_sequence)
select d.device_id, ${t}, (select account_id from bench_user where key = 'ops'),
       now() - make_interval(hours => d.n % 48), now() - make_interval(hours => (d.n % 10) * 20),
       case when d.n % 15 = 0 then 'error' when d.n % 7 = 0 then 'partial' else 'installed' end,
       case when d.n % 15 = 0 then 'NETWORK_INTERRUPTED' when d.n % 7 = 0 then 'DOWNLOAD_DEFERRED' end,
       g.generation, case when d.n % 5 = 0 then g.generation - 1 else g.generation end, '0.4.0', 1
from bench_device d cross join (select coalesce(max(generation), 1) as generation from app.distribution_generation
                                where tenant_id = ${t}) g;
insert into app.device_sync_event (tenant_id, device_id, occurred_at, status, error_code, generation, keyset_sequence)
select ${t}, d.device_id, now() - make_interval(hours => e * 12 + d.n % 12),
       case when (d.n + e) % 40 = 0 then 'error' when (d.n + e) % 9 = 0 then 'partial' else 'installed' end,
       case when (d.n + e) % 40 = 0 then 'NETWORK_INTERRUPTED' when (d.n + e) % 9 = 0 then 'DOWNLOAD_DEFERRED' end, 1, 1
from bench_device d cross join generate_series(0, 59) e;
`;
}

/** A finished job history (the queue is never empty of it in production). */
export function jobHistorySql(jobs: number): string {
  return `
insert into app.job (tenant_id, job_type, payload, status, attempts, created_at, started_at, first_started_at, completed_at, updated_at)
select null, 'system.noop', jsonb_build_object('bench', true, 'n', n), 'succeeded', 1,
       now() - make_interval(mins => n % 36000), now() - make_interval(mins => n % 36000) + interval '1 second',
       now() - make_interval(mins => n % 36000) + interval '1 second', now() - make_interval(mins => n % 36000) + interval '2 seconds',
       now() - make_interval(mins => n % 36000) + interval '2 seconds'
from generate_series(1, ${jobs}) n;
`;
}

/** Removes every row of the bench SIS (superuser, triggers off: the guards forbid deletions). */
export function cleanupSql(tenantIds: readonly string[], authIds: readonly string[]): string {
  const tenants = tenantIds.map(quote).join(', ');
  const users = authIds.map(quote).join(', ');
  return `
set session_replication_role = replica;
do $$
declare
  r record;
begin
  for r in
    select c.table_schema, c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'app' and c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE'
  loop
    execute format('delete from %I.%I where tenant_id in (${tenants.replace(/'/g, "''")})', r.table_schema, r.table_name);
  end loop;
end
$$;
delete from app.tenant where id in (${tenants});
delete from app.user_account where auth_subject in (${users});
delete from auth.identities where user_id::text in (${users});
delete from auth.users where id::text in (${users});
delete from app.job where tenant_id is null and payload ->> 'bench' = 'true';
set session_replication_role = origin;
`;
}
