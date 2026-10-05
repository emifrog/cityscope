-- Sprint 11 (CAR-01 to CAR-03): offline base maps of the tablets, one per sector (DEC-02, ADR-024).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text default 'aal2', p_origin text default 'web') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', p_aal,
                                'bbbbbbbb-0000-4000-8000-000000000280', p_origin)
$$;

-- A test sector (…1a-…280) holding the EHPAD (published, located); seeded sector CIS Antibes (…1a-…02,
-- warehouse located, nothing published). Members: admin (…01), editor (…02), OPS (…04).
select plan(27);

-- Start from no base map, whatever the local stack holds (the transaction is rolled back).
delete from app.device_basemap;
delete from app.basemap_pack_signature;
delete from app.basemap_pack;
-- A sector of its own, holding the EHPAD only (the local stack may hold other sites in Nice).
insert into app.sector (id, tenant_id, name) values
  ('0600001a-0000-4000-8000-000000000280', '06000000-0000-4000-8000-000000000000', 'Secteur pgTAP carte');
insert into app.sector_site (tenant_id, sector_id, site_id) values
  ('06000000-0000-4000-8000-000000000000', '0600001a-0000-4000-8000-000000000280', '06000002-0000-4000-8000-000000000001');

-- Coverage: extent of the located sites, detail around the distributed ones (signed version).
select is(
  jsonb_array_length(app.basemap_coverage('0600001a-0000-4000-8000-000000000280') -> 'detail'),
  0,
  'a version without signature is not distributed: no detail area'
);
-- A signed version of the EHPAD supersedes the seeded one (built by the worker in real life).
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
values ('0600009f-0000-4000-8000-000000000280', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000001',
        '00000000-0000-4000-b000-000000000003');
update app.publication set status = 'building' where id = '0600009f-0000-4000-8000-000000000280';
update app.publication
set status = 'ready', payload = '{}'::jsonb,
    manifest = jsonb_build_object('data_file', 'data/site.json', 'files', '[]'::jsonb),
    manifest_hash = repeat('9', 64),
    manifest_signature = jsonb_build_object('algorithm', 'Ed25519', 'key_id', 'ed25519-test', 'signature', repeat('A', 86) || '==')
where id = '0600009f-0000-4000-8000-000000000280';
update app.publication set status = 'superseded', superseded_at = now() where id = '0600000f-0000-4000-8000-000000000001';
update app.publication set status = 'published', published_at = now(), published_by = '00000000-0000-4000-b000-000000000003'
where id = '0600009f-0000-4000-8000-000000000280';
select is(
  (app.basemap_coverage('0600001a-0000-4000-8000-000000000280') -> 'detail') -> 0,
  '[7.25180, 43.70790]'::jsonb,
  'the published site of the sector marks a detail area'
);
select is(
  jsonb_array_length(app.basemap_coverage('0600001a-0000-4000-8000-000000000002') -> 'detail'),
  0,
  'a site without published version gets the general view only'
);
update app.site set sensitivity = 'restricted' where id = '06000002-0000-4000-8000-000000000001';
select is(
  jsonb_array_length(app.basemap_coverage('0600001a-0000-4000-8000-000000000280') -> 'detail'),
  0,
  'a sensitive site never marks a detail area (it would point it out)'
);
update app.site set sensitivity = 'normal' where id = '06000002-0000-4000-8000-000000000001';

-- Terminals: one for the whole SIS, one limited to Antibes.
insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by) values
  ('06000010-0000-4000-8000-000000000280', '06000000-0000-4000-8000-000000000000', 'TABLETTE CARTE SIS', 'active',
   'android', 'Baaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=', now(), '00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-b000-000000000001'),
  ('06000010-0000-4000-8000-000000000281', '06000000-0000-4000-8000-000000000000', 'TABLETTE CARTE ANTIBES', 'active',
   'android', 'Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb=', now(), '00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-b000-000000000001');
update app.device set scope = 'sectors' where id = '06000010-0000-4000-8000-000000000281';
insert into app.device_sector (tenant_id, device_id, sector_id)
values ('06000000-0000-4000-8000-000000000000', '06000010-0000-4000-8000-000000000281', '0600001a-0000-4000-8000-000000000002');
select ok(app.basemap_sector_eligible('0600001a-0000-4000-8000-000000000280'), 'a sector received by a terminal gets a base map');

-- Planning by the worker, with the configured source.
set local role etare_worker;
select cmp_ok(app.worker_plan_basemaps('synthetic'), '>=', 2, 'the worker plans the first base map of each sector');
reset role;
select is(
  (select count(*) from app.job j join app.basemap_pack b on j.idempotency_key = 'basemap.build:' || b.id::text
   where b.sector_id = '0600001a-0000-4000-8000-000000000280' and j.status = 'queued'),
  1::bigint,
  'each preparation is a job of the queue'
);
set local role etare_worker;
select is(app.worker_plan_basemaps('synthetic'), 0, 'a preparation already queued is not planned twice');
reset role;
select id as pack from app.basemap_pack
where sector_id = '0600001a-0000-4000-8000-000000000280' and status = 'queued' \gset

