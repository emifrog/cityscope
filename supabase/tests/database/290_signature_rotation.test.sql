-- Sprint 12 (SEC-04): re-signature of the content in force after a key rotation (ADR-027).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', 'bbbbbbbb-0000-4000-8000-000000000290', 'mobile')
$$;

create function pg_temp.signature(p_key text, p_char text) returns jsonb
language sql as $$
  select jsonb_build_object('algorithm', 'Ed25519', 'key_id', p_key, 'signature', repeat(p_char, 86) || '==')
$$;

select plan(24);

-- A signed version of the EHPAD in force (built by the worker in real life), signed by the "old" key;
-- a ready base map of the seeded sector CIS Antibes; a terminal of the SIS (ops06: a…04).
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
values ('0600009f-0000-4000-8000-000000000290', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000001',
        '00000000-0000-4000-b000-000000000003');
update app.publication set status = 'building' where id = '0600009f-0000-4000-8000-000000000290';
update app.publication
set status = 'ready', payload = '{}'::jsonb,
    manifest = jsonb_build_object('data_file', 'data/site.json', 'files', '[]'::jsonb),
    manifest_hash = repeat('9', 64), manifest_signature = pg_temp.signature('ed25519-old290', 'A')
where id = '0600009f-0000-4000-8000-000000000290';
update app.publication set status = 'superseded', superseded_at = now()
where site_id = '06000002-0000-4000-8000-000000000001' and status = 'published';
update app.publication set status = 'published', published_at = now(), published_by = '00000000-0000-4000-b000-000000000003'
where id = '0600009f-0000-4000-8000-000000000290';

delete from app.device_basemap;
delete from app.basemap_pack_signature;
delete from app.basemap_pack;
insert into app.basemap_pack (id, tenant_id, sector_id, version, source_id, status, reason, built_at, manifest,
                              manifest_hash, manifest_signature)
values ('0600009b-0000-4000-8000-000000000290', '06000000-0000-4000-8000-000000000000',
        '0600001a-0000-4000-8000-000000000002', 1, 'synthetic', 'ready', 'initial', now(), '{"kind": "basemap"}',
        repeat('8', 64), pg_temp.signature('ed25519-old290', 'B'));

insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by)
values ('06000010-0000-4000-8000-000000000290', '06000000-0000-4000-8000-000000000000', 'TABLETTE CLES', 'active',
        'android', 'Caaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=', now(), '00000000-0000-4000-b000-000000000004',
        '00000000-0000-4000-b000-000000000001');

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('app.publication_signature'::regclass, 'app.basemap_pack_signature'::regclass)),
  'row level security is on for the re-signatures'
);

-- -----------------------------------------------------------------------------
-- Worker: planning and re-signature
-- -----------------------------------------------------------------------------
set local role etare_worker;
select isnt(app.worker_schedule_signature_renewal('ed25519-new290', '2026-10-28T10'), null, 'a renewal is queued per key and hour');
select is(app.worker_schedule_signature_renewal('ed25519-new290', '2026-10-28T10'), null, 'never twice for the same slot');
select throws_ok(
  $$ select app.worker_schedule_signature_renewal('ed25519-new290', 'demain') $$,
  '22023', null, 'the slot is an hour'
);
select results_eq(
  $$ select kind, jsonb_array_length(signatures) from app.worker_signature_candidates('ed25519-new290', 500)
     where content_id in ('0600009f-0000-4000-8000-000000000290', '0600009b-0000-4000-8000-000000000290')
     order by kind $$,
  $$ values ('basemap', 1), ('publication', 1) $$,
  'the content in force not signed by the new key is offered, with the signatures it has'
);
select is(
  (select count(*) from app.worker_signature_candidates('ed25519-old290', 500)
   where content_id in ('0600009f-0000-4000-8000-000000000290', '0600009b-0000-4000-8000-000000000290')),
  0::bigint, 'the key that signed a content at build time is not offered it again'
);
select is(
  (select count(*) from app.worker_signature_candidates('ed25519-new290', 500, array['0600009f-0000-4000-8000-000000000290']::uuid[])
   where content_id = '0600009f-0000-4000-8000-000000000290'),
  0::bigint, 'a content the worker could not verify is left out for the rest of the run'
);
select ok(
  app.worker_record_signature('publication', '0600009f-0000-4000-8000-000000000290', pg_temp.signature('ed25519-new290', 'C')),
  'the re-signature of a publication in force is recorded'
);
select ok(
  not app.worker_record_signature('publication', '0600009f-0000-4000-8000-000000000290', pg_temp.signature('ed25519-new290', 'D')),
  'once per key: the first re-signature is kept'
);
select ok(
  app.worker_record_signature('basemap', '0600009b-0000-4000-8000-000000000290', pg_temp.signature('ed25519-new290', 'E')),
  'the re-signature of a base map in force is recorded'
);
select is(
  (select count(*) from app.worker_signature_candidates('ed25519-new290', 500)
   where content_id in ('0600009f-0000-4000-8000-000000000290', '0600009b-0000-4000-8000-000000000290')),
  0::bigint, 'a re-signed content is no longer offered'
);
select ok(
  not app.worker_record_signature('publication', '0600000f-0000-4000-8000-000000000001', pg_temp.signature('ed25519-new290', 'F')),
  'a version no longer in force is never re-signed'
);
select throws_ok(
  $$ select app.worker_record_signature('publication', '0600009f-0000-4000-8000-000000000290',
       '{"algorithm": "Ed25519", "key_id": "ed25519-other290", "signature": "abc"}') $$,
  '23514', null, 'a malformed signature is refused'
);
select throws_ok(
  $$ select app.worker_record_signature('document', '0600009f-0000-4000-8000-000000000290', pg_temp.signature('k', 'G')) $$,
  '22023', null, 'only publications and base maps are signed'
);
select throws_ok(
  $$ select count(*) from app.publication_signature $$,
  '42501', null, 'the worker reaches the re-signatures through its functions only'
);

