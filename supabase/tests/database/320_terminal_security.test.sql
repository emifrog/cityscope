-- Sprint 13 (SEC-05): algorithm and rotation of the terminal key, policy of the tablets (ADR-029).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

create function pg_temp.act_as(p_subject text, p_aal text default 'aal1', p_tenant uuid default '06000000-0000-4000-8000-000000000000')
returns void
language sql as $$
  select from app.begin_request('supabase', p_subject, p_tenant, p_aal, 'bbbbbbbb-0000-4000-8000-000000000320', 'mobile')
$$;
create function pg_temp.generation() returns bigint
language sql as $$
  select generation from app.distribution_generation where tenant_id = '06000000-0000-4000-8000-000000000000'
$$;

-- Keys: a software Ed25519 key and two P-256 keys of the Keystore (SubjectPublicKeyInfo, base64).
create function pg_temp.p256(p_char text) returns text
language sql as $$ select 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' || repeat(p_char, 86) || '==' $$;

select plan(21);

-- Whatever earlier runs left on the local stack, the SIS 06 starts without a policy (rolled back).
update app.tenant set settings = settings - 'terminal_policy' where id = '06000000-0000-4000-8000-000000000000';

-- Terminals of the SIS 06 (ops06: a…04 uses them), enrolled with the software key of the first tablets.
insert into app.device (id, tenant_id, name, status, platform, public_key, enrolled_at, enrolled_by, created_by)
values
  ('06000010-0000-4000-8000-000000000320', '06000000-0000-4000-8000-000000000000', 'TABLETTE ROTATION', 'active',
   'android', 'Daaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=', now(), '00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-b000-000000000001'),
  ('06000010-0000-4000-8000-000000000321', '06000000-0000-4000-8000-000000000000', 'TABLETTE VOISINE', 'active',
   'android', 'Eaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=', now(), '00000000-0000-4000-b000-000000000004',
   '00000000-0000-4000-b000-000000000001');

-- -----------------------------------------------------------------------------
-- Algorithm of the key
-- -----------------------------------------------------------------------------
select is(
  (select key_algorithm from app.device where id = '06000010-0000-4000-8000-000000000320'),
  'ed25519',
  'the tablets enrolled before SEC-05 hold an Ed25519 key'
);
select throws_ok(
  $$ update app.device set key_algorithm = 'ecdsa-p256' where id = '06000010-0000-4000-8000-000000000321' $$,
  '23514', null,
  'the key of a terminal never changes outside of its own rotation'
);
select throws_ok(
  $$ insert into app.device (tenant_id, name, status, platform, key_algorithm, public_key, enrolled_at, enrolled_by,
                             created_by)
     values ('06000000-0000-4000-8000-000000000000', 'MAUVAISE CLE', 'active', 'android', 'ecdsa-p256',
             'Faaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=', now(), '00000000-0000-4000-b000-000000000004',
             '00000000-0000-4000-b000-000000000001') $$,
  '23514', null,
  'a key is stored in the encoding of its algorithm only'
);

-- -----------------------------------------------------------------------------
-- Rotation asked by the terminal
-- -----------------------------------------------------------------------------
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004');
select isnt(
  app.sync_rotate_device_key('06000010-0000-4000-8000-000000000320', 'ecdsa-p256', pg_temp.p256('A')),
  null,
  'an active terminal moves to a key of the Keystore'
);
select results_eq(
  $$ select status, public_key, key_algorithm from app.sync_device('06000010-0000-4000-8000-000000000320') $$,
  $$ values ('active'::text, pg_temp.p256('A'), 'ecdsa-p256'::text) $$,
  'its next requests are checked with the new key and its algorithm'
);
select throws_ok(
  $$ select app.sync_rotate_device_key('06000010-0000-4000-8000-000000000320', 'ecdsa-p256', pg_temp.p256('A')) $$,
  '22023', null,
  'a rotation to the current key is refused'
);
select throws_ok(
  $$ select app.sync_rotate_device_key('06000010-0000-4000-8000-000000000321', 'ecdsa-p256', pg_temp.p256('A')) $$,
  '23505', null,
  'two terminals never share a key'
);
select throws_ok(
  $$ select app.sync_rotate_device_key('06000010-0000-4000-8000-000000000321', 'ecdsa-p256', 'pas une cle') $$,
  '23514', null,
  'a malformed key is refused'
);
reset role;
select ok(
  (select key_rotated_at is not null from app.device where id = '06000010-0000-4000-8000-000000000320'),
  'the date of the rotation is kept'
);
select is(
  (select metadata #>> '{after,algorithm}' || ' ' || length(metadata #>> '{after,fingerprint}')
   from app.audit_event where action = 'device.key_rotated' and entity_id = '06000010-0000-4000-8000-000000000320'),
  'ecdsa-p256 64',
  'the rotation is audited with the algorithm and the fingerprint of the key, never the key itself'
);
update app.device set status = 'revoked', revoked_at = now(), revoked_by = '00000000-0000-4000-b000-000000000001',
                      revocation_reason = 'Tablette perdue (pgTAP)'
