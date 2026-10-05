-- Sprint 10 (PER-02): sensitive sites — habilitation, on-demand distribution, journal (DEC-04, ADR-025).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text default 'aal2') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', p_aal,
                                'bbbbbbbb-0000-4000-8000-000000000270', 'web')
$$;
create function pg_temp.version_of(p_membership uuid) returns integer
language sql as $$ select row_version from app.membership where id = p_membership $$;
create function pg_temp.publication_of(p_site uuid, p_sensitivity text) returns app.publication
language sql as $$
  select jsonb_populate_record(null::app.publication, jsonb_build_object(
    'tenant_id', '06000000-0000-4000-8000-000000000000', 'site_id', p_site, 'status', 'published',
    'sensitivity', p_sensitivity, 'manifest_signature', jsonb_build_object('algorithm', 'Ed25519')))
$$;

-- Seed: EHPAD Nice (…02-…01, normal), warehouse Antibes (…02-…02, restricted); sectors CIS Nice Centre
-- (…1a-…01), CIS Antibes (…1a-…02). Members: admin (…01), editor (…02), OPS (…04, membership 0600000a-…04).
select plan(19);

select is(
  array[app.effective_sensitivity('normal', 'normal'), app.effective_sensitivity('normal', 'restricted'),
        app.effective_sensitivity('restricted', 'high'), app.effective_sensitivity('high', 'normal')],
  array['normal', 'restricted', 'high', 'high'],
  'the most restrictive of the published version and of the site now'
);

set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select app.admin_create_device('PGTAP SENSIBLE', repeat('d', 64), now() + interval '1 day') as device_id \gset

-- Habilitation: nominative, dated, by the administration only.
select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select throws_ok(
  $$ select app.admin_set_sensitive_access('0600000a-0000-4000-8000-000000000004', 1, '{}', now() + interval '30 days') $$,
  '42501', null,
  'an editor does not grant the habilitation'
);
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select throws_ok(
  $$ select app.admin_set_sensitive_access('0600000a-0000-4000-8000-000000000004',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000004'), '{}', now() + interval '400 days') $$,
  'ETHAB', null,
  'a habilitation lasts twelve months at most'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000004', 'aal1');
select ok(not app.holds_sensitive_access('06000002-0000-4000-8000-000000000002'), 'without habilitation, no access');
select is(
  array[app.distributable_publication(pg_temp.publication_of('06000002-0000-4000-8000-000000000001', 'normal'), :'device_id'),
        app.distributable_publication(pg_temp.publication_of('06000002-0000-4000-8000-000000000002', 'normal'), :'device_id')],
  array[true, false],
  'a site restricted now is no longer distributed, even through a version published as normal'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select lives_ok(
  $$ select app.admin_set_sensitive_access('0600000a-0000-4000-8000-000000000004',
       pg_temp.version_of('0600000a-0000-4000-8000-000000000004'), array['0600001a-0000-4000-8000-000000000002'::uuid],
       now() + interval '30 days') $$,
  'the administration grants the habilitation for the sector of Antibes, for thirty days'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000004', 'aal1');
select ok(app.holds_sensitive_access('06000002-0000-4000-8000-000000000002'), 'the habilitation covers the sites of its sector');
select ok(not app.holds_sensitive_access('06000002-0000-4000-8000-000000000001'), 'and only them');
select is(
  array[app.distributable_publication(pg_temp.publication_of('06000002-0000-4000-8000-000000000002', 'restricted'), :'device_id'),
        app.distributable_publication(pg_temp.publication_of('06000002-0000-4000-8000-000000000002', 'high'), :'device_id')],
  array[true, false],
  'a restricted site is served on demand to the habilitated person; a high one never'
);

-- Journal: sensitive sites only, web views counted once per five minutes, tablet events idempotent.
select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select is(app.record_site_access('06000002-0000-4000-8000-000000000001', null, 'view'), 'normal',
  'a normal site is not journaled');
select is(app.record_site_access('06000002-0000-4000-8000-000000000002', null, 'view'), 'restricted',
  'a consultation of a restricted site is journaled');
select is(app.record_site_access('06000002-0000-4000-8000-000000000002', null, 'view'), 'restricted',
  'again within five minutes');
select is(app.record_site_access('06000002-0000-4000-8000-000000000002', null, 'export'), 'restricted',
  'an export is journaled');
select pg_temp.act_as('00000000-0000-4000-a000-000000000004', 'aal1');
select lives_ok(
  format($$ select app.record_site_access('06000002-0000-4000-8000-000000000002', null, 'view', %L,
            'eeeeeeee-0000-4000-8000-000000000270', now() - interval '1 hour'),
          app.record_site_access('06000002-0000-4000-8000-000000000002', null, 'view', %L,
            'eeeeeeee-0000-4000-8000-000000000270', now() - interval '1 hour') $$, :'device_id', :'device_id'),
  'a tablet event sent twice'
);
select is(app.record_site_access('83000002-0000-4000-8000-000000000001', null, 'view'), null,
  'a site of another SIS is unknown');

select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select is((select count(*) from app.access_journal(null, null, null, 50)), 0::bigint,
  'the journal needs audit:read');
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
select results_eq(
  $$ select action, origin, device_name is not null from app.access_journal('06000002-0000-4000-8000-000000000002', null, null, 50)
     where occurred_at > now() - interval '2 hours' order by action, origin $$,
  $$ values ('export'::text, 'web'::text, false), ('view', 'web', false), ('view', 'web', true) $$,
  'the administration reads one web view, one export and one tablet view'
);

reset role;
select throws_ok(
  $$ update app.access_event set action = 'view' $$,
  '42501', null,
  'the journal is append-only'
);

select app.touch_distribution_generation('06000000-0000-4000-8000-000000000000');
select g.generation as generation_before from app.distribution_generation g
where g.tenant_id = '06000000-0000-4000-8000-000000000000' \gset
update app.site set sensitivity = 'high' where id = '06000002-0000-4000-8000-000000000001';
select is(
  (select generation from app.distribution_generation where tenant_id = '06000000-0000-4000-8000-000000000000'),
  :'generation_before'::bigint + 1,
  'a site raised to sensitive moves the catalogue generation: terminals drop it at their next contact'
);

select * from finish();
