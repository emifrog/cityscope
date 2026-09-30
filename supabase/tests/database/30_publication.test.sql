-- Immutable publications: never modified, numbered per site, never replaced by an obsolete build.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(13);

-- Setup (as the migration identity): revision 2 submitted by the editor and approved by the validator.
update app.etare_revision
set status = 'submitted', snapshot = '{"schema_version": 1, "revision": 2}',
    content_hash = encode(extensions.digest('{"revision": 2, "schema_version": 1}', 'sha256'), 'hex'),
    submitted_by = '00000000-0000-4000-b000-000000000002', submitted_at = now()
where id = '0600000d-0000-4000-8000-000000000002';
insert into app.approval (id, tenant_id, site_id, revision_id, revision_hash, decision, actor_id)
select '0600000e-0000-4000-8000-000000000002', tenant_id, site_id, id, content_hash, 'approved', '00000000-0000-4000-b000-000000000003'
from app.etare_revision where id = '0600000d-0000-4000-8000-000000000002';
update app.etare_revision set status = 'approved', decided_at = now() where id = '0600000d-0000-4000-8000-000000000002';

set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset

select throws_like(
  $$ update app.publication set payload = '{"tampered": true}' where id = '0600000f-0000-4000-8000-000000000001' $$,
  '%PUBLICATION_IMMUTABLE%',
  'the payload of a published version cannot be modified'
);

select throws_ok(
  $$ delete from app.publication where id = '0600000f-0000-4000-8000-000000000001' $$,
  '42501', null,
  'a publication cannot be deleted'
);

select throws_ok(
  $$ update app.publication set status = 'building' where id = '0600000f-0000-4000-8000-000000000001' $$,
  '23514', null,
  'a published version cannot go back to building'
);

-- Two concurrent builds (#2 and #3) of the approved revision 2.
select lives_ok(
  $$ insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, idempotency_key)
     values ('0600000f-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '0600000c-0000-4000-8000-000000000001', '0600000d-0000-4000-8000-000000000002', '0600000e-0000-4000-8000-000000000002', 'build-a'),
            ('0600000f-0000-4000-8000-000000000003', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '0600000c-0000-4000-8000-000000000001', '0600000d-0000-4000-8000-000000000002', '0600000e-0000-4000-8000-000000000002', 'build-b') $$,
  'the validator requests two publications'
);

select results_eq(
  $$ select publication_number from app.publication where site_id = '06000002-0000-4000-8000-000000000001' order by publication_number $$,
  array[1, 2, 3],
  'publication numbers are strictly increasing per site'
);

select throws_ok(
  $$ insert into app.publication (tenant_id, site_id, etare_id, revision_id, approval_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '0600000c-0000-4000-8000-000000000001', '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000002') $$,
  '23514', null,
  'a publication requires an approval of the same revision'
);

update app.publication set status = 'building'
where id in ('0600000f-0000-4000-8000-000000000002', '0600000f-0000-4000-8000-000000000003');
update app.publication
set status = 'ready', payload = '{"revision": 2}', manifest = '{"manifest_version": 1}',
    manifest_hash = encode(extensions.digest(id::text, 'sha256'), 'hex'), ready_at = now()
where id in ('0600000f-0000-4000-8000-000000000002', '0600000f-0000-4000-8000-000000000003');

select lives_ok(
  $$ update app.publication set status = 'superseded', superseded_at = now() where id = '0600000f-0000-4000-8000-000000000001' $$,
  'the previous publication is superseded'
);
select lives_ok(
  $$ update app.publication set status = 'published', published_by = app.current_user_id(), published_at = now()
     where id = '0600000f-0000-4000-8000-000000000003' $$,
  'the most recent build (#3) is published'
);
select throws_like(
  $$ update app.publication set status = 'published', published_by = app.current_user_id(), published_at = now()
     where id = '0600000f-0000-4000-8000-000000000002' $$,
  '%OBSOLETE_PUBLICATION%',
  'an obsolete build (#2) can never replace a newer publication'
);

select is(
  (select active_publication_id from app.site where id = '06000002-0000-4000-8000-000000000001'),
  '0600000f-0000-4000-8000-000000000003'::uuid,
  'the site points to the active publication'
);

-- Roles without publication:publish cannot publish.
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
select throws_ok(
  $$ insert into app.publication (tenant_id, site_id, etare_id, revision_id, approval_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '0600000c-0000-4000-8000-000000000001', '0600000d-0000-4000-8000-000000000002', '0600000e-0000-4000-8000-000000000002') $$,
  '42501', null,
  'SIS_ADMIN cannot publish'
);

reset role;
select is(
  (select after_data ->> 'payload' from app.audit_event
   where entity_type = 'publication' and entity_id = '0600000f-0000-4000-8000-000000000003' and action = 'publication.update'
   order by occurred_at desc limit 1),
  '[redacted]',
  'publication payloads are never copied into the audit journal'
);
select is(
  (select actor_user_id from app.audit_event
   where entity_type = 'publication' and entity_id = '0600000f-0000-4000-8000-000000000003' and after_data ->> 'status' = 'published'),
  '00000000-0000-4000-b000-000000000003'::uuid,
  'the publication event records the validator as actor'
);

select * from finish();
rollback;
