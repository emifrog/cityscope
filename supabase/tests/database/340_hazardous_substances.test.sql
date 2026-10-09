-- Sprint 14 (RISK-03, ADR-032): hazardous substances of a site and their safety data sheets.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', null, 'web')
$$;

select plan(17);

-- Sheets: an FDS of the EHPAD, a notice of the EHPAD, an FDS of another site of the SIS.
insert into app.document (id, tenant_id, site_id, category, title) values
  ('0600000a-0000-4000-8000-0000000000f1', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'fds', 'FDS oxygène'),
  ('0600000a-0000-4000-8000-0000000000f2', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'notice', 'Notice chaudière'),
  ('0600000a-0000-4000-8000-0000000000f3', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000002', 'fds', 'FDS ailleurs');

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');

select lives_ok(
  $$ insert into app.hazardous_substance (id, tenant_id, site_id, name, hazard_classes, un_number, physical_state, quantity, unit,
                                          zone_id, location_note, fds_document_id)
     values ('0600000c-0000-4000-8000-0000000000a1', '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             'Oxygène médical', '{GHS03,GHS04}', '1072', 'gas', 18, 'bouteilles',
             '06000008-0000-4000-8000-000000000002', 'Armoire de la pharmacie', '0600000a-0000-4000-8000-0000000000f1') $$,
  'an editor declares a substance with its classes, quantity, location and sheet'
);
select results_eq(
  $$ select building_id, level_id from app.hazardous_substance where id = '0600000c-0000-4000-8000-0000000000a1' $$,
  $$ values ('06000003-0000-4000-8000-000000000001'::uuid, '06000004-0000-4000-8000-000000000002'::uuid) $$,
  'the level and the building follow the zone'
);
select throws_ok(
  $$ insert into app.hazardous_substance (tenant_id, site_id, name, zone_id, building_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Contradiction',
             '06000008-0000-4000-8000-000000000002', '06000003-0000-4000-8000-000000000002') $$,
  '23514', null, 'a zone of building A cannot be declared in building B'
);
select throws_ok(
  $$ insert into app.hazardous_substance (tenant_id, site_id, name, hazard_classes)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Classe inconnue', '{GHS10}') $$,
  '23514', null, 'hazard classes are the nine CLP pictograms'
);
select throws_ok(
  $$ insert into app.hazardous_substance (tenant_id, site_id, name, quantity)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Sans unité', 3) $$,
  '23514', null, 'a quantity comes with its unit'
);
select throws_ok(
  $$ insert into app.hazardous_substance (tenant_id, site_id, name, un_number)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'ONU', '12A4') $$,
  '23514', null, 'a UN number has four digits'
);
select throws_ok(
  $$ insert into app.hazardous_substance (tenant_id, site_id, name, fds_document_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Notice',
             '0600000a-0000-4000-8000-0000000000f2') $$,
  '23514', null, 'the sheet is a document classed FDS, not a notice'
);
select throws_ok(
  $$ insert into app.hazardous_substance (tenant_id, site_id, name, fds_document_id)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Ailleurs',
             '0600000a-0000-4000-8000-0000000000f3') $$,
  '23514', null, 'the sheet is a document of the same site'
);
select lives_ok(
  $$ update app.hazardous_substance set quantity = 20, unit = 'bouteilles', fds_document_id = null
     where id = '0600000c-0000-4000-8000-0000000000a1' $$,
  'the quantity can be corrected and the sheet detached'
);
select throws_ok(
  $$ delete from app.hazardous_substance where id = '0600000c-0000-4000-8000-0000000000a1' $$,
  '42501', null, 'substances are archived, never deleted'
);

-- Separation of duties: the edit counts for the revision of the site.
select ok(
  exists (select 1 from app.site_edit where site_id = '06000002-0000-4000-8000-000000000001'
          and user_id = (select id from app.user_account where auth_subject = '00000000-0000-4000-a000-000000000002')),
  'declaring a substance makes the editor a contributor of the site'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000006', '06000000-0000-4000-8000-000000000000');
select ok(
  (select count(*) from app.hazardous_substance where site_id = '06000002-0000-4000-8000-000000000001' and status = 'active') >= 3,
  'a reader of the site sees its substances (two of the seed, one of the test)'
);
select throws_ok(
  $$ insert into app.hazardous_substance (tenant_id, site_id, name)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001', 'Lecteur') $$,
  '42501', null, 'a reader cannot declare substances'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000007', '83000000-0000-4000-8000-000000000000');
select is((select count(*) from app.hazardous_substance), 0::bigint, 'another SIS sees none of these substances');

select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');
select lives_ok(
  $$ update app.hazardous_substance set status = 'archived' where id = '0600000c-0000-4000-8000-0000000000a1' $$,
  'an editor archives a substance'
);
select throws_ok(
  $$ update app.hazardous_substance set status = 'active' where id = '0600000c-0000-4000-8000-0000000000a1' $$,
  '23514', null, 'an archived substance stays archived'
);

reset role;
select is(
  (select count(*) from app.audit_event where entity_type = 'hazardous_substance'
     and entity_id = '0600000c-0000-4000-8000-0000000000a1'),
  3::bigint, 'declaration, correction and archiving are audited'
);

select * from finish();
rollback;
