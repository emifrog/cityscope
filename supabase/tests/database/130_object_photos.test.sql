-- Sprint 4: photos attached to operational objects (PLAN-05).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', null, 'web')
$$;

select plan(14);

-- Files of the EHPAD (an image, a PDF, a second image) and an image of another site of the SIS.
insert into app.asset (id, tenant_id, site_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256)
select ('06000005-0000-4000-8000-0000000001' || n)::uuid, '06000000-0000-4000-8000-000000000000', site::uuid,
       'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-0000000001' || n || '/v',
       'tenants/06000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-0000000001' || n || '/v',
       filename, mime, 1024, repeat(n, 32)
from (values ('a1', '06000002-0000-4000-8000-000000000001', 'poteau.jpg', 'image/jpeg'),
             ('a2', '06000002-0000-4000-8000-000000000001', 'consignes.pdf', 'application/pdf'),
             ('a3', '06000002-0000-4000-8000-000000000001', 'vanne.png', 'image/png'),
             ('a4', '06000002-0000-4000-8000-000000000002', 'ailleurs.webp', 'image/webp'))
  as files(n, site, filename, mime);

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');

select lives_ok(
  $$ insert into app.object_photo (id, tenant_id, site_id, object_id, asset_id, caption)
     values ('0600000e-0000-4000-8000-000000000001', '06000000-0000-4000-8000-000000000000',
             '06000002-0000-4000-8000-000000000001', '06000009-0000-4000-8000-000000000004',
             '06000005-0000-4000-8000-0000000001a1', 'Accès au poteau') $$,
  'an editor attaches an image of the site to an object'
);
select throws_ok(
  $$ insert into app.object_photo (tenant_id, site_id, object_id, asset_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '06000009-0000-4000-8000-000000000004', '06000005-0000-4000-8000-0000000001a2') $$,
  '23514', null, 'a photo is an image, never a PDF'
);
select throws_ok(
  $$ insert into app.object_photo (tenant_id, site_id, object_id, asset_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '06000009-0000-4000-8000-000000000004', '06000005-0000-4000-8000-0000000001a4') $$,
  '23514', null, 'a photo is a file of the same site'
);
select throws_ok(
  $$ insert into app.object_photo (tenant_id, site_id, object_id, asset_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '06000009-0000-4000-8000-000000000004', '06000005-0000-4000-8000-0000000001a1') $$,
  '23505', null, 'a file illustrates one photo only'
);
select throws_ok(
  $$ insert into app.object_photo (tenant_id, site_id, object_id, asset_id, caption)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '06000009-0000-4000-8000-000000000004', '06000005-0000-4000-8000-0000000001a3', '  ') $$,
  '23514', null, 'a caption is never blank'
);
select lives_ok(
  $$ update app.object_photo set caption = 'Poteau côté parking' where id = '0600000e-0000-4000-8000-000000000001' $$,
  'the caption can be corrected'
);
select throws_ok(
  $$ update app.object_photo set asset_id = '06000005-0000-4000-8000-0000000001a3'
     where id = '0600000e-0000-4000-8000-000000000001' $$,
  '23514', null, 'a photo keeps its file'
);
select throws_ok(
  $$ delete from app.object_photo where id = '0600000e-0000-4000-8000-000000000001' $$,
  '42501', null, 'photos are archived, never deleted'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000');
select is((select count(*) from app.object_photo), 1::bigint, 'a reader of the site sees its photos');
select throws_ok(
  $$ insert into app.object_photo (tenant_id, site_id, object_id, asset_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '06000009-0000-4000-8000-000000000004', '06000005-0000-4000-8000-0000000001a3') $$,
  '42501', null, 'a reader cannot attach photos'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000007', '83000000-0000-4000-8000-000000000000');
select is((select count(*) from app.object_photo), 0::bigint, 'another SIS sees none of these photos');

select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');
select lives_ok(
  $$ update app.object_photo set status = 'archived' where id = '0600000e-0000-4000-8000-000000000001' $$,
  'an editor archives a photo'
);
select throws_ok(
  $$ update app.object_photo set status = 'active' where id = '0600000e-0000-4000-8000-000000000001' $$,
  '23514', null, 'an archived photo stays archived'
);

reset role;
select is(
  (select count(*) from app.audit_event where entity_type = 'object_photo'
     and entity_id = '0600000e-0000-4000-8000-000000000001'),
  3::bigint, 'creation, correction and archiving are audited'
);

select * from finish();
rollback;
