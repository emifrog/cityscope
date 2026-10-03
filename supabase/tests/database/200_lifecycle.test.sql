-- Sprint 8: withdrawal of the version in force, archiving and restoring of a site and its dossier (MET-04).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text default 'aal1') returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', p_aal,
                                'bbbbbbbb-0000-4000-8000-000000000200', 'web')
$$;

-- Subjects of the seed: editor 06 (…02), validator 06 (…03), OPS 06 (…04). Site: EHPAD (…02-…01).
select plan(22);

-- A signed version of the EHPAD in force, installed on a terminal.
update app.publication set status = 'superseded', superseded_at = now()
where site_id = '06000002-0000-4000-8000-000000000001' and status = 'published';
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
values ('0600020f-0000-4000-8000-000000000200', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600000c-0000-4000-8000-000000000001',
        '0600000d-0000-4000-8000-000000000001', '0600000e-0000-4000-8000-000000000001',
        '00000000-0000-4000-b000-000000000003');
update app.publication set status = 'building' where id = '0600020f-0000-4000-8000-000000000200';
update app.publication
set status = 'ready', payload = '{"data": {}}'::jsonb, manifest = '{"files": []}'::jsonb, manifest_hash = repeat('6', 64),
    manifest_signature = jsonb_build_object('algorithm', 'Ed25519', 'key_id', 'ed25519-test', 'signature', repeat('A', 86) || '==')
where id = '0600020f-0000-4000-8000-000000000200';
update app.publication set status = 'published', published_at = now(), published_by = '00000000-0000-4000-b000-000000000003'
where id = '0600020f-0000-4000-8000-000000000200';
insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by)
values ('06000010-0000-4000-8000-000000000200', '06000000-0000-4000-8000-000000000000', 'TABLETTE CYCLE DE VIE',
        'active', 'android', 'Zm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyZm9vYmFyMDA=', now(),
        '00000000-0000-4000-b000-000000000004', '00000000-0000-4000-b000-000000000001');
insert into app.device_publication (device_id, tenant_id, site_id, publication_id)
values ('06000010-0000-4000-8000-000000000200', '06000000-0000-4000-8000-000000000000',
        '06000002-0000-4000-8000-000000000001', '0600020f-0000-4000-8000-000000000200');

create temporary table seen (generation bigint) on commit drop;
grant all on seen to etare_api;
insert into seen select generation from app.distribution_generation where tenant_id = '06000000-0000-4000-8000-000000000000';

set local role etare_api;

-- -----------------------------------------------------------------------------
-- Withdrawal (validator, second factor, reason)
-- -----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal2');
select throws_like(
  $$ update app.site set status = 'archived', archive_reason = 'Fermeture'
     where id = '06000002-0000-4000-8000-000000000001' $$,
  '%SITE_PUBLISHED%', 'a site is not archived while a version is in force'
);
update app.publication set status = 'withdrawn', withdrawal_reason = 'Essai' where id = '0600020f-0000-4000-8000-000000000200';
select is((select status from app.publication where id = '0600020f-0000-4000-8000-000000000200'), 'published',
  'an editor does not withdraw a version');

select pg_temp.act_as('00000000-0000-4000-a000-000000000003', 'aal1');
update app.publication set status = 'withdrawn', withdrawal_reason = 'Essai' where id = '0600020f-0000-4000-8000-000000000200';
select is((select status from app.publication where id = '0600020f-0000-4000-8000-000000000200'), 'published',
  'nor a validator without the second factor');

select pg_temp.act_as('00000000-0000-4000-a000-000000000003', 'aal2');
select throws_ok(
  $$ update app.publication set status = 'withdrawn' where id = '0600020f-0000-4000-8000-000000000200' $$,
  '23514', null, 'a withdrawal states its reason'
);
select lives_ok(
  $$ update app.publication set status = 'withdrawn', withdrawal_reason = 'Bâtiment B démoli : plans faux.'
     where id = '0600020f-0000-4000-8000-000000000200' $$,
  'a validator with the second factor withdraws the version in force'
);
reset role;
select results_eq(
  $$ select withdrawn_by, withdrawn_at is not null from app.publication where id = '0600020f-0000-4000-8000-000000000200' $$,
  $$ values ('00000000-0000-4000-b000-000000000003'::uuid, true) $$,
  'who and when are recorded by the database'
);
select is((select active_publication_id from app.site where id = '06000002-0000-4000-8000-000000000001'), null,
  'the site has no version in force any more');
select ok((select generation from app.distribution_generation where tenant_id = '06000000-0000-4000-8000-000000000000')
          > (select generation from seen), 'terminals are told at their next contact');
set local role etare_api;