-- Administration: device:manage, a request keeps the preparation already queued.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select throws_ok($$ select app.basemap_overview() $$, '42501', null, 'an editor does not see the base maps');
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select is(app.request_basemap_build('0600001a-0000-4000-8000-000000000280', 'synthetic'), :'pack'::uuid,
  'a request keeps the preparation already queued');
select throws_ok($$ select app.request_basemap_build('83000000-0000-4000-8000-00000000001a', 'synthetic') $$,
  'ETB04', null, 'a sector of another SIS is unknown');
select throws_ok($$ select app.worker_plan_basemaps('synthetic') $$, '42501', null, 'the API never plans');
select throws_ok($$ select count(*) from app.basemap_pack $$, '42501', null, 'the packs are read through functions only');

-- Preparation: start, objects recorded under the prefix of the pack, completion.
reset role;
set local role etare_worker;
select is(
  app.worker_start_basemap(:'pack', '06000000-0000-4000-8000-000000000000') #>> '{coverage,site_count}',
  '1',
  'the worker starts the preparation with the coverage of the sector'
);
select ok(not app.worker_record_basemap_object(:'pack', '06000000-0000-4000-8000-000000000000',
  'tenants/83000000-0000-4000-8000-000000000000/basemaps/x/style.json'), 'an object outside the pack is refused');
select ok(app.worker_record_basemap_object(:'pack', '06000000-0000-4000-8000-000000000000',
  'tenants/06000000-0000-4000-8000-000000000000/basemaps/' || :'pack' || '/style.json'), 'an object of the pack is recorded');
reset role;
select generation as before from app.distribution_generation
where tenant_id = '06000000-0000-4000-8000-000000000000' \gset
set local role etare_worker;
select ok(app.worker_complete_basemap(:'pack', '06000000-0000-4000-8000-000000000000',
  '{"kind": "basemap", "version": 1}', repeat('b', 64),
  '{"algorithm": "Ed25519", "key_id": "ed25519-test", "signature": "x"}',
  jsonb_build_array(jsonb_build_object('sha256', repeat('c', 64), 'size_bytes', 10,
    'storage_key', 'tenants/06000000-0000-4000-8000-000000000000/basemaps/' || :'pack' || '/style.json')),
  10, 120, now() + interval '182 days'), 'the worker completes the preparation');
reset role;
select is(
  (select generation from app.distribution_generation where tenant_id = '06000000-0000-4000-8000-000000000000'),
  :before::bigint + 1,
  'the terminals see the new base map at their next contact'
);

-- Distribution: the sectors of the terminal only.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', 'aal1', 'mobile');
select is(
  (select e ->> 'sector_name' from jsonb_array_elements(app.sync_basemaps('06000010-0000-4000-8000-000000000280')) e
   where e ->> 'pack_id' = :'pack'),
  'Secteur pgTAP carte',
  'a terminal of the whole SIS receives the base map of every sector'
);
select is(
  (select count(*) from jsonb_array_elements(app.sync_basemaps('06000010-0000-4000-8000-000000000281')) e
   where e ->> 'pack_id' = :'pack'),
  0::bigint,
  'a terminal limited to Antibes never receives the base map of another sector'
);
select is((select manifest_hash from app.sync_basemap('06000010-0000-4000-8000-000000000280', :'pack')), repeat('b', 64),
  'the signed manifest is served as completed');
select is(
  (select count(*) from app.sync_basemap('06000010-0000-4000-8000-000000000281', :'pack')),
  0::bigint,
  'and refused to a terminal outside the sector'
);
select is(
  (select storage_key from app.sync_basemap_files('06000010-0000-4000-8000-000000000280', :'pack',
     array[repeat('c', 64), repeat('d', 64)])),
  'tenants/06000000-0000-4000-8000-000000000000/basemaps/' || :'pack' || '/style.json',
  'the parts are found by their hash, unknown hashes are ignored'
);
select is(app.sync_basemap_receipt('06000010-0000-4000-8000-000000000280', array[:'pack'::uuid]), 1,
  'the terminal acknowledges the base maps it holds');
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select is(
  (select (e -> 'devices' ->> 'installed')::int from jsonb_array_elements(app.basemap_overview()) e
   where e #>> '{sector,id}' = '0600001a-0000-4000-8000-000000000280'),
  1,
  'the administration sees which terminals are up to date'
);

-- A failed preparation waits a day, then its objects are removed.
select app.request_basemap_build('0600001a-0000-4000-8000-000000000280', 'synthetic') as second \gset
reset role;
set local role etare_worker;
select ok(app.worker_fail_basemap(:'second', '06000000-0000-4000-8000-000000000000', 'TOO_LARGE', 'Fond trop volumineux.'),
  'a refused preparation fails visibly');
reset role;
select is(
  (select count(*) from app.basemap_pack where sector_id = '0600001a-0000-4000-8000-000000000280' and status = 'ready'),
  1::bigint,
  'the base map in force stays on the tablets'
);
reset role;

select * from finish();
rollback;
