-- =============================================================================
-- Sprint 13 — SEC-05: security of the terminals (ADR-029).
--
-- 1. The key of a terminal has an algorithm. The first tablets hold a software
--    Ed25519 key; the new ones, and the old ones by a rotation, an ECDSA P-256
--    key of the Android Keystore that never leaves the hardware. A rotation is
--    asked by the terminal itself, signed by its current key, the new key
--    signing the rotation text (the API checks both); revocation stays final.
-- 2. The lock and session policy of the tablets is set by the administration of
--    the SIS (device:manage, second factor) and carried by the signed catalogue.
--    Only what was set is stored: the application completes it with the
--    defaults (packages/domain/src/terminal.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Algorithm of the terminal key
-- -----------------------------------------------------------------------------
alter table app.device
  add column key_algorithm text not null default 'ed25519' check (key_algorithm in ('ed25519', 'ecdsa-p256')),
  add column key_rotated_at timestamptz;

alter table app.device drop constraint device_public_key_check;
alter table app.device add constraint device_public_key_format check (
  public_key is null
  or (key_algorithm = 'ed25519' and public_key ~ '^[A-Za-z0-9+/]{43}=$')
  -- SubjectPublicKeyInfo of a P-256 key (DER, 91 bytes), as Android and Node export it.
  or (key_algorithm = 'ecdsa-p256' and public_key ~ '^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{86}==$')
);
comment on column app.device.key_algorithm is
  'ed25519: software key of the first tablets; ecdsa-p256: key of the Android Keystore (SEC-05).';
comment on column app.device.key_rotated_at is 'Last rotation of the key, asked and signed by the terminal itself.';

-- Lifecycle unchanged; the key of an active terminal changes only through app.sync_rotate_device_key.
create or replace function app.tg_device_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rotating boolean := coalesce(current_setting('app.device_key_rotation', true), '') = old.id::text;
begin
  if tg_op = 'DELETE' then
    raise exception 'terminals are never deleted (revoke them)' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'pending' and new.status in ('active', 'revoked'))
    or (old.status = 'active' and new.status = 'revoked')
  ) then
    raise exception 'invalid terminal transition % -> %', old.status, new.status using errcode = '23514';
  end if;
  if old.status <> 'pending' and (new.platform, new.enrolled_at, new.enrolled_by)
     is distinct from (old.platform, old.enrolled_at, old.enrolled_by) then
    raise exception 'the enrollment of a terminal is final' using errcode = '23514';
  end if;
  if old.status <> 'pending'
     and (new.public_key, new.key_algorithm, new.key_rotated_at)
         is distinct from (old.public_key, old.key_algorithm, old.key_rotated_at)
     and not (v_rotating and old.status = 'active' and new.status = 'active') then
    raise exception 'the key of a terminal changes only by its own rotation' using errcode = '23514';
  end if;
  if old.status = 'revoked' and to_jsonb(new) - array['updated_at', 'row_version']
     is distinct from to_jsonb(old) - array['updated_at', 'row_version'] then
    raise exception 'a revoked terminal never changes' using errcode = '23514';
  end if;
  return new;
end
$$;

