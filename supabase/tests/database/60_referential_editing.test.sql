-- Sprint 1: editable referential, working-data authorship and separation of duties.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(16);

-- The validator of SDIS DEMO 06 also receives the editor role (cumulated roles).
insert into app.role_binding (tenant_id, membership_id, role_id)
select '06000000-0000-4000-8000-000000000000', '0600000a-0000-4000-8000-000000000003', id
from app.role where code = 'PREVISION_EDITOR';

-- ---------------------------------------------------------------- editor edits
set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') is not null as ctx \gset

update app.site set short_name = 'Oliviers' where id = '06000002-0000-4000-8000-000000000001';
select is(
  (select count(*) from app.site_edit where site_id = '06000002-0000-4000-8000-000000000001'
     and user_id = '00000000-0000-4000-b000-000000000002'),
  1::bigint,
  'editing a site records its author (maintained by PostgreSQL)'
);

select throws_ok(
  $$ insert into app.site_edit (tenant_id, site_id, user_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', '00000000-0000-4000-b000-000000000004') $$,
  '42501', null,
  'the API cannot write authorship itself'
);

select lives_ok(
  $$ insert into app.contact (tenant_id, site_id, name, role, phone)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Loge gardien (test)', 'Gardiennage', '04 00 00 00 00') $$,
  'an editor adds a contact'
);
select is(
  (select visibility from app.contact where name = 'Loge gardien (test)'),
  'prevision',
  'a contact is internal by default (least exposure)'
);
select throws_ok(
  $$ insert into app.contact (tenant_id, site_id, name) values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Sans téléphone') $$,
  '23502', null,
  'a contact without phone is refused'
);
select throws_ok(
  $$ insert into app.contact (tenant_id, site_id, name, phone) values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Mauvais numéro', 'appelez-moi') $$,
  '23514', null,
  'a malformed phone number is refused'
);

select lives_ok(
  $$ insert into app.site_classification (tenant_id, site_id, classification_type, code, category, valid_from)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'ERP', 'J', '3', '2020-01-01') $$,
  'an editor adds a dated classification'
);
select throws_ok(
  $$ insert into app.site_classification (tenant_id, site_id, classification_type, valid_from, valid_to)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'IGH', '2025-01-01', '2024-01-01') $$,
  '23514', null,
  'a classification cannot end before it starts'
);

select lives_ok(
  $$ insert into app.external_identifier (tenant_id, site_id, entity_type, entity_id, system_code, external_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'site',
             '06000002-0000-4000-8000-000000000001', 'SIG', 'SIG-06-0001') $$,
  'an editor records the SIG identifier of the site'
);
select throws_ok(
  $$ insert into app.external_identifier (tenant_id, site_id, entity_type, entity_id, system_code, external_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000002', 'site',
             '06000002-0000-4000-8000-000000000002', 'SIG', 'SIG-06-0001') $$,
  '23505', null,
  'an external identifier is unique per system within the SIS'
);
select throws_ok(
  $$ insert into app.external_identifier (tenant_id, site_id, entity_type, entity_id, system_code, external_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000002', 'building',
             '06000003-0000-4000-8000-000000000001', 'SIG', 'SIG-BAT-A') $$,
  '23503', null,
  'an external identifier cannot target a building of another site'
);

-- ---------------------------------------------------------------- another SIS
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000007', '83000000-0000-4000-8000-000000000000', 'aal1', null, 'web') is not null as ctx \gset
select is(
  (select count(*) from app.contact) + (select count(*) from app.site_classification) + (select count(*) from app.external_identifier),
  0::bigint,
  'SDIS DEMO 83 sees none of the contacts, classifications or identifiers of SDIS DEMO 06'
);

-- ---------------------------------------------------------------- separation of duties on working data
-- The validator (who also holds the editor role) edits a building of the site.
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
update app.building set notes = 'Accès par la façade A' where id = '06000003-0000-4000-8000-000000000001';

-- The editor submits the open draft revision.
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
update app.etare_revision
set status = 'submitted', snapshot = '{"schema_version": 1, "revision": 2}',
    content_hash = encode(extensions.digest('{"revision": 2, "schema_version": 1}', 'sha256'), 'hex'),
    submitted_by = app.current_user_id(), submitted_at = now()
where id = '0600000d-0000-4000-8000-000000000002';

select set_eq(
  $$ select user_id from app.etare_revision_contributor where revision_id = '0600000d-0000-4000-8000-000000000002' $$,
  array['00000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000003']::uuid[],
  'every author of working changes since the last approved revision becomes a contributor'
);

select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
select throws_like(
  $$ insert into app.approval (tenant_id, site_id, revision_id, revision_hash, decision)
     select tenant_id, site_id, id, content_hash, 'approved' from app.etare_revision where id = '0600000d-0000-4000-8000-000000000002' $$,
  '%SELF_APPROVAL_FORBIDDEN%',
  'a validator who edited the working data cannot approve the revision'
);

-- ---------------------------------------------------------------- publishing is not authorship
reset role;
delete from app.site_edit where site_id = '06000002-0000-4000-8000-000000000001';
insert into app.approval (id, tenant_id, site_id, revision_id, revision_hash, decision, actor_id)
select '0600000e-0000-4000-8000-000000000002', tenant_id, site_id, id, content_hash, 'approved', '00000000-0000-4000-b000-000000000001'
from app.etare_revision where id = '0600000d-0000-4000-8000-000000000002';
update app.etare_revision set status = 'approved', decided_at = now() where id = '0600000d-0000-4000-8000-000000000002';

set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id)
values ('0600000f-0000-4000-8000-000000000002', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
        '0600000c-0000-4000-8000-000000000001', '0600000d-0000-4000-8000-000000000002', '0600000e-0000-4000-8000-000000000002');
update app.publication set status = 'building' where id = '0600000f-0000-4000-8000-000000000002';
update app.publication set status = 'ready', payload = '{"revision": 2}', manifest = '{"manifest_version": 1}',
  manifest_hash = encode(extensions.digest('m2', 'sha256'), 'hex'), ready_at = now()
where id = '0600000f-0000-4000-8000-000000000002';
update app.publication set status = 'superseded', superseded_at = now() where id = '0600000f-0000-4000-8000-000000000001';
update app.publication set status = 'published', published_by = app.current_user_id(), published_at = now()
where id = '0600000f-0000-4000-8000-000000000002';

select is(
  (select active_publication_id from app.site where id = '06000002-0000-4000-8000-000000000001'),
  '0600000f-0000-4000-8000-000000000002'::uuid,
  'the site points to the new publication'
);
select is(
  (select count(*) from app.site_edit where site_id = '06000002-0000-4000-8000-000000000001'),
  0::bigint,
  'publishing (system pointer update) does not make the validator an author'
);

select * from finish();
rollback;