reset role;
select results_eq(
  $$ select action, entity_type, entity_id, origin, metadata ->> 'key_id' from app.audit_event
     where action in ('publication.resigned', 'basemap.resigned')
       and metadata ->> 'content_id' in ('0600009f-0000-4000-8000-000000000290', '0600009b-0000-4000-8000-000000000290')
     order by action $$,
  $$ values ('basemap.resigned', 'sector', '0600001a-0000-4000-8000-000000000002'::uuid, 'worker', 'ed25519-new290'),
            ('publication.resigned', 'publication', '0600009f-0000-4000-8000-000000000290'::uuid, 'worker', 'ed25519-new290') $$,
  'each re-signature is traced in the journal of the SIS'
);
select is(
  (select manifest_signature from app.publication where id = '0600009f-0000-4000-8000-000000000290'),
  pg_temp.signature('ed25519-old290', 'A'),
  'the signature made at build time stays untouched'
);

-- -----------------------------------------------------------------------------
-- Terminals: the re-signatures, and the key set they hold
-- -----------------------------------------------------------------------------
set local role etare_api;
select throws_ok($$ select count(*) from app.publication_signature $$, '42501', null, 'the API has no direct access either');
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000');
select is(
  app.sync_renewed_signatures('06000010-0000-4000-8000-000000000290', 'publication', '0600009f-0000-4000-8000-000000000290'),
  jsonb_build_array(pg_temp.signature('ed25519-new290', 'C')),
  'a terminal of the SIS receives the re-signatures of a content'
);
select is(
  app.sync_renewed_signatures('06000010-0000-4000-8000-000000000290', 'basemap', '0600009b-0000-4000-8000-000000000290'),
  jsonb_build_array(pg_temp.signature('ed25519-new290', 'E')),
  'and those of a base map'
);
select throws_ok(
  $$ select app.sync_renewed_signatures('83000010-0000-4000-8000-000000000121', 'publication',
       '0600009f-0000-4000-8000-000000000290') $$,
  'ETDNE', null, 'never for a terminal of another SIS'
);
select is(
  app.sync_receipt('06000010-0000-4000-8000-000000000290', 1, 'installed', null,
                   array['0600009f-0000-4000-8000-000000000290']::uuid[], 3),
  1, 'a receipt carries the key set of the terminal'
);
select is(
  app.sync_receipt('06000010-0000-4000-8000-000000000290', 1, 'partial', 'NETWORK_INTERRUPTED',
                   array['0600009f-0000-4000-8000-000000000290']::uuid[]),
  1, 'an older application sends no key set'
);
reset role;
select is(
  (select keyset_sequence from app.device_sync_state where device_id = '06000010-0000-4000-8000-000000000290'),
  3, 'the last key set reported is kept'
);

select * from finish();
rollback;
