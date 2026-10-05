-- Sprint 4: terminals, enrollment, signed publications, catalogue generations and receipts (ADR-015).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid, p_aal text default 'aal1') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, p_aal, 'bbbbbbbb-0000-4000-8000-000000000120', 'mobile')
$$;

select plan(41);

-- Accounts of the seed: admin06 (a…01), validator06 (a…03), ops06 (a…04, user b…04), reader06 (a…06).
select set_eq(
  $$ select r.code from app.role_permission rp join app.role r on r.id = rp.role_id
     where rp.permission_code = 'offline:download' and r.tenant_id is null $$,
  array['OPS_USER', 'PREVISION_EDITOR', 'PREVISION_VALIDATOR', 'SIS_ADMIN'],
  'offline download is granted to the field and back-office roles (cahier des charges §3.1)'
);

-- -----------------------------------------------------------------------------
-- Administration: declaring terminals (device:manage, second factor)
-- -----------------------------------------------------------------------------
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ select app.admin_create_device('PGTAP FPT01', repeat('a', 64), now() + interval '1 day') $$,
  '42501', null, 'declaring a terminal requires the second factor'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');
select lives_ok(
  $$ select app.admin_create_device('PGTAP FPT01',
       '3f63d25fcb898ecfd6c2e2322bfdb11f44fe17dd0dc359e70b7246224bb223e9', now() + interval '1 day') $$,
  'a SIS administrator with the second factor declares a terminal (only the hash of its code is stored)'
);
select is((select status from app.device where name = 'PGTAP FPT01'), 'pending', 'the terminal waits for its enrollment');
select throws_ok(
  $$ select app.admin_create_device('pgtap fpt01', repeat('b', 64), now() + interval '1 day') $$,
  '23505', null, 'two live terminals of a SIS do not share a name'
);
select throws_ok(
  $$ select app.admin_create_device('FPT02', repeat('b', 64), now() - interval '1 minute') $$,
  '22023', null, 'an enrollment code is never created already expired'
);
select is(
  (select after_data ->> 'enrollment_code_hash' from app.audit_event
   where entity_type = 'device' and action = 'device.insert' order by occurred_at desc limit 1),
  '[redacted]', 'the creation is audited without the hash of the code'
);

-- -----------------------------------------------------------------------------
-- Enrollment by a field user (offline:download)
-- -----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');
select is((select count(*) from app.device), 0::bigint, 'the list of terminals is reserved to device:manage holders');
select throws_ok(
  $$ select * from app.enroll_device(repeat('f', 64), 'DMdKVwi+EyEYB7lOW3IZpzIF8O02Zhw7CgppOWXKPnY=', 'android', '1.0.0') $$,
  'ETENR', null, 'an unknown code enrolls nothing'
);
select is(
  (select device_name from app.enroll_device('3f63d25fcb898ecfd6c2e2322bfdb11f44fe17dd0dc359e70b7246224bb223e9',
     'DMdKVwi+EyEYB7lOW3IZpzIF8O02Zhw7CgppOWXKPnY=', 'android', '1.0.0')),
  'PGTAP FPT01', 'a valid code enrolls the terminal with the key generated on the device'
);
select throws_ok(
  $$ select * from app.enroll_device('3f63d25fcb898ecfd6c2e2322bfdb11f44fe17dd0dc359e70b7246224bb223e9',
       '6KLd0hNMVtDYCg3qhZTJOEyAV6K2dlOGbsJnDOhn4Hc=', 'android', '1.0.0') $$,
  'ETENR', null, 'a code is used once'
);

reset role;
select results_eq(
  $$ select status, public_key, enrolled_by, enrollment_code_hash from app.device where name = 'PGTAP FPT01' $$,
  $$ values ('active', 'DMdKVwi+EyEYB7lOW3IZpzIF8O02Zhw7CgppOWXKPnY=', '00000000-0000-4000-b000-000000000004'::uuid, null::text) $$,
  'the enrolled terminal keeps its key and its enroller; the code is gone'
);
select throws_ok(
  $$ update app.device set public_key = '6KLd0hNMVtDYCg3qhZTJOEyAV6K2dlOGbsJnDOhn4Hc=' where name = 'PGTAP FPT01' $$,
  '23514', null, 'the enrollment of a terminal is final'
);
select throws_ok($$ delete from app.device where name = 'PGTAP FPT01' $$, '42501', null, 'terminals are never deleted');

