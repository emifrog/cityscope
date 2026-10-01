-- Sprint 7: what an exploitant reads of their sites — a whitelist of the published version (POR-02, ADR-019).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', p_aal,
                                'bbbbbbbb-0000-4000-8000-000000000160', 'web')
$$;

-- Subjects of the seed: editor 06 (…02), exploitant of the EHPAD (…05). Sites: EHPAD (…02-…01), warehouse (…02-…02).
create function pg_temp.seen() returns jsonb
language sql as $$ select app.portal_site('06000002-0000-4000-8000-000000000001') $$;

select plan(21);

select col_default_is('app', 'document', 'portal_visible', 'false', 'documents are not shown to the exploitant by default');

-- Two checked files of the EHPAD: a notice shown to the exploitant, internal instructions that are not.
insert into app.asset (id, tenant_id, site_id, storage_key, quarantine_key, filename, mime_type, size_bytes, sha256,
                       scan_status, verified_at)
select ('06000005-0000-4000-8000-0000000016' || n)::uuid, '06000000-0000-4000-8000-000000000000',
       '06000002-0000-4000-8000-000000000001',
       'tenants/06000000-0000-4000-8000-000000000000/assets/06000005-0000-4000-8000-0000000016' || n || '/v',
       'tenants/06000000-0000-4000-8000-000000000000/quarantine/06000005-0000-4000-8000-0000000016' || n || '/v',
       filename, 'application/pdf', 1024, repeat(n, 32), 'clean', now()
from (values ('a1', 'notice-ssi.pdf'), ('a2', 'consignes-internes.pdf')) as files(n, filename);

-- A version of the EHPAD as the worker builds it (payload.data = canonical snapshot).
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
values ('0600016f-0000-4000-8000-000000000160', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000001',
        '00000000-0000-4000-b000-000000000003');
update app.publication set status = 'building' where id = '0600016f-0000-4000-8000-000000000160';
update app.publication
set status = 'ready', manifest = '{"files": []}'::jsonb, manifest_hash = repeat('7', 64),
    payload = jsonb_build_object('schema_version', 1, 'data', $json$ {
      "site": {"id": "06000002-0000-4000-8000-000000000001", "name": "EHPAD Les Mimosas", "short_name": "Mimosas",
               "etare_number": "06-0428", "site_type": "health", "status": "active", "sensitivity": "normal",
               "address": {"label": "12 avenue des Fleurs 06000 Nice", "street": "12 avenue des Fleurs",
                           "postal_code": "06000", "city": "Nice", "insee_code": "06088"},
               "location": {"type": "Point", "coordinates": [7.26, 43.7]}, "footprint": null},
      "classifications": [{"id": "06000016-0000-4000-8000-0000000000c1", "classification_type": "ERP", "code": "J",
                           "category": "4", "label": "ERP type J", "valid_from": null, "valid_to": null,
                           "source": "arrêté interne"}],
      "buildings": [{"id": "06000016-0000-4000-8000-0000000000b1", "name": "Bâtiment A", "sort_order": 0,
                     "levels": [{"id": "06000016-0000-4000-8000-0000000000e1", "name": "Rez-de-chaussée"}]}],
      "contacts": [{"id": "06000016-0000-4000-8000-0000000000d1", "name": "Accueil", "role": "Direction",
                    "phone": "+33493000000", "phone_alt": null, "email": "accueil@ehpad.test",
                    "availability": "24 h/24", "sort_order": 0, "verified_at": null}],
      "plans": [{"id": "06000016-0000-4000-8000-0000000000f1", "title": "Plan du rez-de-chaussée", "plan_type": "level",
                 "building_id": "06000016-0000-4000-8000-0000000000b1", "level_id": "06000016-0000-4000-8000-0000000000e1",
                 "background": {"revision_id": "06000016-0000-4000-8000-0000000000f2", "revision_no": 2, "page_number": 1,
                                "width": 1000, "height": 800,
                                "asset": {"id": "06000016-0000-4000-8000-0000000000f3", "filename": "fond-rdc.png",
                                          "mime_type": "image/png", "size_bytes": 10, "sha256": "SECRET-BACKGROUND"}}}],
      "zones": [{"id": "06000016-0000-4000-8000-0000000000a9", "name": "Zone SECRET-ZONE"}],
      "objects": [{"id": "06000016-0000-4000-8000-0000000000a1", "type_code": "KEY_BOX", "name": "Boîte à clés",
                   "properties": {"code": "SECRET-CODE"}, "instructions": "Code SECRET-CODE"}],
      "risks": [{"id": "06000016-0000-4000-8000-0000000000a2", "label": "SECRET-RISK oxygène"}],
      "documents": [
        {"id": "06000016-0000-4000-8000-0000000000d7", "title": "Notice SSI", "category": "notice",
         "offline_policy": "never", "portal_visible": true,
         "version": {"id": "06000016-0000-4000-8000-0000000000d8", "version_no": 3, "valid_from": "2026-01-01", "expires_at": null,
                     "asset": {"id": "06000005-0000-4000-8000-0000000016a1", "filename": "notice-ssi.pdf",
                               "mime_type": "application/pdf", "size_bytes": 1024,
                               "sha256": "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"}}},
        {"id": "06000016-0000-4000-8000-0000000000d9", "title": "SECRET-DOC consignes internes", "category": "instruction",
         "offline_policy": "always",
         "version": {"id": "06000016-0000-4000-8000-0000000000da", "version_no": 1, "valid_from": null, "expires_at": null,
                     "asset": {"id": "06000005-0000-4000-8000-0000000016a2", "filename": "consignes-internes.pdf",
                               "mime_type": "application/pdf", "size_bytes": 1024,
                               "sha256": "a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2"}}}
      ],
      "catalog": {"object_types": [], "risk_types": []}
    } $json$::jsonb)
