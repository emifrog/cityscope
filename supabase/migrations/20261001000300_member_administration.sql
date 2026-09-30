-- =============================================================================
-- Sprint 1 — administration of the members of a SIS (ADR-010).
--
-- Identity tables stay read-only for the API: every change goes through the
-- functions below, which re-check member:manage (second factor included, see
-- app.has_permission) and enforce, in the database itself:
--   * nobody changes their own membership or roles (no self-escalation);
--   * only tenant-level system roles are granted tenant-wide: never a platform
--     role, never EXPLOITANT (always limited to sites, operator portal);
--   * a SIS always keeps at least one active administrator;
--   * optimistic concurrency on the membership (row_version).
-- Every change is recorded by the audit triggers of user_account, membership
-- and role_binding (actor and origin come from the request context).
-- =============================================================================

-- A binding can be revoked, then granted again: uniqueness only among live bindings.
alter table app.role_binding drop constraint role_binding_membership_id_role_id_scope_type_scope_id_key;
create unique index role_binding_live_uq on app.role_binding (membership_id, role_id, scope_type, scope_id)
  nulls not distinct where revoked_at is null;

create function app.require_member_manager() returns uuid
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if app.current_tenant_id() is null or not app.has_permission('member:manage') then
    raise exception 'member:manage required' using errcode = '42501';
  end if;
  return app.current_tenant_id();
end
$$;

-- Resolves role codes that may be granted tenant-wide by a SIS administrator.
create function app.grantable_role_ids(p_roles text[], p_allow_empty boolean) returns uuid[]
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_codes text[] := array(select distinct unnest(coalesce(p_roles, '{}')));
  v_ids uuid[];
begin
  if cardinality(v_codes) = 0 then
    if p_allow_empty then
      return '{}'::uuid[];
    end if;
    raise exception 'at least one role is required' using errcode = '22023';
  end if;
  select coalesce(array_agg(r.id), '{}') into v_ids
  from app.role r
  where r.code = any (v_codes)
    and r.tenant_id is null
    and r.is_system
    and r.level = 'tenant'
    and r.code <> 'EXPLOITANT';
  if cardinality(v_ids) <> cardinality(v_codes) then
    raise exception 'role not grantable tenant-wide' using errcode = '22023';
  end if;
  return v_ids;
end
$$;

create function app.assert_tenant_keeps_admin(p_tenant_id uuid) returns void
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from app.membership m
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    join app.role_binding b
      on b.membership_id = m.id
     and b.revoked_at is null
     and b.scope_type = 'tenant'
     and (b.valid_until is null or b.valid_until > now())
    join app.role r on r.id = b.role_id and r.code = 'SIS_ADMIN' and r.tenant_id is null
    where m.tenant_id = p_tenant_id and m.status = 'active'
  ) then
    raise exception 'a SIS keeps at least one active administrator' using errcode = 'ETADM';
  end if;
end
$$;

-- Adds a person to the current SIS with tenant-wide roles.
-- Without p_auth_subject, only an existing account is attached: no row is
-- returned when the address has no account yet, so the caller creates the
-- identity (invitation) and calls again with its subject.
create function app.admin_add_member(
  p_email text,
  p_display_name text,
  p_roles text[],
  p_auth_subject text default null,
  p_auth_provider text default 'supabase'
)
returns table (membership_id uuid, user_id uuid, account_created boolean)
language plpgsql volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.require_member_manager();
  v_actor uuid := app.current_user_id();
  v_role_ids uuid[] := app.grantable_role_ids(p_roles, false);
  v_user app.user_account;
  v_membership_id uuid;
  v_created boolean := false;
begin
  select * into v_user
  from app.user_account u
  where u.auth_provider = p_auth_provider and u.email = p_email::extensions.citext;

  if not found then
    if p_auth_subject is null then
      return;
    end if;
    insert into app.user_account (auth_provider, auth_subject, email, display_name)
    values (p_auth_provider, p_auth_subject, p_email, nullif(btrim(p_display_name), ''))
    returning * into v_user;
    v_created := true;
  elsif p_auth_subject is not null and v_user.auth_subject <> p_auth_subject then
    raise exception 'this address is linked to another identity' using errcode = '23505',
      constraint = 'user_account_auth_provider_email_key';
  end if;

  if v_user.id = v_actor then
    raise exception 'nobody changes their own membership' using errcode = 'ETSLF';
  end if;

  if exists (select 1 from app.membership m where m.tenant_id = v_tenant and m.user_id = v_user.id) then
    raise exception 'already a member of this SIS' using errcode = '23505',
      constraint = 'membership_tenant_id_user_id_key';
  end if;

  insert into app.membership (tenant_id, user_id, created_by)
  values (v_tenant, v_user.id, v_actor)
  returning id into v_membership_id;

  insert into app.role_binding (tenant_id, membership_id, role_id, created_by)
  select v_tenant, v_membership_id, granted.role_id, v_actor
  from unnest(v_role_ids) as granted (role_id);

  return query select v_membership_id, v_user.id, v_created;
end
$$;

-- Changes the tenant-wide roles and/or the status of a member of the current SIS.
-- Site-scoped bindings (e.g. EXPLOITANT) are left untouched. Returns the new row_version.
create function app.admin_update_member(
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

  perform app.assert_tenant_keeps_admin(v_tenant);
  return v_version;
end
$$;

-- Would the current user hold p_permission (tenant-wide) with a second factor? Lets the API
-- answer MFA_REQUIRED only to people whose roles grant the permission, FORBIDDEN to the others.
create function app.holds_with_second_factor(p_permission text) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    join app.user_account u on u.id = m.user_id and u.status = 'active'
    join app.role_binding rb
      on rb.membership_id = m.id
     and rb.revoked_at is null
     and (rb.valid_until is null or rb.valid_until > now())
     and rb.scope_type = 'tenant'
    join app.role_permission rp on rp.role_id = rb.role_id and rp.permission_code = p_permission
    where m.user_id = app.current_user_id()
      and m.tenant_id = app.current_tenant_id()
      and m.status = 'active'
  )
$$;

grant execute on function
  app.admin_add_member(text, text, text[], text, text),
  app.admin_update_member(uuid, integer, text[], text),
  app.holds_with_second_factor(text)
to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