-- An expired code and a code of another SIS.
insert into app.device (id, tenant_id, name, enrollment_code_hash, enrollment_expires_at, created_by) values
  ('06000010-0000-4000-8000-000000000121', '06000000-0000-4000-8000-000000000000', 'TABLETTE EXPIRÉE',
   'c4228a480319d6e8299c4f41eacb6cb49ba9b9e0edd4911310919c1c2b3af8d7', now() - interval '1 minute',
   '00000000-0000-4000-b000-000000000001'),
  ('83000010-0000-4000-8000-000000000121', '83000000-0000-4000-8000-000000000000', 'TABLETTE 83',
   'ef047c4d340e378370543b1fa04aa0e9f671999f9de449dd9c17029ab76cb4db', now() + interval '1 day',
   '00000000-0000-4000-b000-000000000007');

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ select * from app.enroll_device('c4228a480319d6e8299c4f41eacb6cb49ba9b9e0edd4911310919c1c2b3af8d7',
       '6KLd0hNMVtDYCg3qhZTJOEyAV6K2dlOGbsJnDOhn4Hc=', 'android', '1.0.0') $$,
  'ETENR', null, 'an expired code enrolls nothing'
);
select throws_ok(
  $$ select * from app.enroll_device('ef047c4d340e378370543b1fa04aa0e9f671999f9de449dd9c17029ab76cb4db',
       '6KLd0hNMVtDYCg3qhZTJOEyAV6K2dlOGbsJnDOhn4Hc=', 'android', '1.0.0') $$,
  'ETENR', null, 'a code of another SIS enrolls nothing'
);
select pg_temp.act_as('00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ select * from app.enroll_device('ef047c4d340e378370543b1fa04aa0e9f671999f9de449dd9c17029ab76cb4db',
       '6KLd0hNMVtDYCg3qhZTJOEyAV6K2dlOGbsJnDOhn4Hc=', 'android', '1.0.0') $$,
  '42501', null, 'a reader without offline download cannot enroll a terminal'
);

-- -----------------------------------------------------------------------------
-- A signed publication of the demo site, and catalogue generations
-- -----------------------------------------------------------------------------
reset role;
create temporary table generation_before on commit drop as
select generation from app.distribution_generation where tenant_id = '06000000-0000-4000-8000-000000000000';

insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by) values
  ('06000010-0000-4000-8000-000000000120', '06000000-0000-4000-8000-000000000000', 'TABLETTE SYNCHRO', 'active',
   'android', 'RBT2z2voNAO9JYKeVAH6W8barTg7dr9gu6JIi5OjM0U=', now(), '00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-b000-000000000001');

insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
values ('0600009f-0000-4000-8000-000000000120', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000001',
        '00000000-0000-4000-b000-000000000003');
update app.publication set status = 'building' where id = '0600009f-0000-4000-8000-000000000120';
update app.publication
set status = 'ready',
    payload = jsonb_build_object('data', jsonb_build_object('plans', jsonb_build_array(jsonb_build_object(
      'background', jsonb_build_object('asset', jsonb_build_object(
        'id', '06000005-0000-4000-8000-000000000001',
        'sha256', '467df55eecc701442c1349b2107981bc9c9c8a01e0399cdcfd903a0e540c28d4')))))),
    manifest = jsonb_build_object('data_file', 'data/site.json', 'files', jsonb_build_array(
      jsonb_build_object('path', 'data/site.json', 'sha256', repeat('1', 64), 'size_bytes', 10, 'required', true),
      jsonb_build_object('path', 'plans/background.png', 'sha256', '467df55eecc701442c1349b2107981bc9c9c8a01e0399cdcfd903a0e540c28d4',
                         'size_bytes', 16642, 'required', true),
      jsonb_build_object('path', 'etare.pdf', 'sha256', repeat('2', 64), 'size_bytes', 300, 'required', true),
      jsonb_build_object('path', 'documents/notice.pdf', 'sha256', repeat('3', 64), 'size_bytes', 50, 'required', false))),
    manifest_hash = repeat('9', 64),
    manifest_signature = jsonb_build_object('algorithm', 'Ed25519', 'key_id', 'ed25519-test', 'signature', repeat('A', 86) || '==')