where id = '0600016f-0000-4000-8000-000000000160';
update app.publication set status = 'superseded', superseded_at = now()
where site_id = '06000002-0000-4000-8000-000000000001' and status = 'published';
update app.publication set status = 'published', published_at = now(), published_by = '00000000-0000-4000-b000-000000000003'
where id = '0600016f-0000-4000-8000-000000000160';

set local role etare_api;

-- Second factor required by default (POR-01): nothing without it.
select pg_temp.act_as('00000000-0000-4000-a000-000000000005', 'aal1');
select is((select count(*) from app.portal_sites()), 0::bigint, 'without the second factor, no site is listed');
select is(app.portal_site('06000002-0000-4000-8000-000000000001'), null, 'nor shown');

select pg_temp.act_as('00000000-0000-4000-a000-000000000005', 'aal2');
select results_eq(
  $$ select id, name, publication_number > 0 and published_at is not null from app.portal_sites() $$,
  $$ values ('06000002-0000-4000-8000-000000000001'::uuid, 'EHPAD Les Mimosas'::text, true) $$,
  'the exploitant lists their site only, with its published version'
);


select set_eq(
  $$ select jsonb_object_keys(v) from pg_temp.seen() as v $$,
  array['id', 'name', 'short_name', 'etare_number', 'site_type', 'address', 'access_until', 'publication',
        'classifications', 'contacts', 'plans', 'documents'],
  'the view is a whitelist: no buildings, objects, risks, zones, geometry nor catalogue'
);
select set_eq($$ select jsonb_object_keys(v -> 'address') from pg_temp.seen() as v $$, array['label', 'street', 'postal_code', 'city'],
  'the address, without anything else');
select is((select v #>> '{classifications,0,label}' from pg_temp.seen() as v), 'ERP type J', 'the classification is shown');
select set_eq($$ select jsonb_object_keys(v #> '{contacts,0}') from pg_temp.seen() as v $$,
  array['name', 'role', 'phone', 'phone_alt', 'email', 'availability', 'verified_at'],
  'contacts: who to call, nothing else');
select is((select v #> '{plans,0}' from pg_temp.seen() as v),
  '{"id": "06000016-0000-4000-8000-0000000000f1", "title": "Plan du rez-de-chaussée", "plan_type": "level",
    "building_name": "Bâtiment A", "level_name": "Rez-de-chaussée", "revision_no": 2}'::jsonb,
  'plans: titles and places, never their images');
select is((select jsonb_agg(d ->> 'title') from pg_temp.seen() as v, jsonb_array_elements(v -> 'documents') d), '["Notice SSI"]'::jsonb,
  'only the documents the SIS marked visible');
select is((select v #>> '{documents,0,filename}' from pg_temp.seen() as v), 'notice-ssi.pdf', 'with their file name');
select ok((select v::text not like '%SECRET%' from pg_temp.seen() as v), 'no code, risk, zone, background nor hidden document leaks');

select results_eq(
  $$ select asset_id, filename from app.portal_document_file('06000002-0000-4000-8000-000000000001',
                                                             '06000016-0000-4000-8000-0000000000d7') $$,
  $$ values ('06000005-0000-4000-8000-0000000016a1'::uuid, 'notice-ssi.pdf'::text) $$,
  'a visible document can be downloaded'
);
select is_empty(
  $$ select * from app.portal_document_file('06000002-0000-4000-8000-000000000001', '06000016-0000-4000-8000-0000000000d9') $$,
  'a document not marked visible cannot'
);
select is(app.portal_site('06000002-0000-4000-8000-000000000002'), null, 'another site of the SIS is never shown');

-- Back-office people do not read through the portal (no portal:read).
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal2');
select is((select count(*) from app.portal_sites()), 0::bigint, 'an editor has no portal sites');
select is(app.portal_site('06000002-0000-4000-8000-000000000001'), null, 'nor a portal view');
select lives_ok(
  $$ update app.document set portal_visible = true
     where id = (select id from app.document where site_id = '06000002-0000-4000-8000-000000000001' limit 1) $$,
  'the Prévision marks a working document visible (it shows once published)'
);

-- A withdrawn version: the site stays listed, without content.
reset role;
update app.publication set status = 'withdrawn', withdrawn_at = now(), withdrawal_reason = 'Retrait de test.'
where id = '0600016f-0000-4000-8000-000000000160';
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000005', 'aal2');
select is((select publication_number from app.portal_sites()), null, 'without a published version, the site stays listed');
select is(app.portal_site('06000002-0000-4000-8000-000000000001') -> 'documents', '[]'::jsonb, 'with nothing to read');
select is_empty(
  $$ select * from app.portal_document_file('06000002-0000-4000-8000-000000000001', '06000016-0000-4000-8000-0000000000d7') $$,
  'and nothing to download'
);

select * from finish();
rollback;
