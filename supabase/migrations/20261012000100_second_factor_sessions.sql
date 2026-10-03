-- =============================================================================
-- Sprint 9 — SEC-02: the database enforces the second factor of enrolled
-- accounts on every request, the SIS can require it for every access outside
-- an enrolled terminal, sessions are checked and revocable (ADR-022).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity provider probes. The ONLY functions that read the schema of the
-- identity provider (Supabase Auth): another provider re-implements these
-- (ADR-003, ADR-022). The product still never links to auth.users rows.
-- PL/pgSQL with a guard: the migration still applies on a bare PostgreSQL,
-- where no factor is known and sessions cannot be checked nor closed.
-- -----------------------------------------------------------------------------
create function app.idp_user_id(p_provider text, p_subject text) returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when p_provider = 'supabase'
     and p_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then p_subject::uuid
  end
$$;

-- Has the identity a verified second factor?
create function app.idp_has_second_factor(p_provider text, p_subject text) returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('auth.mfa_factors') is null then
    return false;
  end if;
  return exists (
    select 1 from auth.mfa_factors f
    where f.user_id = app.idp_user_id(p_provider, p_subject) and f.status::text = 'verified'
  );
end
$$;

-- Is the session of an access token still open (not signed out, not revoked, not expired)?
create function app.idp_session_active(p_provider text, p_subject text, p_session uuid) returns boolean
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('auth.sessions') is null then
    return true;
  end if;
  return exists (
    select 1 from auth.sessions s
    where s.id = p_session
      and s.user_id = app.idp_user_id(p_provider, p_subject)
      and (s.not_after is null or s.not_after > now())
  );
end
$$;

create function app.idp_sessions(p_provider text, p_subject text)
returns table (id uuid, created_at timestamptz, last_seen_at timestamptz, user_agent text, ip text, aal text)
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('auth.sessions') is null then
    return;
  end if;
  return query
  select s.id, s.created_at,
         greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC'),
         left(s.user_agent, 300), host(s.ip), s.aal::text
  from auth.sessions s
  where s.user_id = app.idp_user_id(p_provider, p_subject)
    and (s.not_after is null or s.not_after > now())
  order by 3 desc;
end
$$;

-- Closes sessions: their refresh tokens go with them, and their access tokens are
-- refused at the next request (begin_request checks the session).
create function app.idp_revoke_sessions(
  p_provider text,
  p_subject text,
  p_only uuid default null,
  p_keep uuid default null
) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if to_regclass('auth.sessions') is null then
    return 0;
  end if;
  delete from auth.sessions s
  where s.user_id = app.idp_user_id(p_provider, p_subject)
    and (p_only is null or s.id = p_only)
    and (p_keep is null or s.id <> p_keep);
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

create function app.idp_identity_states(p_provider text, p_subjects text[])
returns table (subject text, last_sign_in_at timestamptz, second_factor boolean)
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('auth.users') is null or to_regclass('auth.mfa_factors') is null then
    return;
  end if;
  return query
  select u.id::text, u.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.status::text = 'verified')
  from auth.users u
  where p_provider = 'supabase' and u.id::text = any (p_subjects);
end
$$;

