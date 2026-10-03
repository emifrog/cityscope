-- =============================================================================
-- Sprint 9 — SEC-02: recovery of a lost second factor (ADR-022).
--
--   * Ten single-use recovery codes, shown once, kept hashed. Using one removes
--     the second factor, closes the other sessions and requires a new factor
--     before any access; an alert e-mail is sent.
--   * The SIS administration may reset the second factor of a member (not of
--     itself, not of someone also member of another SIS), with the same effects.
-- =============================================================================

alter table app.user_account
  add column second_factor_reenrollment boolean not null default false;
comment on column app.user_account.second_factor_reenrollment is
  'The second factor was removed (recovery code, administrator): a new one must be enrolled before any access.';

create table app.recovery_code (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.user_account (id),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz,
  unique (user_id, code_hash),
  check (used_at is null or revoked_at is null)
);
comment on table app.recovery_code is
  'Single-use recovery codes of a second factor (SHA-256 of user and code); never readable by the API, never deleted.';
create index recovery_code_unused_idx on app.recovery_code (user_id) where used_at is null and revoked_at is null;
-- No grant: only the functions below read or write the codes.
alter table app.recovery_code enable row level security;

-- Crockford base 32 without ambiguity: O reads as 0, I and L as 1; dashes and spaces ignored.
create function app.normalize_recovery_code(p_code text) returns text
language sql immutable
set search_path = ''
as $$ select translate(upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')), 'OIL', '011') $$;

create function app.recovery_code_hash(p_user uuid, p_code text) returns text
language sql immutable
set search_path = ''
as $$ select encode(extensions.digest(p_user::text || ':' || app.normalize_recovery_code(p_code), 'sha256'), 'hex') $$;

-- Removes every second factor of an identity (provider probe, guarded like the others).
create function app.idp_remove_second_factors(p_provider text, p_subject text) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if to_regclass('auth.mfa_factors') is null then
    return 0;
  end if;
  delete from auth.mfa_factors f where f.user_id = app.idp_user_id(p_provider, p_subject);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Effects of a recovery or a reset: no factor, no code, no other session, a new factor required.
create function app.remove_second_factor(p_user uuid, p_keep_session uuid) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_user app.user_account;
  v_sessions integer;
begin
  select * into v_user from app.user_account u where u.id = p_user for update;
  perform app.idp_remove_second_factors(v_user.auth_provider, v_user.auth_subject);
  update app.recovery_code c set revoked_at = now()
  where c.user_id = p_user and c.used_at is null and c.revoked_at is null;
  v_sessions := app.idp_revoke_sessions(v_user.auth_provider, v_user.auth_subject, null, p_keep_session);
  update app.user_account u set second_factor_reenrollment = true where u.id = p_user;
  return v_sessions;
end
$$;

-- -----------------------------------------------------------------------------
-- Notifications: two security alerts, sent to the person (minimal content).
-- -----------------------------------------------------------------------------
alter table app.notification
  drop constraint notification_kind_check,
  drop constraint notification_check1,
  add constraint notification_kind_check check (kind in (
    'portal_invitation', 'contribution_info_request', 'contribution_decision',
    'second_factor_recovered', 'second_factor_reset'
  )),
  add constraint notification_contribution_check check (
    (kind in ('contribution_info_request', 'contribution_decision')) = (contribution_id is not null)
  );

-- -----------------------------------------------------------------------------
-- Own recovery codes (Mon compte) and their use (Vérification).
-- -----------------------------------------------------------------------------
create function app.recovery_codes_state() returns table (remaining integer, generated_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select (count(*) filter (where c.used_at is null and c.revoked_at is null))::integer,
         max(c.created_at) filter (where c.revoked_at is null)
  from app.recovery_code c
  where c.user_id = app.current_user_id()
$$;

-- Replaces the codes of the caller (second factor enrolled and in use): returned once, in clear.
create function app.regenerate_recovery_codes() returns setof text
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_user app.user_account;
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_code text;
begin
  select * into v_user from app.user_account u where u.id = app.current_user_id();
  if not found then
    raise exception 'request context required' using errcode = '42501';
  end if;
  if not app.idp_has_second_factor(v_user.auth_provider, v_user.auth_subject) then
    raise exception 'recovery codes need an enrolled second factor' using errcode = 'ETRCF';
  end if;
  if app.current_aal() <> 'aal2' then
    raise exception 'second factor required' using errcode = 'ETMFA';
  end if;
  update app.recovery_code c set revoked_at = now()
  where c.user_id = v_user.id and c.used_at is null and c.revoked_at is null;
  for i in 1..10 loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := '';
    for j in 0..9 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, j) & 31) + 1, 1);
    end loop;
    insert into app.recovery_code (user_id, code_hash) values (v_user.id, app.recovery_code_hash(v_user.id, v_code));
    return next substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);
  end loop;
  perform app.record_audit_event('account.recovery_codes_generate', 'user_account', v_user.id, 'success', null,
                                 jsonb_build_object('count', 10));