where id = '0600009f-0000-4000-8000-000000000120';
update app.publication set status = 'superseded', superseded_at = now() where id = '0600000f-0000-4000-8000-000000000001';
update app.publication set status = 'published', published_at = now(), published_by = '00000000-0000-4000-b000-000000000003'
where id = '0600009f-0000-4000-8000-000000000120';

select is(
  (select g.generation - b.generation from app.distribution_generation g, generation_before b
   where g.tenant_id = '06000000-0000-4000-8000-000000000000'),
  2::bigint, 'each version entering or leaving publication moves the catalogue generation forward'
);
select throws_ok(
  $$ update app.publication set manifest_signature = jsonb_build_object('algorithm', 'Ed25519', 'key_id', 'other',
       'signature', repeat('B', 86) || '==') where id = '0600009f-0000-4000-8000-000000000120' $$,
  '42501', null, 'the signature of a built publication never changes'
);
select is(
  (select app.distributable_publication(jsonb_populate_record(p, '{"sensitivity": "high"}'), '06000010-0000-4000-8000-000000000120') from app.publication p
   where p.id = '0600009f-0000-4000-8000-000000000120'),
  false, 'a sensitive site is not distributed offline (Sprint 4)'
);
select is(
  (select app.distributable_publication(jsonb_populate_record(p, '{"manifest_signature": null}'), '06000010-0000-4000-8000-000000000120') from app.publication p
   where p.id = '0600009f-0000-4000-8000-000000000120'),
  false, 'an unsigned publication is not distributed offline'
);

-- -----------------------------------------------------------------------------
-- Synchronization functions (the API has checked the proof of the terminal first)
-- -----------------------------------------------------------------------------
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');
select results_eq(
  $$ select status, public_key from app.sync_device('06000010-0000-4000-8000-000000000120') $$,
  $$ values ('active', 'RBT2z2voNAO9JYKeVAH6W8barTg7dr9gu6JIi5OjM0U=') $$,
  'the API reads the status and the key of a terminal of the SIS'
);
select is(
  (select count(*) from app.sync_device('83000010-0000-4000-8000-000000000121')), 0::bigint,
  'a terminal of another SIS is unknown'
);
select throws_ok(
  $$ select app.sync_catalog('83000010-0000-4000-8000-000000000121', '1.0.0') $$,
  'ETDNE', null, 'no catalogue for a terminal of another SIS'
);
select throws_ok(
  $$ select app.sync_catalog('06000010-0000-4000-8000-000000000121', '1.0.0') $$,
  'ETDNE', null, 'no catalogue for a terminal that is not enrolled'
);
select results_eq(
  $$ select e ->> 'publication_id', (e ->> 'size_bytes')::bigint, e ->> 'etare_number'
     from jsonb_array_elements(app.sync_catalog('06000010-0000-4000-8000-000000000120', '1.0.3') -> 'publications') e
     where e ->> 'site_id' = '06000002-0000-4000-8000-000000000001' $$,
  $$ values ('0600009f-0000-4000-8000-000000000120', 16952::bigint, '06-0428') $$,
  'the catalogue lists the signed published versions only, with the size of their required files'
);
select is(
  (select count(*) from app.sync_package('06000010-0000-4000-8000-000000000120', '0600009f-0000-4000-8000-000000000120')),
  1::bigint, 'the package of a distributed version is served'
);
select is(
  (select count(*) from app.sync_package('06000010-0000-4000-8000-000000000120', '0600000f-0000-4000-8000-000000000001')),
  0::bigint, 'a superseded, unsigned version is not served'
);
select results_eq(
  $$ select sha256, storage_key from app.sync_package_files('06000010-0000-4000-8000-000000000120',
       '0600009f-0000-4000-8000-000000000120',
       array['467df55eecc701442c1349b2107981bc9c9c8a01e0399cdcfd903a0e540c28d4', repeat('2', 64), repeat('1', 64), repeat('8', 64)])
     order by sha256 $$,
  $$ values
       (repeat('2', 64), 'tenants/06000000-0000-4000-8000-000000000000/publications/0600009f-0000-4000-8000-000000000120/etare.pdf'),
       ('467df55eecc701442c1349b2107981bc9c9c8a01e0399cdcfd903a0e540c28d4',
        'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000001/06000005-0000-4000-8000-0000000000a1') $$,
  'files are resolved by hash among those of the manifest only (never the data file nor an unknown hash)'
);
select is(
  app.sync_receipt('06000010-0000-4000-8000-000000000120', 999, 'installed', null,
    array['0600009f-0000-4000-8000-000000000120', '0600000f-0000-4000-8000-000000000001',
          '83000002-0000-4000-8000-000000000001']::uuid[]),
  1, 'a receipt keeps one version per site of the SIS'
);
select pg_temp.act_as('00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000');
select throws_ok(
  $$ select app.sync_catalog('06000010-0000-4000-8000-000000000120', '1.0.0') $$,
  '42501', null, 'a reader without offline download gets no catalogue'
);