-- -----------------------------------------------------------------------------
-- Factor scope of a request: 'full' (second factor used, or not required),
-- 'device' (enrolled account on an enrolled terminal: the key of the terminal
-- is the possession factor), 'enrollment' (the single-use enrollment code is),
-- 'profile' (reading one's own profile only).
-- -----------------------------------------------------------------------------
create function app.current_factor_scope() returns text
language sql stable
set search_path = ''
as $$ select coalesce(nullif(current_setting('app.factor_scope', true), ''), 'full') $$;

create function app.current_session_id() returns uuid
language sql stable
set search_path = ''
as $$ select nullif(current_setting('app.session_id', true), '')::uuid $$;

create function app.factor_scope_allows(p_permission text) returns boolean
language sql stable
set search_path = ''
as $$
  select case app.current_factor_scope()
    when 'full' then true
    when 'device' then p_permission in ('offline:download', 'publication:read', 'field_report:create')
    when 'enrollment' then p_permission = 'offline:download'
    else false
  end
$$;

create or replace function app.has_permission(p_permission text, p_site_id uuid default null) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select app.factor_scope_allows(p_permission) and exists (
    select 1
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    join app.role_binding rb
      on rb.membership_id = m.id
     and rb.tenant_id = m.tenant_id
     and rb.revoked_at is null
     and (rb.valid_until is null or rb.valid_until > now())
     and (rb.scope_type = 'tenant' or (rb.scope_type = 'site' and rb.scope_id = p_site_id))
    join app.role_permission rp on rp.role_id = rb.role_id and rp.permission_code = p_permission
    join app.permission p on p.code = rp.permission_code
    where m.user_id = app.current_user_id()
      and m.tenant_id = app.current_tenant_id()
      and m.status = 'active'
      and (
        not p.requires_aal2
        or app.current_aal() = 'aal2'
        or not coalesce((t.settings ->> 'mfa_required_for_privileged')::boolean, true)
      )
      and (
        not p.portal_mfa
        or app.current_aal() = 'aal2'
        or not coalesce((t.settings ->> 'portal_mfa_required')::boolean, true)
      )
  )
$$;

-- Does the SIS require the second factor of this member for every access outside a
-- terminal? Exploitants are governed by the portal setting (portal_mfa_required).
create function app.second_factor_required_by_policy(p_tenant uuid, p_user uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.tenant t
    join app.membership m on m.tenant_id = t.id and m.user_id = p_user and m.status = 'active'
    where t.id = p_tenant
      and coalesce((t.settings ->> 'mfa_required_for_all')::boolean, false)
      and exists (
        select 1 from app.role_binding rb
        join app.role r on r.id = rb.role_id
        where rb.membership_id = m.id and rb.revoked_at is null
          and (rb.valid_until is null or rb.valid_until > now())
          and r.code <> 'EXPLOITANT'
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- begin_request: also checks the session of the token and the second factor.
-- p_session_id: session claim of the token (the API always passes it; database
-- tests open contexts without one). p_device_id: terminal of a signed request
-- (the API refuses to commit if it did not verify the signature). p_purpose:
-- 'profile' (GET /me) or 'enrollment' (terminal enrollment).
-- -----------------------------------------------------------------------------
drop function app.begin_request(text, text, uuid, text, uuid, text);

create function app.begin_request(
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
  v_enrolled boolean;
  v_scope text := 'full';
begin
  if p_aal is null or p_aal not in ('aal1', 'aal2') then
    raise exception 'invalid assurance level' using errcode = '22023';
  end if;
  if p_origin is null or p_origin not in ('web', 'mobile', 'api', 'integration') then
    raise exception 'invalid request origin' using errcode = '22023';
  end if;
  if p_purpose is not null and p_purpose not in ('profile', 'enrollment') then
    raise exception 'invalid request purpose' using errcode = '22023';
  end if;
  if p_device_id is not null and (p_purpose is not null or p_tenant_id is null) then
    raise exception 'a terminal request has a tenant and no other purpose' using errcode = '22023';
  end if;

  select u.id into v_user_id
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
    if v_enrolled
       or (p_tenant_id is not null and app.second_factor_required_by_policy(p_tenant_id, v_user_id)) then
      if p_purpose = 'profile' then
        v_scope := 'profile';
      elsif p_device_id is not null and exists (
        select 1 from app.device d where d.id = p_device_id and d.tenant_id = p_tenant_id and d.status = 'active'
      ) then
        v_scope := 'device';
      elsif p_purpose = 'enrollment' and p_tenant_id is not null then
        v_scope := 'enrollment';
      elsif v_enrolled then
        raise exception 'second factor required' using errcode = 'ETMFA';
      else
        raise exception 'second factor enrollment required by the SIS' using errcode = 'ETMFE';
      end if;
    end if;
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

grant execute on function app.begin_request(text, text, uuid, text, uuid, text, uuid, uuid, text) to etare_api;

-- -----------------------------------------------------------------------------
-- GET /me: memberships with the second-factor policy, own enrollment state.
-- -----------------------------------------------------------------------------
drop function app.my_memberships();

create function app.my_memberships()
returns table (tenant_id uuid, tenant_slug text, tenant_name text, roles text[], second_factor_required boolean)
language sql stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.name,
         coalesce(array_agg(distinct r.code order by r.code) filter (where r.code is not null), '{}'),
         app.second_factor_required_by_policy(t.id, m.user_id)
  from app.membership m
  join app.tenant t on t.id = m.tenant_id and t.status = 'active'
  left join app.role_binding rb
    on rb.membership_id = m.id
   and rb.revoked_at is null
   and (rb.valid_until is null or rb.valid_until > now())
  left join app.role r on r.id = rb.role_id
  where m.user_id = app.current_user_id()
    and m.status = 'active'
  group by t.id, t.slug, t.name, m.user_id
  order by t.name
$$;

create function app.my_second_factor() returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select app.idp_has_second_factor(u.auth_provider, u.auth_subject)
  from app.user_account u
  where u.id = app.current_user_id()
$$;

-- -----------------------------------------------------------------------------
-- Own sessions (Mon compte).
-- -----------------------------------------------------------------------------
create function app.my_sessions()
returns table (id uuid, created_at timestamptz, last_seen_at timestamptz, user_agent text, ip text, aal text,
               is_current boolean)
language sql stable
security definer
set search_path = ''
as $$
  select s.id, s.created_at, s.last_seen_at, s.user_agent, s.ip, s.aal, s.id = app.current_session_id()
  from app.user_account u
  cross join lateral app.idp_sessions(u.auth_provider, u.auth_subject) s
  where u.id = app.current_user_id()
$$;

-- Closes one session of the caller (p_session), or all the others (p_session null).
create function app.revoke_my_sessions(p_session uuid default null) returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_user app.user_account;
  v_count integer;
begin
  select * into v_user from app.user_account u where u.id = app.current_user_id();
  if not found then
    raise exception 'request context required' using errcode = '42501';
  end if;
  v_count := app.idp_revoke_sessions(
    v_user.auth_provider, v_user.auth_subject, p_session,
    case when p_session is null then app.current_session_id() end
  );
  perform app.record_audit_event(
    'account.sessions_revoke', 'user_account', v_user.id, 'success', null,
    jsonb_build_object('count', v_count, 'scope', case when p_session is null then 'others' else 'one' end)
  );
  return v_count;
end
$$;

-- -----------------------------------------------------------------------------
-- Second-factor policy of the SIS (Administration > Réglages).
-- 'privileged': sensitive permissions (default) ; 'all': also every access
-- outside an enrolled terminal ; 'none': never (explicit, discouraged).
-- -----------------------------------------------------------------------------
create function app.security_settings() returns table (second_factor_policy text)
language sql stable
security definer
set search_path = ''
as $$
  select case
    when not coalesce((t.settings ->> 'mfa_required_for_privileged')::boolean, true) then 'none'
    when coalesce((t.settings ->> 'mfa_required_for_all')::boolean, false) then 'all'
    else 'privileged'
  end
  from app.tenant t
  where t.id = app.current_tenant_id() and app.has_permission('member:manage')
$$;

create function app.update_security_settings(p_policy text) returns text
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_before text;
begin
  if p_policy is null or p_policy not in ('privileged', 'all', 'none') then
    raise exception 'invalid second factor policy' using errcode = '22023';
  end if;
  if not app.has_permission('member:manage') then
    raise exception 'member:manage required' using errcode = '42501';
  end if;
  -- A security policy changes only with the second factor in use, whatever the current policy.
  if app.current_aal() <> 'aal2' then
    raise exception 'second factor required' using errcode = 'ETMFA';
  end if;
  select s.second_factor_policy into v_before from app.security_settings() s;
  update app.tenant t
  set settings = t.settings || jsonb_build_object(
    'mfa_required_for_privileged', p_policy <> 'none',
    'mfa_required_for_all', p_policy = 'all'
  )
  where t.id = app.current_tenant_id();
  perform app.record_audit_event(
    'tenant.security_settings', 'tenant', app.current_tenant_id(), 'success', null,
    jsonb_build_object('before', v_before, 'after', p_policy)
  );
  return p_policy;
end
$$;

-- -----------------------------------------------------------------------------
-- Member administration: identity state shown to administrators, and a
-- suspension closes every session of the member at once.
-- -----------------------------------------------------------------------------
create function app.member_identity_states()
returns table (user_id uuid, last_sign_in_at timestamptz, second_factor boolean)
language sql stable
security definer
set search_path = ''
as $$
  with members as (
    select u.id, u.auth_provider, u.auth_subject
    from app.membership m
    join app.user_account u on u.id = m.user_id
    where m.tenant_id = app.current_tenant_id()
  )
  select mb.id, s.last_sign_in_at, coalesce(s.second_factor, false)
  from members mb
  left join lateral app.idp_identity_states(mb.auth_provider, array[mb.auth_subject]) s on true
  where app.has_permission('member:manage')
$$;

create or replace function app.admin_update_member(
  p_membership_id uuid,
  p_expected_version integer,
  p_roles text[] default null,
  p_status text default null
)
returns integer
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.require_member_manager();
  v_actor uuid := app.current_user_id();
  v_membership app.membership;
  v_role_ids uuid[];
  v_version integer;
begin
  select * into v_membership
  from app.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member not found' using errcode = 'ET404';
  end if;
  if v_membership.user_id = v_actor then
    raise exception 'nobody changes their own membership' using errcode = 'ETSLF';
  end if;
  if v_membership.row_version <> p_expected_version then
    raise exception 'stale member version' using errcode = 'ET412';
  end if;
  if p_status is not null and p_status not in ('active', 'suspended') then
    raise exception 'invalid member status' using errcode = '22023';
  end if;

  if p_roles is not null then
    v_role_ids := app.grantable_role_ids(p_roles, true);
    update app.role_binding b
    set revoked_at = now(), revoked_by = v_actor
    where b.membership_id = v_membership.id
      and b.revoked_at is null
      and b.scope_type = 'tenant'
      and not (b.role_id = any (v_role_ids));
    insert into app.role_binding (tenant_id, membership_id, role_id, created_by)
    select v_tenant, v_membership.id, wanted.role_id, v_actor
    from unnest(v_role_ids) as wanted (role_id)
    where not exists (
      select 1 from app.role_binding b
      where b.membership_id = v_membership.id
        and b.role_id = wanted.role_id
        and b.scope_type = 'tenant'
        and b.revoked_at is null
    );
  end if;

  -- Always touches the membership: any change of roles or status bumps its version.
  update app.membership m
  set status = coalesce(p_status, m.status)
  where m.id = v_membership.id
  returning m.row_version into v_version;

  -- A suspension takes effect at once: every session of the person is closed (all SIS:
  -- a session is not tied to one SIS; the person signs in again where still a member).
  if p_status = 'suspended' and v_membership.status <> 'suspended' then
    perform app.record_audit_event(
      'member.sessions_revoke', 'membership', v_membership.id, 'success', null,
      jsonb_build_object('count', app.idp_revoke_sessions(u.auth_provider, u.auth_subject))
    )
    from app.user_account u where u.id = v_membership.user_id;
  end if;

  perform app.assert_tenant_keeps_admin(v_tenant);
  return v_version;
end
$$;

grant execute on function
  app.current_factor_scope(), app.current_session_id(), app.factor_scope_allows(text)
to etare_api, etare_worker;

grant execute on function
  app.my_memberships(),
  app.my_second_factor(),
  app.my_sessions(),
  app.revoke_my_sessions(uuid),
  app.security_settings(),
  app.update_security_settings(text),
  app.member_identity_states()
to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
