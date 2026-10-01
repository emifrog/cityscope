-- =============================================================================
-- Sprint 4 — photos attached to operational objects (PLAN-05).
--
-- A photo is a checked file (same controlled upload chain as documents and
-- plan backgrounds: quarantine, worker verification) linked to one object of
-- the same site. Only images are accepted. A photo is archived, never deleted;
-- once checked, it travels with the snapshot, the manifest and the offline
-- package, so that it can be seen from the plan and from the object sheet.
-- =============================================================================

create table app.object_photo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  site_id uuid not null,
  object_id uuid not null,
  asset_id uuid not null unique,
  caption text check (length(btrim(caption)) between 1 and 200),
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid default app.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (tenant_id, site_id, id),
  foreign key (tenant_id, site_id, object_id) references app.operational_object (tenant_id, site_id, id),
  foreign key (tenant_id, asset_id) references app.asset (tenant_id, id)
);
comment on table app.object_photo is 'Photo of an operational object (PLAN-05): a checked image of the same site, archived rather than deleted.';
create index object_photo_object_idx on app.object_photo (object_id) where status = 'active';

-- The file is an image of the same site; the link never moves; archiving is final.
create function app.tg_object_photo_guard() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset app.asset;
begin
  if tg_op = 'DELETE' then
    raise exception 'photos are archived, never deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if (new.object_id, new.asset_id, new.site_id) is distinct from (old.object_id, old.asset_id, old.site_id) then
      raise exception 'a photo stays attached to its object and file' using errcode = '23514';
    end if;
    if old.status = 'archived' and new.status <> 'archived' then
      raise exception 'an archived photo stays archived' using errcode = '23514';
    end if;
    return new;
  end if;
  select * into v_asset from app.asset a where a.id = new.asset_id and a.tenant_id = new.tenant_id;
  if v_asset.site_id is distinct from new.site_id
     or v_asset.mime_type not in ('image/png', 'image/jpeg', 'image/webp') then
    raise exception 'PHOTO_ASSET_INVALID: a photo is an image of the same site' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger object_photo_guard before insert or update or delete on app.object_photo
for each row execute function app.tg_object_photo_guard();

call app.install_tenant_table_triggers('app.object_photo');
call app.install_site_scoped_policies('app.object_photo', 'site:read', 'site:write');
call app.install_site_edit_trigger('app.object_photo');
call app.install_audit_trigger('app.object_photo');

revoke all on all routines in schema app from public;