reset role;
select results_eq(
  $$ select s.app_version, s.last_user_id, s.last_status, s.installed_generation = g.generation,
            s.catalog_generation = g.generation
     from app.device_sync_state s, app.distribution_generation g
     where s.device_id = '06000010-0000-4000-8000-000000000120' and g.tenant_id = s.tenant_id $$,
  $$ values ('1.0.3', '00000000-0000-4000-b000-000000000004'::uuid, 'installed', true, true) $$,
  'contact, announced generation and installed generation are recorded (never beyond the current one)'
);
select results_eq(
  $$ select publication_id from app.device_publication where device_id = '06000010-0000-4000-8000-000000000120' $$,
  $$ values ('0600009f-0000-4000-8000-000000000120'::uuid) $$,
  'the newest reported version of the site is kept'
);

-- -----------------------------------------------------------------------------
-- Revocation (OFF-04)
-- -----------------------------------------------------------------------------
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2');
select is(
  (select count(*) from app.device where tenant_id <> '06000000-0000-4000-8000-000000000000'), 0::bigint,
  'the administrator sees the terminals of the SIS only'
);
select throws_ok(
  $$ select app.admin_revoke_device('06000010-0000-4000-8000-000000000120', 99, 'Perte') $$,
  'ETD12', null, 'a revocation is based on the version read'
);
select throws_ok(
  $$ select app.admin_renew_device_code('06000010-0000-4000-8000-000000000120', 1, repeat('c', 64), now() + interval '1 day') $$,
  'ETD09', null, 'an enrolled terminal gets no new code'
);
select is(
  app.admin_revoke_device('06000010-0000-4000-8000-000000000120',
    (select row_version from app.device where id = '06000010-0000-4000-8000-000000000120'), 'Tablette perdue'),
  2, 'the administrator revokes the terminal'
);
select throws_ok(
  $$ select app.admin_revoke_device('06000010-0000-4000-8000-000000000120', 2, 'Encore') $$,
  'ETD09', null, 'a revocation is final'
);
select throws_ok(
  $$ select app.admin_revoke_device('83000010-0000-4000-8000-000000000121', 1, 'Autre SIS') $$,
  'ETD04', null, 'a terminal of another SIS cannot be revoked'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');
select is(
  (select status from app.sync_device('06000010-0000-4000-8000-000000000120')), 'revoked',
  'the API sees the revocation to refuse the terminal'
);
select throws_ok(
  $$ select app.sync_catalog('06000010-0000-4000-8000-000000000120', '1.0.0') $$,
  'ETDRV', null, 'a revoked terminal gets no catalogue'
);

select * from finish();
rollback;