where id = '06000010-0000-4000-8000-000000000321';
set local role etare_api;
select pg_temp.act_as('00000000-0000-4000-a000-000000000004');
select throws_ok(
  $$ select app.sync_rotate_device_key('06000010-0000-4000-8000-000000000321', 'ecdsa-p256', pg_temp.p256('B')) $$,
  'ETDRV', null,
  'a revoked terminal never changes its key'
);

-- -----------------------------------------------------------------------------
-- Policy of the tablets
-- -----------------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-a000-000000000001', 'aal2');
select is(app.terminal_policy(), null, 'a SIS that set no policy has none stored: the defaults apply');
select throws_ok(
  $$ select app.update_terminal_policy('{"idle_lock_minutes": 0, "background_lock_seconds": 0,
       "screenshots_allowed": false, "max_days_without_login": 30, "offline_authorization_days": 7}') $$,
  '22023', null,
  'a policy that would leave the tablets open is refused'
);
select throws_ok(
  $$ select app.update_terminal_policy('{"idle_lock_minutes": 5, "background_lock_seconds": 0,
       "screenshots_allowed": false, "max_days_without_login": 30}') $$,
  '22023', null,
  'every setting is required'
);
select pg_temp.generation() as generation_before \gset
select is(
  app.update_terminal_policy('{"idle_lock_minutes": 2, "background_lock_seconds": 30,
    "screenshots_allowed": true, "max_days_without_login": 14, "offline_authorization_days": 3}'),
  '{"idle_lock_minutes": 2, "background_lock_seconds": 30, "screenshots_allowed": true,
    "max_days_without_login": 14, "offline_authorization_days": 3}'::jsonb,
  'the administration sets the policy of its tablets'
);
select ok(pg_temp.generation() > :generation_before, 'the tablets learn it at their next catalogue');

select pg_temp.act_as('00000000-0000-4000-a000-000000000001', 'aal1');
select throws_ok(
  $$ select app.update_terminal_policy('{"idle_lock_minutes": 60, "background_lock_seconds": 600,
       "screenshots_allowed": true, "max_days_without_login": 90, "offline_authorization_days": 14}') $$,
  null, null,
  'never without the second factor'
);
select pg_temp.act_as('00000000-0000-4000-a000-000000000004');
select throws_ok(
  $$ select app.update_terminal_policy('{"idle_lock_minutes": 60, "background_lock_seconds": 600,
       "screenshots_allowed": true, "max_days_without_login": 90, "offline_authorization_days": 14}') $$,
  '42501', null,
  'an agent never changes the policy'
);
select is(
  app.sync_terminal_policy('06000010-0000-4000-8000-000000000320') ->> 'idle_lock_minutes',
  '2',
  'a terminal of the SIS reads the policy at its synchronisation'
);
reset role;
select is(
  (select settings -> 'terminal_policy' from app.tenant where id = '83000000-0000-4000-8000-000000000000'),
  null,
  'the policy of a SIS never reaches another'
);
select is(
  (select metadata #>> '{after,idle_lock_minutes}' from app.audit_event
   where action = 'tenant.terminal_policy' order by occurred_at desc limit 1),
  '2',
  'a change of policy is audited'
);

select * from finish();
rollback;