end
$$;

-- A recovery code replaces the lost second factor once: the factor is removed, the other
-- sessions closed, a new factor required, and the person alerted by e-mail.
create function app.use_recovery_code(p_code text) returns void
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_user app.user_account;
  v_code uuid;
  v_tenant uuid;
begin
  select * into v_user from app.user_account u where u.id = app.current_user_id();
  if not found then
    raise exception 'request context required' using errcode = '42501';
  end if;
  select c.id into v_code
  from app.recovery_code c
  where c.user_id = v_user.id and c.used_at is null and c.revoked_at is null
    and c.code_hash = app.recovery_code_hash(v_user.id, p_code)
  for update;
  if v_code is null then
    raise exception 'invalid recovery code' using errcode = 'ETRCV';
  end if;
  update app.recovery_code c set used_at = now() where c.id = v_code;
  perform app.record_audit_event('account.second_factor_recover', 'user_account', v_user.id, 'success', null,
    jsonb_build_object('sessions_closed', app.remove_second_factor(v_user.id, app.current_session_id())));
  -- Notifications belong to a SIS: the alert goes through the oldest active membership.
  select m.tenant_id into v_tenant
  from app.membership m join app.tenant t on t.id = m.tenant_id and t.status = 'active'
  where m.user_id = v_user.id and m.status = 'active'
  order by m.created_at, m.tenant_id
  limit 1;
  if v_tenant is not null then
    -- The job of the notification belongs to that SIS (the request itself has none).
    perform set_config('app.tenant_id', v_tenant::text, true);
    perform app.queue_notification(v_tenant, 'second_factor_recovered', v_user.id, null, null);
    perform set_config('app.tenant_id', '', true);
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Reset by the SIS administration (Administration > Membres).
-- -----------------------------------------------------------------------------
create function app.admin_reset_second_factor(p_membership_id uuid, p_expected_version integer) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_member_manager();
  v_membership app.membership;
  v_user app.user_account;
  v_version integer;
begin
  if app.current_aal() <> 'aal2' then
    raise exception 'second factor required' using errcode = 'ETMFA';
  end if;
  select * into v_membership from app.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member not found' using errcode = 'ET404';
  end if;
  if v_membership.user_id = app.current_user_id() then
    raise exception 'nobody resets their own second factor here' using errcode = 'ETSLF';
  end if;
  if v_membership.row_version <> p_expected_version then
    raise exception 'stale member version' using errcode = 'ET412';
  end if;
  select * into v_user from app.user_account u where u.id = v_membership.user_id;
  if not app.idp_has_second_factor(v_user.auth_provider, v_user.auth_subject) then
    raise exception 'no second factor to reset' using errcode = 'ETRCF';
  end if;
  -- The account is shared by every SIS of the person: one SIS cannot weaken another one.
  if exists (
    select 1 from app.membership m
    where m.user_id = v_user.id and m.tenant_id <> v_tenant and m.status = 'active'
  ) then
    raise exception 'member of another SIS' using errcode = 'ETXTN';
  end if;

  perform app.record_audit_event('member.second_factor_reset', 'membership', v_membership.id, 'success', null,
    jsonb_build_object('sessions_closed', app.remove_second_factor(v_user.id, null)));
  perform app.queue_notification(v_tenant, 'second_factor_reset', v_user.id, null, null);
  update app.membership m set status = m.status where m.id = v_membership.id
  returning m.row_version into v_version;
  return v_version;
end
$$;

