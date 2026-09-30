-- =============================================================================
-- Foundation: extensions, private business schema, application roles, helpers.
--
-- Principles (see docs/database.md and docs/security.md):
--   * PostgreSQL/PostGIS is the source of truth; business tables live in the
--     private schema "app", never exposed through the Supabase Data API.
--   * The product API connects as "etare_api", workers as "etare_worker".
--     Neither owns the tables, neither is superuser nor BYPASSRLS.
--   * Each request runs in a transaction whose verified context (user, tenant,
--     assurance level, trace id) is set transaction-locally by app.begin_request().
--   * This file only uses standard PostgreSQL + PostGIS (no Supabase specifics).
-- =============================================================================

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema app;
comment on schema app is
  'Private business schema. Never exposed through the Data API; accessed only by the product API (etare_api) and workers (etare_worker).';

revoke all on schema app from public;
-- NOTE: PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and a per-schema
-- ALTER DEFAULT PRIVILEGES cannot remove it. Every migration creating routines in "app"
-- therefore ends with an explicit REVOKE (enforced by supabase/tests/database/00_structure).

-- -----------------------------------------------------------------------------
-- Application roles. Created NOLOGIN: the login (and its password) is granted
-- per environment, outside migrations (local: supabase/seed.sql).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select from pg_roles where rolname = 'etare_api') then
    create role etare_api nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'etare_worker') then
    create role etare_worker nologin noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
  end if;
end
$$;

comment on role etare_api is 'Product API (web route handlers). Subject to RLS, no DELETE on business tables.';
comment on role etare_worker is 'Asynchronous workers. Subject to RLS, uses dedicated SECURITY DEFINER queue functions.';

-- The migration identity may impersonate the application roles (tests, seeds), without inheriting their rights.
grant etare_api, etare_worker to current_user with inherit false, set true;

grant usage on schema app to etare_api, etare_worker;
grant usage on schema extensions to etare_api, etare_worker;

-- -----------------------------------------------------------------------------
-- Request context accessors (transaction-local settings written by begin_request).
-- -----------------------------------------------------------------------------
create function app.current_user_id() returns uuid
language sql stable
set search_path = ''
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app.current_tenant_id() returns uuid
language sql stable
set search_path = ''
as $$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

create function app.current_aal() returns text
language sql stable
set search_path = ''
as $$ select coalesce(nullif(current_setting('app.aal', true), ''), 'aal1') $$;

create function app.current_trace_id() returns uuid
language sql stable
set search_path = ''
as $$ select nullif(current_setting('app.trace_id', true), '')::uuid $$;

create function app.current_origin() returns text
language sql stable
set search_path = ''
as $$ select coalesce(nullif(current_setting('app.origin', true), ''), 'db') $$;

create function app.current_actor_type() returns text
language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.actor_type', true), ''),
    case when app.current_user_id() is null then 'system' else 'user' end
  )
$$;

-- True when the code runs as the product API or a worker (as opposed to a DBA,
-- a migration or the seed). Business guards always apply to application sessions.
-- 'USAGE' (not 'MEMBER'): the migration identity is a member of the application
-- roles WITHOUT inheriting them, so that it can impersonate them in tests.
create function app.is_application_session() returns boolean
language sql stable
set search_path = ''
as $$
  select pg_has_role(session_user, 'etare_api', 'USAGE')
      or pg_has_role(session_user, 'etare_worker', 'USAGE')
      or pg_has_role(current_user, 'etare_api', 'USAGE')
      or pg_has_role(current_user, 'etare_worker', 'USAGE')
$$;

grant execute on function
  app.current_user_id(), app.current_tenant_id(), app.current_aal(), app.current_trace_id(),
  app.current_origin(), app.current_actor_type(), app.is_application_session()
to etare_api, etare_worker;

-- -----------------------------------------------------------------------------
-- Generic row triggers.
-- -----------------------------------------------------------------------------

-- Maintains updated_at / row_version (optimistic concurrency, If-Match) and
-- protects identity columns.
create function app.tg_touch_row() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'id is immutable on %', tg_table_name using errcode = '23000';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable on %', tg_table_name using errcode = '23000';
  end if;
  new.updated_at := now();
  new.row_version := old.row_version + 1;
  return new;
end
$$;

-- A row never moves from one tenant to another (defence in depth next to RLS WITH CHECK).
create function app.tg_forbid_tenant_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable on %', tg_table_name using errcode = '23000';
  end if;
  return new;
end
$$;

-- Declares the standard triggers of a tenant-owned mutable table.
create procedure app.install_tenant_table_triggers(p_table regclass)
language plpgsql
set search_path = ''
as $$
begin
  execute format('create trigger touch_row before update on %s for each row execute function app.tg_touch_row()', p_table);
  execute format('create trigger forbid_tenant_change before update on %s for each row execute function app.tg_forbid_tenant_change()', p_table);
end
$$;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
