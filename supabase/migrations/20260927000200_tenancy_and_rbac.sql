-- =============================================================================
-- Tenancy, identities, memberships and extensible RBAC.
--
--   tenant          one SIS (autorité de publication). Never called "organization":
--                   that name is reserved for operators/partners (data model doc, §3).
--   user_account    a person, independent from the identity provider (auth_subject).
--   membership      a person belongs to 0..n tenants.
--   role            system roles (shared) or tenant-specific roles (future).
--   permission      fine-grained capabilities; roles are bundles of permissions.
--   role_binding    role granted to a membership, optionally scoped to a site/sector.
--   platform_admin  holders of SUPER_ADMIN: platform operations only, NO business data access.
-- =============================================================================

create table app.tenant (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(btrim(name)) between 2 and 200),
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  -- Functional settings (e.g. {"mfa_required_for_privileged": true}). Never used to store secrets.
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);
comment on table app.tenant is 'A SIS (service d''incendie et de secours): isolation boundary of all business data.';

create trigger touch_row before update on app.tenant for each row execute function app.tg_touch_row();

create table app.user_account (
  id uuid primary key default gen_random_uuid(),
  auth_provider text not null default 'supabase' check (auth_provider in ('supabase', 'oidc', 'saml')),
  auth_subject text not null check (length(auth_subject) between 1 and 255),
  email extensions.citext not null check (length(email) <= 254),
  display_name text check (length(display_name) <= 200),
  status text not null default 'active' check (status in ('active', 'disabled', 'pending')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (auth_provider, auth_subject),
  unique (auth_provider, email)
);
comment on table app.user_account is
  'Product identity. Linked to the identity provider by (auth_provider, auth_subject), never by a foreign key to auth.users (portability, ADR-003).';

create trigger touch_row before update on app.user_account for each row execute function app.tg_touch_row();

create table app.membership (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  user_id uuid not null references app.user_account (id),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, user_id),
  unique (tenant_id, id)
);
create index membership_user_idx on app.membership (user_id);

call app.install_tenant_table_triggers('app.membership');

create table app.permission (
  code text primary key check (code ~ '^[a-z_]+:[a-z_]+$'),
  description text not null,
  -- Privileged permissions require a second factor (aal2) unless the tenant explicitly opts out.
  requires_aal2 boolean not null default false
);

create table app.role (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references app.tenant (id),
  code text not null check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  description text,
  level text not null default 'tenant' check (level in ('platform', 'tenant')),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  check ((is_system and tenant_id is null) or (not is_system and tenant_id is not null)),
  check (level = 'tenant' or is_system)
);
create unique index role_system_code_uq on app.role (code) where tenant_id is null;
create unique index role_tenant_code_uq on app.role (tenant_id, code) where tenant_id is not null;

create table app.role_permission (
  role_id uuid not null references app.role (id),
  permission_code text not null references app.permission (code),
  primary key (role_id, permission_code)
);

create table app.role_binding (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references app.tenant (id),
  membership_id uuid not null,
  role_id uuid not null references app.role (id),
  scope_type text not null default 'tenant' check (scope_type in ('tenant', 'sector', 'site')),
  scope_id uuid,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  foreign key (tenant_id, membership_id) references app.membership (tenant_id, id),
  check ((scope_type = 'tenant') = (scope_id is null)),
  unique nulls not distinct (membership_id, role_id, scope_type, scope_id)
);
create index role_binding_membership_idx on app.role_binding (membership_id) where revoked_at is null;

-- A binding may only reference a system role or a role of the same tenant, and never a platform role.
create function app.tg_role_binding_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role app.role;
begin
  select * into v_role from app.role where id = new.role_id;
  if v_role.level = 'platform' then
    raise exception 'role % is a platform role and cannot be bound inside a tenant', v_role.code using errcode = '23514';
  end if;
  if v_role.tenant_id is not null and v_role.tenant_id <> new.tenant_id then
    raise exception 'role % belongs to another tenant', v_role.code using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.role_id, new.membership_id, new.scope_type, new.scope_id)
     is distinct from (old.role_id, old.membership_id, old.scope_type, old.scope_id) then
    raise exception 'a role binding is revoked and re-created, never rewritten' using errcode = '23000';
  end if;
  return new;
end
$$;

create trigger role_binding_guard before insert or update on app.role_binding
for each row execute function app.tg_role_binding_guard();
create trigger forbid_tenant_change before update on app.role_binding
for each row execute function app.tg_forbid_tenant_change();

create table app.platform_admin (
  user_id uuid primary key references app.user_account (id),
  granted_at timestamptz not null default now(),
  granted_by uuid,
  reason text not null
);
comment on table app.platform_admin is
  'Holders of SUPER_ADMIN (platform operations). Grants NO access to business data; exceptional support access (break-glass) will be a separate, time-boxed and audited mechanism.';