-- Enrollment with the algorithm of the key (the first tablets send none: Ed25519).
drop function app.enroll_device(text, text, text, text);
create function app.enroll_device(
  p_code_hash text,
  p_public_key text,
  p_platform text,
  p_app_version text,
  p_key_algorithm text default 'ed25519'
)
returns table (device_id uuid, device_name text, tenant_id uuid, tenant_name text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_offline_download();
  v_device app.device;
begin
  update app.device d
  set status = 'active', public_key = p_public_key, key_algorithm = coalesce(p_key_algorithm, 'ed25519'),
      platform = p_platform, enrolled_at = now(), enrolled_by = app.current_user_id(),
      enrollment_code_hash = null, enrollment_expires_at = null
  where d.tenant_id = v_tenant and d.status = 'pending'
    and d.enrollment_code_hash = p_code_hash and d.enrollment_expires_at > now()
  returning * into v_device;
  if not found then
    raise exception 'unknown, used or expired enrollment code' using errcode = 'ETENR';
  end if;
  insert into app.device_sync_state (device_id, tenant_id, app_version, last_user_id, last_seen_at)
  values (v_device.id, v_tenant, p_app_version, app.current_user_id(), now());
  return query select v_device.id, v_device.name, t.id, t.name from app.tenant t where t.id = v_tenant;
end
$$;

-- Status and key of a terminal, with its algorithm, to check the proof of a request.
drop function app.sync_device(uuid);
create function app.sync_device(p_device_id uuid)
returns table (status text, public_key text, key_algorithm text)
language plpgsql stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_offline_download();
begin
  return query
  select d.status, d.public_key, d.key_algorithm from app.device d
  where d.id = p_device_id and d.tenant_id = v_tenant;
end
$$;

-- Rotation asked by an active terminal of the current SIS; the API has checked
-- the signature of the request by the current key and the proof of the new one.
create function app.sync_rotate_device_key(p_device_id uuid, p_key_algorithm text, p_public_key text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
  v_before app.device;
  v_at timestamptz := now();
begin
  select * into v_before from app.device d where d.id = p_device_id and d.tenant_id = v_tenant for update;
  if v_before.public_key = p_public_key then
    raise exception 'the new key is the current key' using errcode = '22023';
  end if;
  perform set_config('app.device_key_rotation', p_device_id::text, true);
  update app.device d
  set public_key = p_public_key, key_algorithm = p_key_algorithm, key_rotated_at = v_at
  where d.id = p_device_id;
  perform set_config('app.device_key_rotation', '', true);
  perform app.record_audit_event(
    'device.key_rotated', 'device', p_device_id, 'success', null,
    jsonb_build_object(
      'before', jsonb_build_object('algorithm', v_before.key_algorithm,
                                   'fingerprint', encode(extensions.digest(v_before.public_key, 'sha256'), 'hex')),
      'after', jsonb_build_object('algorithm', p_key_algorithm,
                                  'fingerprint', encode(extensions.digest(p_public_key, 'sha256'), 'hex'))
    )
  );
  return v_at;
end
$$;

-- -----------------------------------------------------------------------------
-- Lock and session policy of the tablets (tenant setting terminal_policy)
-- -----------------------------------------------------------------------------
-- The policy set by the administration (null: the defaults of the application).
create function app.terminal_policy() returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select t.settings -> 'terminal_policy'
  from app.tenant t
  where t.id = app.current_tenant_id() and app.has_permission('device:manage')
$$;

-- The same, for a terminal of the SIS at its synchronisation.
create function app.sync_terminal_policy(p_device_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_sync_device(p_device_id);
begin
  return (select t.settings -> 'terminal_policy' from app.tenant t where t.id = v_tenant);
end
$$;

create function app.update_terminal_policy(p_policy jsonb) returns jsonb
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_policy jsonb;
begin
  if not app.has_permission('device:manage') then
    raise exception 'device:manage required' using errcode = '42501';
  end if;
  -- The tablets of the whole SIS follow: a policy changes only with the second factor in use.
  if app.current_aal() <> 'aal2' then
    raise exception 'second factor required' using errcode = 'ETMFA';
  end if;
  if p_policy is null or jsonb_typeof(p_policy) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_policy) k) is distinct from
        array['background_lock_seconds', 'idle_lock_minutes', 'max_days_without_login',
              'offline_authorization_days', 'screenshots_allowed']
     or jsonb_typeof(p_policy -> 'screenshots_allowed') <> 'boolean'
     or jsonb_typeof(p_policy -> 'idle_lock_minutes') <> 'number'
     or jsonb_typeof(p_policy -> 'background_lock_seconds') <> 'number'
     or jsonb_typeof(p_policy -> 'max_days_without_login') <> 'number'
     or jsonb_typeof(p_policy -> 'offline_authorization_days') <> 'number' then
    raise exception 'invalid terminal policy' using errcode = '22023';
  end if;
  -- Same bounds as the application (TERMINAL_POLICY_BOUNDS): never tablets left open for good.
  if (p_policy ->> 'idle_lock_minutes') !~ '^\d+$' or (p_policy ->> 'idle_lock_minutes')::int not between 1 and 60
     or (p_policy ->> 'background_lock_seconds') !~ '^\d+$'
     or (p_policy ->> 'background_lock_seconds')::int not between 0 and 600
     or (p_policy ->> 'max_days_without_login') !~ '^\d+$'
     or (p_policy ->> 'max_days_without_login')::int not between 1 and 90
     or (p_policy ->> 'offline_authorization_days') !~ '^\d+$'
     or (p_policy ->> 'offline_authorization_days')::int not between 1 and 14 then
    raise exception 'terminal policy out of bounds' using errcode = '22023';
  end if;
  v_policy := jsonb_build_object(
    'idle_lock_minutes', (p_policy ->> 'idle_lock_minutes')::int,
    'background_lock_seconds', (p_policy ->> 'background_lock_seconds')::int,
    'screenshots_allowed', (p_policy ->> 'screenshots_allowed')::boolean,
    'max_days_without_login', (p_policy ->> 'max_days_without_login')::int,
    'offline_authorization_days', (p_policy ->> 'offline_authorization_days')::int
  );
  select t.settings -> 'terminal_policy' into v_before from app.tenant t where t.id = app.current_tenant_id();
  update app.tenant t
  set settings = t.settings || jsonb_build_object('terminal_policy', v_policy)
  where t.id = app.current_tenant_id();
  -- The terminals learn it at their next catalogue.
  perform app.touch_distribution_generation(app.current_tenant_id());
  perform app.record_audit_event(
    'tenant.terminal_policy', 'tenant', app.current_tenant_id(), 'success', null,
    jsonb_build_object('before', v_before, 'after', v_policy)
  );
  return v_policy;
end
$$;

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant execute on function
  app.enroll_device(text, text, text, text, text),
  app.sync_device(uuid),
  app.sync_rotate_device_key(uuid, text, text),
  app.terminal_policy(),
  app.sync_terminal_policy(uuid),
  app.update_terminal_policy(jsonb)
to etare_api;

revoke all on all routines in schema app from public;