-- -----------------------------------------------------------------------------
-- begin_request: a removed second factor must be replaced before any access;
-- 'recovery' purpose (use of a recovery code, without any permission).
-- -----------------------------------------------------------------------------
create or replace function app.begin_request(
  p_auth_provider text,
  p_auth_subject text,
  p_tenant_id uuid,
  p_aal text,
  p_trace_id uuid,
  p_origin text,
  p_session_id uuid default null,
  p_device_id uuid default null,
  p_purpose text default null
)
returns table (user_id uuid, tenant_id uuid, permissions text[])
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_reenroll boolean;
  v_enrolled boolean;
  v_scope text := 'full';
begin
  if p_aal is null or p_aal not in ('aal1', 'aal2') then
    raise exception 'invalid assurance level' using errcode = '22023';
  end if;
  if p_origin is null or p_origin not in ('web', 'mobile', 'api', 'integration') then
    raise exception 'invalid request origin' using errcode = '22023';
  end if;
  if p_purpose is not null and p_purpose not in ('profile', 'enrollment', 'recovery') then
    raise exception 'invalid request purpose' using errcode = '22023';
  end if;
  if p_device_id is not null and (p_purpose is not null or p_tenant_id is null) then
    raise exception 'a terminal request has a tenant and no other purpose' using errcode = '22023';
  end if;

  select u.id, u.second_factor_reenrollment into v_user_id, v_reenroll
  from app.user_account u
  where u.auth_provider = p_auth_provider
    and u.auth_subject = p_auth_subject
    and u.status = 'active';
  if v_user_id is null then
    raise exception 'unknown or inactive account' using errcode = 'ET401';
  end if;

  if p_session_id is not null and not app.idp_session_active(p_auth_provider, p_auth_subject, p_session_id) then
    raise exception 'session closed' using errcode = 'ETSES';
  end if;

  if p_tenant_id is not null and not exists (
    select 1
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    where m.user_id = v_user_id and m.tenant_id = p_tenant_id and m.status = 'active'
  ) then
    raise exception 'not a member of this tenant' using errcode = 'ET403';
  end if;

  if p_aal = 'aal1' then
    v_enrolled := app.idp_has_second_factor(p_auth_provider, p_auth_subject);
    if v_enrolled or v_reenroll
       or (p_tenant_id is not null and app.second_factor_required_by_policy(p_tenant_id, v_user_id)) then
      if p_purpose in ('profile', 'recovery') then
        v_scope := 'profile';
      elsif p_device_id is not null and exists (
        select 1 from app.device d where d.id = p_device_id and d.tenant_id = p_tenant_id and d.status = 'active'
      ) then
        v_scope := 'device';
      elsif p_purpose = 'enrollment' and p_tenant_id is not null then
        v_scope := 'enrollment';
      elsif v_enrolled then
        raise exception 'second factor required' using errcode = 'ETMFA';
      elsif v_reenroll then
        raise exception 'second factor removed: enroll a new one' using errcode = 'ETMFR';
      else
        raise exception 'second factor enrollment required by the SIS' using errcode = 'ETMFE';
      end if;
    end if;
  elsif v_reenroll then
    -- A session with the second factor in use: the new factor is enrolled.
    update app.user_account u set second_factor_reenrollment = false where u.id = v_user_id;
  end if;

  perform set_config('app.user_id', v_user_id::text, true);
  perform set_config('app.tenant_id', coalesce(p_tenant_id::text, ''), true);
  perform set_config('app.aal', p_aal, true);
  perform set_config('app.trace_id', coalesce(p_trace_id::text, ''), true);
  perform set_config('app.origin', p_origin, true);
  perform set_config('app.actor_type', 'user', true);
  perform set_config('app.factor_scope', v_scope, true);
  perform set_config('app.session_id', coalesce(p_session_id::text, ''), true);

  return query
  select v_user_id,
         p_tenant_id,
         case when p_tenant_id is null then '{}'::text[] else app.current_permissions() end;
end
$$;

-- GET /me: a new second factor is awaited.
create function app.my_second_factor_reenrollment() returns boolean
language sql stable
security definer
set search_path = ''
as $$ select u.second_factor_reenrollment from app.user_account u where u.id = app.current_user_id() $$;

grant execute on function
  app.recovery_codes_state(),
  app.regenerate_recovery_codes(),
  app.use_recovery_code(text),
  app.admin_reset_second_factor(uuid, integer),
  app.my_second_factor_reenrollment()
to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