-- -----------------------------------------------------------------------------
-- Reference data: permissions and system roles (mirrored in packages/domain).
-- -----------------------------------------------------------------------------
insert into app.permission (code, description, requires_aal2) values
  ('site:read', 'Lire les données de travail des sites', false),
  ('site:write', 'Créer et modifier les données de travail des sites', false),
  ('etare:read', 'Lire les dossiers ETARE et leurs révisions', false),
  ('etare:edit', 'Préparer une révision ETARE (brouillon)', false),
  ('etare:submit', 'Soumettre une révision à validation', false),
  ('etare:approve', 'Valider ou refuser une révision soumise', true),
  ('publication:publish', 'Déclencher la publication d''une révision validée', true),
  ('publication:read', 'Consulter les versions publiées', false),
  ('offline:download', 'Télécharger les paquets hors ligne', false),
  ('field_report:create', 'Créer un signalement terrain', false),
  ('contribution:create', 'Proposer une modification (exploitant)', false),
  ('portal:read', 'Consulter la vue exploitant des sites attribués', false),
  ('audit:read', 'Consulter le journal d''audit du SIS', false),
  ('member:manage', 'Gérer les comptes et habilitations du SIS', true),
  ('device:manage', 'Gérer les terminaux du SIS', true),
  ('catalog:manage', 'Gérer les catalogues d''objets et de risques du SIS', false);

insert into app.role (code, name, description, level, is_system) values
  ('SUPER_ADMIN', 'Administrateur plateforme', 'Exploitation technique de la plateforme, sans accès métier.', 'platform', true),
  ('SIS_ADMIN', 'Administrateur SIS', 'Paramétrage du SIS, comptes, terminaux, catalogues. Ne valide ni ne publie sans le rôle validateur.', 'tenant', true),
  ('PREVISION_EDITOR', 'Rédacteur prévision', 'Crée et modifie les sites et ETARE, soumet à validation.', 'tenant', true),
  ('PREVISION_VALIDATOR', 'Validateur prévision', 'Contrôle, valide ou refuse une révision et déclenche la publication.', 'tenant', true),
  ('OPS_USER', 'Intervenant OPS', 'Consulte les versions publiées et signale les écarts terrain.', 'tenant', true),
  ('EXPLOITANT', 'Exploitant', 'Consulte sa vue restreinte et propose des mises à jour.', 'tenant', true),
  ('READER', 'Lecteur', 'Lecture seule, sans modification.', 'tenant', true);

insert into app.role_permission (role_id, permission_code)
select r.id, g.permission_code
from (values
  ('SIS_ADMIN', 'site:read'), ('SIS_ADMIN', 'site:write'), ('SIS_ADMIN', 'etare:read'), ('SIS_ADMIN', 'etare:edit'),
  ('SIS_ADMIN', 'publication:read'), ('SIS_ADMIN', 'audit:read'), ('SIS_ADMIN', 'member:manage'),
  ('SIS_ADMIN', 'device:manage'), ('SIS_ADMIN', 'catalog:manage'),
  ('PREVISION_EDITOR', 'site:read'), ('PREVISION_EDITOR', 'site:write'), ('PREVISION_EDITOR', 'etare:read'),
  ('PREVISION_EDITOR', 'etare:edit'), ('PREVISION_EDITOR', 'etare:submit'), ('PREVISION_EDITOR', 'publication:read'),
  ('PREVISION_VALIDATOR', 'site:read'), ('PREVISION_VALIDATOR', 'etare:read'), ('PREVISION_VALIDATOR', 'etare:approve'),
  ('PREVISION_VALIDATOR', 'publication:publish'), ('PREVISION_VALIDATOR', 'publication:read'),
  ('OPS_USER', 'publication:read'), ('OPS_USER', 'offline:download'), ('OPS_USER', 'field_report:create'),
  ('EXPLOITANT', 'portal:read'), ('EXPLOITANT', 'contribution:create'),
  ('READER', 'site:read'), ('READER', 'etare:read'), ('READER', 'publication:read')
) as g (role_code, permission_code)
join app.role r on r.code = g.role_code and r.tenant_id is null;

-- -----------------------------------------------------------------------------
-- Authorization functions (SECURITY DEFINER: they read identity tables that
-- the application roles cannot browse freely).
-- -----------------------------------------------------------------------------

-- Does the current user hold p_permission in the current tenant?
-- p_site_id = null: only tenant-wide bindings count; otherwise site-scoped bindings on that site count too.
create function app.has_permission(p_permission text, p_site_id uuid default null) returns boolean
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
  )
$$;

-- Permissions effectively available in the current context (tenant-wide bindings).
create function app.current_permissions() returns text[]
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p.code order by p.code), '{}')
  from app.permission p
  where app.has_permission(p.code)
$$;

