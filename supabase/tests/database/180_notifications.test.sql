-- Sprint 7: notifications of the exploitant portal, written with their event and replayable (POR-05, ADR-020).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text) returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, '06000000-0000-4000-8000-000000000000', p_aal,
                                'bbbbbbbb-0000-4000-8000-000000000180', 'web')
$$;

-- Subjects of the seed: admin 06 (…01), editor 06 (…02), exploitant of the EHPAD (…05).
select plan(20);

create temporary table ids (name text primary key, id uuid) on commit drop;
grant all on ids to etare_api, etare_worker;

set local role etare_api;

-- A proposal, a question of the SIS, then its decision.
select pg_temp.act_as('00000000-0000-4000-a000-000000000005', 'aal2');
insert into ids select 'proposal', app.portal_submit_contribution('06000002-0000-4000-8000-000000000001', 'other', null,
  'create', 'Nouveau stockage', 'Local batteries au sous-sol.', null, '[]'::jsonb);

select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal1');
update app.contribution set status = 'in_review' where id = (select id from ids where name = 'proposal');
reset role;
select is((select count(*) from app.notification where contribution_id = (select id from ids where name = 'proposal')),
  0::bigint, 'taking a proposal in charge sends nothing');
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal1');
insert into app.contribution_message (tenant_id, site_id, contribution_id, side, kind, body)
values ('06000000-0000-4000-8000-000000000000', '06000002-0000-4000-8000-000000000001',
        (select id from ids where name = 'proposal'), 'sis', 'info_request', 'Quelle capacité ?');
update app.contribution set status = 'info_requested' where id = (select id from ids where name = 'proposal');

reset role;
insert into ids select 'question', id from app.notification
where contribution_id = (select id from ids where name = 'proposal') and kind = 'contribution_info_request';
select isnt((select id from ids where name = 'question'), null, 'a question of the SIS is notified to the exploitant');
select is((select recipient_id from app.notification where id = (select id from ids where name = 'question')),
  '00000000-0000-4000-b000-000000000005'::uuid, 'to the author of the proposal');
select is((select count(*) from app.job where job_type = 'notification.send'
             and payload ->> 'notification_id' = (select id::text from ids where name = 'question')), 1::bigint,
  'with its sending job, in the same transaction');
set local role etare_api;

select pg_temp.act_as('00000000-0000-4000-a000-000000000005', 'aal2');
select app.portal_contribution_reply((select id from ids where name = 'proposal'), '20 kWh.');
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal1');
update app.contribution set status = 'rejected', decision_comment = 'Déjà connu.'
where id = (select id from ids where name = 'proposal');
reset role;
select is((select count(*) from app.notification
           where contribution_id = (select id from ids where name = 'proposal') and kind = 'contribution_decision'),
  1::bigint, 'and so is the decision');
set local role etare_api;

-- Who sees them: the administration of the SIS only.
select pg_temp.act_as('00000000-0000-4000-a000-000000000005', 'aal2');
select is((select count(*) from app.notification), 0::bigint, 'not the exploitant');
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal2');
select is((select count(*) from app.notification), 0::bigint, 'not a Prévision editor');
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', 'aal2');
select ok((select count(*) from app.notification) >= 2, 'the administration of the SIS');

-- An invitation to an existing account, once.
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal2');
insert into ids select 'invitation', invitation_id from app.portal_invite('exploitant.oliviers@demo.etare.test', null,
  null, array['06000002-0000-4000-8000-000000000002']::uuid[], now() + interval '7 days', null);
insert into ids select 'invited', app.notify_portal_invitation((select id from ids where name = 'invitation'));
select is(app.notify_portal_invitation((select id from ids where name = 'invitation')),
  (select id from ids where name = 'invited'), 'an invitation is notified once');
select throws_ok($$ select app.worker_notification((select id from ids where name = 'question'),
                   '06000000-0000-4000-8000-000000000000') $$,
  '42501', null, 'the API cannot use the worker functions');

-- Sending (worker): minimal content, attempts and errors recorded.
reset role;
set local role etare_worker;
select set_eq(
  $$ select jsonb_object_keys(app.worker_notification((select id from ids where name = 'question'),
                                                      '06000000-0000-4000-8000-000000000000')) $$,
  array['id', 'kind', 'status', 'recipient_email', 'recipient_name', 'tenant_name', 'invitation', 'contribution'],
  'the worker reads what the e-mail needs'
);
select ok(app.worker_notification((select id from ids where name = 'question'), '06000000-0000-4000-8000-000000000000')::text
          not like '%Quelle capacité%', 'never the content of the exchange');
select is(app.worker_notification((select id from ids where name = 'question'), '83000000-0000-4000-8000-000000000000'),
  null, 'nor a notification of another SIS');
select ok(app.worker_record_notification((select id from ids where name = 'question'),
            '06000000-0000-4000-8000-000000000000', 'SMTP 421 indisponible'), 'a failed attempt is recorded');
select ok(app.worker_record_notification((select id from ids where name = 'question'),
            '06000000-0000-4000-8000-000000000000', null), 'then the sending');
reset role;
select results_eq(
  $$ select status, attempts, last_error from app.notification where id = (select id from ids where name = 'question') $$,
  $$ values ('sent'::text, 2, null::text) $$,
  'sent at the second attempt'
);

-- A job abandoned by the queue leaves its notification failed.
update app.job set status = 'dead', completed_at = now(), last_error_code = 'SMTP_NOT_CONFIGURED'
where job_type = 'notification.send' and payload ->> 'notification_id' = (select id::text from ids where name = 'invited');
select results_eq(
  $$ select status, last_error from app.notification where id = (select id from ids where name = 'invited') $$,
  $$ values ('failed'::text, 'SMTP_NOT_CONFIGURED'::text) $$,
  'a dead sending job fails its notification'
);

-- Replay by the administration of the SIS.
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000002', 'aal2');
select throws_ok($$ select app.admin_retry_notification((select id from ids where name = 'invited')) $$,
  '42501', null, 'an editor does not replay');
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', 'aal2');
select lives_ok($$ select app.admin_retry_notification((select id from ids where name = 'invited')) $$,
  'the administration sends a failed notification again');
select throws_ok($$ select app.admin_retry_notification((select id from ids where name = 'invited')) $$,
  'ETNTP', null, 'not twice while it waits');

select * from finish();
rollback;
