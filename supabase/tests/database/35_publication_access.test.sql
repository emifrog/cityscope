begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(8);

-- Add a valid queued publication beside the published seed, without changing its contents.
insert into app.publication (id, tenant_id, site_id, etare_id, revision_id, approval_id, requested_by)
select '0600000f-0000-4000-8000-000000000099', tenant_id, site_id, etare_id, revision_id, approval_id, requested_by
from app.publication where id = '0600000f-0000-4000-8000-000000000001';

set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'mobile') is not null as ctx \gset
select is((select count(*) from app.publication where status = 'published'), 1::bigint,
  'OPS can read the active publication');
select is((select count(*) from app.publication where status <> 'published'), 0::bigint,
  'OPS cannot read queued or unfinished publications');
select is((select count(*) from app.etare_revision), 0::bigint,
  'OPS cannot read working revisions');

select app.begin_request('supabase', '00000000-0000-4000-a000-000000000003', '06000000-0000-4000-8000-000000000000', 'aal2', null, 'web') is not null as ctx \gset
select is((select count(*) from app.publication where status = 'queued'), 1::bigint,
  'the validator can still inspect preparation states');
select throws_like(
  $$ update app.publication set published_at = now() where id = '0600000f-0000-4000-8000-000000000001' $$,
  '%PUBLICATION_IMMUTABLE%', 'the publication date cannot be rewritten');
select throws_like(
  $$ update app.publication set published_by = '00000000-0000-4000-b000-000000000001' where id = '0600000f-0000-4000-8000-000000000001' $$,
  '%PUBLICATION_IMMUTABLE%', 'the publication author cannot be rewritten');

reset role;
select throws_ok(
  $$ update app.site set active_publication_id = '0600000f-0000-4000-8000-000000000001'
     where tenant_id = '06000000-0000-4000-8000-000000000000' and id <> '06000002-0000-4000-8000-000000000001' $$,
  '23503', null, 'a site cannot point to another site publication within the same SIS');
update app.publication set status = 'withdrawn', withdrawn_at = now(), withdrawal_reason = 'Synthetic test'
where id = '0600000f-0000-4000-8000-000000000001';
set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000004', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'mobile') is not null as ctx \gset
select is((select count(*) from app.publication), 0::bigint,
  'OPS no longer receives a withdrawn publication');

select * from finish();
rollback;