-- Tenants and roles of the current user (for GET /me, without tenant context).
create function app.my_memberships()
returns table (tenant_id uuid, tenant_slug text, tenant_name text, roles text[])
language sql stable
security definer
set search_path = ''
as $$
  select t.id, t.slug, t.name,
         coalesce(array_agg(distinct r.code order by r.code) filter (where r.code is not null), '{}')
  from app.membership m
  join app.tenant t on t.id = m.tenant_id and t.status = 'active'
  left join app.role_binding rb
    on rb.membership_id = m.id
   and rb.revoked_at is null
   and (rb.valid_until is null or rb.valid_until > now())
  left join app.role r on r.id = rb.role_id
  where m.user_id = app.current_user_id()
    and m.status = 'active'
  group by t.id, t.slug, t.name
  order by t.name
$$;

-- Opens the verified context of an API request. Must be the first statement of
-- the transaction. The caller (the API) has already verified the JWT; this
-- function re-checks, in the database, that the account is active and that the
-- membership exists (a tenant id sent by a client is never an authorization).
create function app.begin_request(
  p_auth_provider text,
  p_auth_subject text,
  p_tenant_id uuid,
  p_aal text,
  p_trace_id uuid,
  p_origin text
)
returns table (user_id uuid, tenant_id uuid, permissions text[])
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_aal is null or p_aal not in ('aal1', 'aal2') then
    raise exception 'invalid assurance level' using errcode = '22023';
  end if;
  if p_origin is null or p_origin not in ('web', 'mobile', 'api', 'integration') then
    raise exception 'invalid request origin' using errcode = '22023';
  end if;

  select u.id into v_user_id
  from app.user_account u
  where u.auth_provider = p_auth_provider
    and u.auth_subject = p_auth_subject
    and u.status = 'active';
  if v_user_id is null then
    raise exception 'unknown or inactive account' using errcode = 'ET401';
  end if;

  if p_tenant_id is not null and not exists (
    select 1
    from app.membership m
    join app.tenant t on t.id = m.tenant_id and t.status = 'active'
    where m.user_id = v_user_id and m.tenant_id = p_tenant_id and m.status = 'active'
  ) then
    raise exception 'not a member of this tenant' using errcode = 'ET403';
  end if;

  perform set_config('app.user_id', v_user_id::text, true);
  perform set_config('app.tenant_id', coalesce(p_tenant_id::text, ''), true);
  perform set_config('app.aal', p_aal, true);
  perform set_config('app.trace_id', coalesce(p_trace_id::text, ''), true);
  perform set_config('app.origin', p_origin, true);
  perform set_config('app.actor_type', 'user', true);

  return query
  select v_user_id,
         p_tenant_id,
         case when p_tenant_id is null then '{}'::text[] else app.current_permissions() end;
end
$$;

grant execute on function app.has_permission(text, uuid), app.current_permissions(), app.my_memberships()
to etare_api, etare_worker;
grant execute on function app.begin_request(text, text, uuid, text, uuid, text) to etare_api;

-- -----------------------------------------------------------------------------
-- Grants and RLS. Identity tables are read-only for the API in Sprint 0
-- (administration use cases come later, through dedicated functions).
-- -----------------------------------------------------------------------------
alter table app.tenant enable row level security;
alter table app.user_account enable row level security;
alter table app.membership enable row level security;
alter table app.permission enable row level security;
alter table app.role enable row level security;
alter table app.role_permission enable row level security;
alter table app.role_binding enable row level security;
alter table app.platform_admin enable row level security;

grant select on app.tenant, app.user_account, app.membership, app.permission, app.role,
  app.role_permission, app.role_binding to etare_api;

create policy tenant_select_member on app.tenant for select to etare_api
using (exists (
  select 1 from app.membership m
  where m.tenant_id = tenant.id and m.user_id = (select app.current_user_id()) and m.status = 'active'
));

create policy user_account_select on app.user_account for select to etare_api
using (
  id = (select app.current_user_id())
  or (
    (select app.has_permission('member:manage'))
    and exists (
      select 1 from app.membership m
      where m.user_id = user_account.id and m.tenant_id = (select app.current_tenant_id())
    )
  )
);

create policy membership_select on app.membership for select to etare_api
using (
  user_id = (select app.current_user_id())
  or (tenant_id = (select app.current_tenant_id()) and (select app.has_permission('member:manage')))
);

create policy permission_select on app.permission for select to etare_api using (true);
create policy role_permission_select on app.role_permission for select to etare_api using (true);
create policy role_select on app.role for select to etare_api
using (tenant_id is null or tenant_id = (select app.current_tenant_id()));

create policy role_binding_select on app.role_binding for select to etare_api
using (
  tenant_id = (select app.current_tenant_id())
  and (
    exists (select 1 from app.membership m where m.id = role_binding.membership_id and m.user_id = (select app.current_user_id()))
    or (select app.has_permission('member:manage'))
  )
);
-- app.platform_admin: no grant, no policy (invisible to application roles).

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
