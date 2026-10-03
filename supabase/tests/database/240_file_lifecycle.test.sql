-- Sprint 9 (CAP-03): reduced images, rejection of abandoned verifications, planned maintenance.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(13);

-- Two uploads of SIS 06: a JPEG and a PDF, pending, with their quarantine key (created as postgres).
insert into app.asset (id, tenant_id, site_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256) values
  ('06000005-0000-4000-8000-000000000241', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000241/06000005-0000-4000-8000-000000000242',
   'tenants/06000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-000000000241/06000005-0000-4000-8000-000000000242',
   'poteau.jpg', 'image/jpeg', 1024, repeat('b', 64)),
  ('06000005-0000-4000-8000-000000000243', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000243/06000005-0000-4000-8000-000000000244',
   'tenants/06000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-000000000243/06000005-0000-4000-8000-000000000244',
   'consignes.pdf', 'application/pdf', 1024, repeat('c', 64));

-- Reduced images ---------------------------------------------------------------
set local role etare_worker;
select ok(app.worker_complete_asset_verification('06000005-0000-4000-8000-000000000241', 'clean', '{}'),
          'the worker declares the JPEG clean');
select ok(app.worker_complete_asset_verification('06000005-0000-4000-8000-000000000243', 'clean', '{}'),
          'and the PDF');
reset role;
select results_eq(
  $$ select payload ->> 'asset_id' from app.job where job_type = 'asset.thumbnail'
     and payload ->> 'asset_id' like '06000005-0000-4000-8000-00000000024%' $$,
  array['06000005-0000-4000-8000-000000000241'],
  'a clean image, and only an image, gets its reduced versions planned'
);
set local role etare_worker;
select ok(
  app.worker_record_asset_variants('06000005-0000-4000-8000-000000000241', '06000000-0000-4000-8000-000000000000',
    'tenants/06000000-0000-4000-8000-000000000000/thumbnails/06000005-0000-4000-8000-000000000241/06000005-0000-4000-8000-000000000242-320.webp',
    'tenants/06000000-0000-4000-8000-000000000000/thumbnails/06000005-0000-4000-8000-000000000241/06000005-0000-4000-8000-000000000242-1280.webp'),
  'the worker records them'
);
select ok(
  not app.worker_record_asset_variants('06000005-0000-4000-8000-000000000241', '83000000-0000-4000-8000-000000000000',
    'tenants/83000000-0000-4000-8000-000000000000/thumbnails/x-320.webp', 'tenants/83000000-0000-4000-8000-000000000000/thumbnails/x-1280.webp'),
  'never for the asset of another SIS'
);
reset role;
set local role etare_api;
select throws_ok(
  $$ update app.asset set thumbnail_key = null where id = '06000005-0000-4000-8000-000000000241' $$,
  '42501', null,
  'the API cannot change a reduced image'
);
reset role;

-- An upload abandoned for a day, a verification abandoned by the queue ------------------
insert into app.asset (id, tenant_id, site_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256, created_at) values
  ('06000005-0000-4000-8000-000000000245', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000245/06000005-0000-4000-8000-000000000246',
   'tenants/06000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-000000000245/06000005-0000-4000-8000-000000000246',
   'oubli.jpg', 'image/jpeg', 10, repeat('d', 64), now() - interval '2 days'),
  ('06000005-0000-4000-8000-000000000247', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
   'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-000000000247/06000005-0000-4000-8000-000000000248',
   'tenants/06000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-000000000247/06000005-0000-4000-8000-000000000248',
   'recent.jpg', 'image/jpeg', 10, repeat('e', 64), now());
insert into app.job (tenant_id, job_type, payload, idempotency_key, status, attempts, max_attempts)
values ('06000000-0000-4000-8000-000000000000', 'asset.verify',
        '{"asset_id": "06000005-0000-4000-8000-000000000247"}', 'asset.verify:test-247', 'queued', 5, 5);
update app.job set status = 'dead', last_error_code = 'UPLOAD_NOT_RECEIVED' where idempotency_key = 'asset.verify:test-247';
select results_eq(
  $$ select scan_status, scan_detail ->> 'reason' from app.asset where id = '06000005-0000-4000-8000-000000000247' $$,
  $$ values ('rejected'::text, 'VERIFICATION_FAILED'::text) $$,
  'a verification abandoned by the queue rejects its asset'
);

set local role etare_worker;
select set_eq(
  $$ select asset_id::text || ' ' || reason from app.worker_quarantine_to_release(500)
     where asset_id::text like '06000005-0000-4000-8000-00000000024%' $$,
  array['06000005-0000-4000-8000-000000000245 ABANDONED', '06000005-0000-4000-8000-000000000247 REJECTED'],
  'abandoned uploads and rejected ones have their quarantine released; recent or checked ones do not'
);
select ok(
  app.worker_release_quarantine('06000005-0000-4000-8000-000000000245', '06000000-0000-4000-8000-000000000000', 'ABANDONED'),
  'the release is recorded'
);
reset role;
select results_eq(
  $$ select scan_status, scan_detail ->> 'reason', quarantine_key is null from app.asset
     where id = '06000005-0000-4000-8000-000000000245' $$,
  $$ values ('rejected'::text, 'ABANDONED'::text, true) $$,
  'the abandoned upload is rejected and its key forgotten'
);
select is(
  (select actor_type from app.audit_event where action = 'asset.quarantine_purge'
   and entity_id = '06000005-0000-4000-8000-000000000245'),
  'worker',
  'the purge is audited as a worker action'
);

-- Maintenance planned once per slot; a kept PDF is never a candidate ----------------------
set local role etare_worker;
select app.worker_schedule_maintenance('2031-01-01T05');
select app.worker_schedule_maintenance('2031-01-01T05');
reset role;
select is(
  (select count(*) from app.job where job_type = 'maintenance.files' and idempotency_key = 'maintenance.files:2031-01-01T05'),
  1::bigint,
  'one maintenance job per hour slot'
);
insert into app.publication_output (tenant_id, publication_id, storage_key, created_at)
select p.tenant_id, p.id, p.pdf_storage_key, now() - interval '2 hours'
from app.publication p where p.pdf_storage_key is not null
on conflict (storage_key) do nothing;
select is(
  (select count(*) from app.worker_publication_outputs_to_purge(500) o
   where exists (select 1 from app.publication p where p.pdf_storage_key = o.storage_key)),
  0::bigint,
  'the PDF kept by a publication is never a candidate'
);

select * from finish();
rollback;
