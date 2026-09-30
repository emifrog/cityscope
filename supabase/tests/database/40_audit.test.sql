-- Append-only audit journal.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(10);

set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000002', '06000000-0000-4000-8000-000000000000', 'aal1',
                         'aaaaaaaa-0000-4000-8000-000000000001', 'web') is not null as ctx \gset

update app.site set short_name = 'Oliviers (audit)' where id = '06000002-0000-4000-8000-000000000001';

reset role;
select results_eq(
  $$ select actor_user_id, actor_type, origin, trace_id, before_data ->> 'short_name', after_data ->> 'short_name', tenant_id
     from app.audit_event where action = 'site.update' and trace_id = 'aaaaaaaa-0000-4000-8000-000000000001' $$,
  $$ values ('00000000-0000-4000-b000-000000000002'::uuid, 'user'::text, 'web'::text, 'aaaaaaaa-0000-4000-8000-000000000001'::uuid,
             'Les Oliviers'::text, 'Oliviers (audit)'::text, '06000000-0000-4000-8000-000000000000'::uuid) $$,
  'a business change records actor, tenant, origin, trace id, before and after values'
);

set local role etare_api;
select throws_ok(
  $$ insert into app.audit_event (actor_type, action, entity_type, origin) values ('user', 'site.update', 'site', 'web') $$,
  '42501', null,
  'the API cannot forge audit events directly'
);
select throws_ok($$ update app.audit_event set reason = 'x' $$, '42501', null, 'the API cannot update the journal');
select throws_ok($$ delete from app.audit_event $$, '42501', null, 'the API cannot delete from the journal');

select lives_ok(
  $$ select app.record_audit_event('site.exported', 'site', '06000002-0000-4000-8000-000000000001', 'success', null, '{"format": "pdf"}') $$,
  'business events are recorded through the dedicated function'
);

reset role;
select is(
  (select actor_user_id from app.audit_event where action = 'site.exported'),
  '00000000-0000-4000-b000-000000000002'::uuid,
  'the recorded event is stamped with the verified request actor'
);

select throws_ok($$ update app.audit_event set reason = 'x' $$, '42501', null, 'even the table owner cannot update the journal');
select throws_ok($$ delete from app.audit_event $$, '42501', null, 'even the table owner cannot delete from the journal');
select throws_ok($$ truncate app.audit_event $$, '42501', null, 'even the table owner cannot truncate the journal');

-- Admin of 06 reads the audit of 06 only.
set local role etare_api;
select app.begin_request('supabase', '00000000-0000-4000-a000-000000000001', '06000000-0000-4000-8000-000000000000', 'aal1', null, 'web') is not null as ctx \gset
select is(
  (select count(*) from app.audit_event where tenant_id <> '06000000-0000-4000-8000-000000000000'),
  0::bigint,
  'the SIS administrator reads only the audit events of its tenant'
);

select * from finish();
rollback;
