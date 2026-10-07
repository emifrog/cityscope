-- Sprint 10 (PER-01): sectors, perimeters of members and terminals (DEC-04, ADR-025).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text default 'aal2') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', p_aal,
                                'bbbbbbbb-0000-4000-8000-000000000260', 'web')
$$;
create function pg_temp.version_of(p_membership uuid) returns integer
language sql as $$ select row_version from app.membership where id = p_membership $$;
-- A published, signed publication of a site, as the catalogue sees it (no row needed).
create function pg_temp.publication_of(p_site uuid) returns app.publication
language sql as $$
  select jsonb_populate_record(null::app.publication, jsonb_build_object(
    'tenant_id', '06000000-0000-4000-8000-000000000000', 'site_id', p_site, 'status', 'published',
    'sensitivity', 'normal', 'manifest_signature', jsonb_build_object('algorithm', 'Ed25519')))
$$;

-- Seed: sectors CIS Nice Centre (commune 06088, …1a-…01) and CIS Antibes (06004, …1a-…02);
-- EHPAD in Nice (…02-…01), warehouse in Antibes (…02-…02). Members: admin (…01), editor (…02),
-- OPS (…04), reader (…06, membership 0600000a-…06).
select plan(24);

select ok(app.site_in_sector('06000002-0000-4000-8000-000000000001', '0600001a-0000-4000-8000-000000000001'),
  'a site belongs to the sector of its commune');
select ok(not app.site_in_sector('06000002-0000-4000-8000-000000000001', '0600001a-0000-4000-8000-000000000002'),
  'and not to the sector of another commune');

set local role etare_api;

-- Composition: administration only, communes and sites added by hand.
select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select throws_ok(
  $$ select * from app.admin_save_sector(null, null, 'Secteur interdit', null, null, '[]', '{}') $$,
  '42501', null,
  'an editor does not compose sectors'
);
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select is(
  (select row_version from app.admin_save_sector('0600001a-0000-4000-8000-000000000002', 1, 'CIS Antibes', 'ANTIBES', null,
     '[{"insee_code": "06004", "label": "Antibes"}]', array['06000002-0000-4000-8000-000000000001'::uuid])),
  2,
  'a sector gets communes and sites added one by one'
);
select ok(app.site_in_sector('06000002-0000-4000-8000-000000000001', '0600001a-0000-4000-8000-000000000002'),
  'a site added by hand belongs to the sector, whatever its commune');
select throws_ok(
  $$ select * from app.admin_save_sector(null, null, 'X', null, null, '[]', array['83000002-0000-4000-8000-000000000001'::uuid]) $$,
  '23503', null,
  'a site of another SIS never joins a sector'
);
select throws_ok(
  $$ select * from app.admin_save_sector(null, null, 'cis nice centre', null, null, '[]', '{}') $$,
  '23505', null,
  'two active sectors never share a name'
);
select is(
  (select site_count from app.admin_sectors() where name = 'CIS Antibes'),
  2::bigint,
  'the administration sees how many sites each sector covers'
);
select app.admin_sites_outside_sectors() as outside_before \gset
reset role;
insert into app.site (tenant_id, name, site_type)
values ('06000000-0000-4000-8000-000000000000', 'Site sans commune (pgTAP)', 'other');
create temporary table nice_sites on commit drop as
  select id from app.site
  where tenant_id = '06000000-0000-4000-8000-000000000000'
    and app.site_in_sector(id, '0600001a-0000-4000-8000-000000000001');
grant select on nice_sites to etare_api;
set local role etare_api;
select is(app.admin_sites_outside_sectors(), :outside_before::bigint + 1, 'a site in no sector is counted for the administration');

-- Perimeter of a member: every role limited to the sector.
select lives_ok(
  $$ select app.admin_set_member_perimeter('0600000a-0000-4000-8000-000000000006',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000006'), array['0600001a-0000-4000-8000-000000000001'::uuid], '{}') $$,
  'the administration limits a reader to the sector of Nice'
);
select throws_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000006',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000006'), array['SIS_ADMIN']) $$,
  'ETSCP', null,
  'the administration of a SIS is never limited to a part of it'
);
select lives_ok(
  $$ select app.admin_update_member('0600000a-0000-4000-8000-000000000006',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000006'), array['READER', 'OPS_USER']) $$,
  'new roles keep the perimeter of the member'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000006', 'aal1');
select ok(not app.has_permission('site:read'), 'a limited member holds nothing on the whole SIS');
select ok(app.has_permission('site:read', '06000002-0000-4000-8000-000000000001'), 'but holds it on the sites of the sector');
select ok(not app.has_permission('site:read', '06000002-0000-4000-8000-000000000002'), 'and not outside');
select ok(app.holds_permission_on_part('offline:download'), 'the added role is limited the same way');
-- The seeded EHPAD, and the sites of Nice that earlier runs may have left on a local stack.
select set_eq(
  $$ select id from app.site $$,
  $$ select id from pg_temp.nice_sites $$,
  'row-level security shows the sites of the sector only'
);

-- Perimeter of a terminal: the whole SIS explicitly, or sectors.
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select app.admin_create_device('PGTAP SECTEUR', repeat('c', 64), now() + interval '1 day') as device_id \gset
select ok(app.device_covers_site(:'device_id', '06000002-0000-4000-8000-000000000002'), 'a new terminal holds the whole SIS');
select lives_ok(
  format($$ select app.admin_set_device_perimeter(%L, 1, array['0600001a-0000-4000-8000-000000000001'::uuid]) $$, :'device_id'),
  'the administration assigns the terminal to a sector'
);
select ok(not app.device_covers_site(:'device_id', '06000002-0000-4000-8000-000000000002'),
  'the terminal no longer covers the sites outside its sector');

select pg_temp.act_as('00000000-0000-4000-a000-000000000004', 'aal1');
select is(
  array[app.distributable_publication(pg_temp.publication_of('06000002-0000-4000-8000-000000000001'), :'device_id'),
        app.distributable_publication(pg_temp.publication_of('06000002-0000-4000-8000-000000000002'), :'device_id')],
  array[true, false],
  'a terminal receives the intersection of its perimeter and of the perimeter of the person'
);

-- A sector in use is not archived.
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select throws_ok(
  $$ select app.admin_archive_sector('0600001a-0000-4000-8000-000000000001', 1) $$,
  'ETSCU', null,
  'a sector assigned to members or terminals is not archived'
);
select lives_ok(
  $$ select app.admin_archive_sector('0600001a-0000-4000-8000-000000000002', 2) $$,
  'a sector nobody uses is archived'
);

reset role;
select is(
  (select count(*) from app.audit_event
   where trace_id = 'bbbbbbbb-0000-4000-8000-000000000260'
     and action in ('sector.composition', 'member.perimeter', 'device.perimeter')),
  3::bigint,
  'compositions and perimeters are audited'
);

select * from finish();