select pg_temp.act_as('00000000-0000-4000-a000-000000000004');
select is(
  (select e -> 'kind' from jsonb_array_elements(app.sync_catalog('06000010-0000-4000-8000-000000000200', '1.0.0') -> 'withdrawals') e
   where e ->> 'site_id' = '06000002-0000-4000-8000-000000000001'),
  '"withdrawn"'::jsonb, 'the catalogue tells the terminal the version was withdrawn'
);
select is(
  (select e ->> 'reason' from jsonb_array_elements(app.sync_catalog('06000010-0000-4000-8000-000000000200', '1.0.0') -> 'withdrawals') e),
  'Bâtiment B démoli : plans faux.', 'and why'
);
select is(
  (select count(*) from jsonb_array_elements(app.sync_catalog('06000010-0000-4000-8000-000000000200', '1.0.0') -> 'publications') e
   where e ->> 'site_id' = '06000002-0000-4000-8000-000000000001'),
  0::bigint, 'the site is no longer offered'
);

-- -----------------------------------------------------------------------------
-- Archiving (site:write, reason, nothing pending)
-- -----------------------------------------------------------------------------
reset role;
-- A revision submitted to a validator (the open draft of the seed, or a new one).
insert into app.etare_revision (tenant_id, site_id, etare_id, revision_no, created_by, change_summary)
select '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
       '0600000c-0000-4000-8000-000000000001', max(revision_no) + 1, '00000000-0000-4000-b000-000000000002', 'Test 200'
from app.etare_revision where etare_id = '0600000c-0000-4000-8000-000000000001'
having not exists (select 1 from app.etare_revision
                   where etare_id = '0600000c-0000-4000-8000-000000000001' and status in ('draft', 'submitted'));
update app.etare_revision
set status = 'submitted', snapshot = '{}'::jsonb, content_hash = repeat('5', 64),
    submitted_by = '00000000-0000-4000-b000-000000000002', submitted_at = now()
where etare_id = '0600000c-0000-4000-8000-000000000001' and status = 'draft';
set local role etare_api;

select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select throws_like(
  $$ update app.site set status = 'archived', archive_reason = 'Fermeture'
     where id = '06000002-0000-4000-8000-000000000001' $$,
  '%SITE_REVISION_SUBMITTED%', 'nor while a revision waits for a validator'
);

reset role;
insert into app.approval (tenant_id, site_id, revision_id, revision_hash, decision, actor_id, comment)
select tenant_id, site_id, id, content_hash, 'changes_requested', '00000000-0000-4000-b000-000000000003', 'Test 200'
from app.etare_revision where etare_id = '0600000c-0000-4000-8000-000000000001' and status = 'submitted';
update app.etare_revision set status = 'changes_requested', decided_at = now()
where etare_id = '0600000c-0000-4000-8000-000000000001' and status = 'submitted';
set local role etare_api;

select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select lives_ok(
  $$ insert into app.etare_revision (tenant_id, site_id, etare_id, revision_no, change_summary)
     select '06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
            '0600000c-0000-4000-8000-000000000001', max(revision_no) + 1, 'Brouillon à clore'
     from app.etare_revision where etare_id = '0600000c-0000-4000-8000-000000000001' $$,
  'an editor opens a draft'
);
select throws_ok(
  $$ update app.site set status = 'archived' where id = '06000002-0000-4000-8000-000000000001' $$,
  '23514', null, 'an archiving states its reason'
);
select lives_ok(
  $$ update app.site set status = 'archived', archive_reason = 'Établissement fermé définitivement.'
     where id = '06000002-0000-4000-8000-000000000001' $$,
  'once nothing is in force nor pending, the site is archived'
);
select is(
  (select count(*) from app.etare_revision where etare_id = '0600000c-0000-4000-8000-000000000001' and status = 'draft'),
  0::bigint, 'its open draft is closed'
);
select is((select status from app.etare where id = '0600000c-0000-4000-8000-000000000001'), 'archived',
  'its dossier is archived');
select throws_like(
  $$ insert into app.etare_revision (tenant_id, site_id, etare_id, revision_no)
     values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
             '0600000c-0000-4000-8000-000000000001', 999) $$,
  '%SITE_ARCHIVED%', 'no revision starts on an archived site'
);
select throws_ok(
  $$ update app.site set archived_by = null where id = '06000002-0000-4000-8000-000000000001' $$,
  '42501', null, 'who archived and when are recorded by the database'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000004');
select is(
  (select e ->> 'kind' from jsonb_array_elements(app.sync_catalog('06000010-0000-4000-8000-000000000200', '1.0.0') -> 'withdrawals') e
   where e ->> 'site_id' = '06000002-0000-4000-8000-000000000001'),
  'archived', 'the catalogue tells the terminal the site was archived'
);

select pg_temp.act_as('00000000-0000-4000-a000-000000000002');
select lives_ok(
  $$ update app.site set status = 'active' where id = '06000002-0000-4000-8000-000000000001' $$,
  'an editor restores the site'
);
select results_eq(
  $$ select s.archived_at is null and s.archive_reason is null, e.status
     from app.site s join app.etare e on e.id = '0600000c-0000-4000-8000-000000000001'
     where s.id = '06000002-0000-4000-8000-000000000001' $$,
  $$ values (true, 'active'::text) $$,
  'its dossier is active again, the history kept in the audit'
);

select * from finish();
rollback;
