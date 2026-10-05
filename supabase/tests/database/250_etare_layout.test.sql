-- Sprint 10 (MET-05): sections of the ETARE hidden by the SIS (DEC-05, ADR-026).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_tenant uuid) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, 'aal1', 'bbbbbbbb-0000-4000-8000-000000000250', 'web')
$$;

-- Subjects of the seed: admin 06 (…01), editor 06 (…02), editor 83 (…07).
select plan(8);

set local role etare_api;

select pg_temp.act_as('00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000');
select is(
  (select hidden_sections from app.etare_layout_settings()),
  '{}'::text[],
  'every section is shown by default'
);
select is(
  app.update_etare_layout_settings(array['photos', 'energy', 'photos']),
  array['energy', 'photos'],
  'the administration hides optional sections, stored once each in the order of the registry'
);
select throws_ok(
  $$ select app.update_etare_layout_settings(array['water']) $$,
  '22023', null,
  'a mandatory section is never hidden'
);
select throws_ok(
  $$ select app.update_etare_layout_settings(null) $$,
  '22023', null,
  'the setting is a list'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000');
select is(
  (select hidden_sections from app.etare_layout_settings()),
  array['energy', 'photos'],
  'an editor reads the setting to freeze it into the revisions'
);
select throws_ok(
  $$ select app.update_etare_layout_settings('{}') $$,
  '42501', null,
  'an editor does not change it (catalog:manage)'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000007', '83000000-0000-4000-8000-000000000000');
select is(
  (select hidden_sections from app.etare_layout_settings()),
  '{}'::text[],
  'the setting belongs to its SIS'
);

reset role;
select is(
  (select metadata from app.audit_event
   where action = 'tenant.etare_layout' and trace_id = 'bbbbbbbb-0000-4000-8000-000000000250'),
  '{"after": ["energy", "photos"], "before": []}'::jsonb,
  'the change is audited with the setting before and after'
);

select * from finish();
