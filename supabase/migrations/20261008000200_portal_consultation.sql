-- =============================================================================
-- Sprint 7 / R2 — exploitant portal: consultation (POR-02, ADR-019).
--
-- The exploitant reads the version the SIS published, never the working data,
-- and only a minimal whitelist of it: identity and address of the site, its
-- classifications, the contacts given to the intervening teams, the list of
-- plans (titles and types, never their images) and the documents the SIS
-- marked visible to the exploitant. Access codes, risks, objects (water
-- points included), zones, photos and plan images are never returned.
--
--   * document.portal_visible: set by the Prévision on the working data, it is
--     frozen in the snapshot (portal_visible: true) and takes effect with the
--     next publication only.
--   * portal_sites, portal_site, portal_document_file: SECURITY DEFINER,
--     filtered by site with has_permission('portal:read', site), which also
--     applies the second factor setting of the SIS (portal_mfa_required).
-- =============================================================================

alter table app.document add column portal_visible boolean not null default false;
comment on column app.document.portal_visible is
  'Shown on the exploitant portal once published (frozen in the snapshot, POR-02).';

-- Live EXPLOITANT bindings of the current person in the current SIS, by site,
-- with the end of the access (null: until the SIS ends it).
create function app.portal_bound_sites()
returns table (site_id uuid, access_until timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select rb.scope_id,
         case when bool_or(rb.valid_until is null) then null else max(rb.valid_until) end
  from app.role_binding rb
  join app.membership m on m.id = rb.membership_id and m.tenant_id = rb.tenant_id
  join app.role r on r.id = rb.role_id and r.code = 'EXPLOITANT' and r.tenant_id is null
  where m.user_id = app.current_user_id() and m.tenant_id = app.current_tenant_id()
    and rb.scope_type = 'site' and rb.revoked_at is null
    and (rb.valid_until is null or rb.valid_until > now())
  group by rb.scope_id
$$;

-- Sites open to the current exploitant, with the published version if any.
create function app.portal_sites()
returns table (id uuid, name text, etare_number text, access_until timestamptz,
               publication_number integer, published_at timestamptz)
language sql stable
security definer
set search_path = ''
as $$
  select s.id,
         coalesce(p.payload #>> '{data,site,name}', s.name),
         case when p.id is null then s.etare_number else p.payload #>> '{data,site,etare_number}' end,
         b.access_until, p.publication_number, p.published_at
  from app.portal_bound_sites() b
  join app.site s on s.id = b.site_id and s.tenant_id = app.current_tenant_id() and s.status <> 'archived'
  left join app.publication p
    on p.tenant_id = s.tenant_id and p.site_id = s.id and p.id = s.active_publication_id and p.status = 'published'
  where app.has_permission('portal:read', s.id)
  order by lower(coalesce(p.payload #>> '{data,site,name}', s.name)), s.id
$$;

-- What the exploitant sees of one site: a whitelist of its published version
-- (null when the site is not open to them).
create function app.portal_site(p_site_id uuid) returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_site app.site;
  v_access record;
  v_publication app.publication;
  v_data jsonb;
begin
  select b.* into v_access from app.portal_bound_sites() b where b.site_id = p_site_id;
  if not found or not app.has_permission('portal:read', p_site_id) then
    return null;
  end if;
  select s.* into v_site from app.site s
  where s.id = p_site_id and s.tenant_id = app.current_tenant_id() and s.status <> 'archived';
  if not found then
    return null;
  end if;
  select p.* into v_publication from app.publication p
  where p.tenant_id = v_site.tenant_id and p.site_id = v_site.id and p.id = v_site.active_publication_id
    and p.status = 'published';
  if v_publication.id is null then
    return jsonb_build_object(
      'id', v_site.id, 'name', v_site.name, 'short_name', v_site.short_name,
      'etare_number', v_site.etare_number, 'site_type', v_site.site_type, 'address', null,
      'access_until', v_access.access_until, 'publication', null,
      'classifications', '[]'::jsonb, 'contacts', '[]'::jsonb, 'plans', '[]'::jsonb, 'documents', '[]'::jsonb);
  end if;
  v_data := coalesce(v_publication.payload -> 'data', '{}'::jsonb);

  return jsonb_build_object(
    'id', v_site.id,
    'name', coalesce(v_data #>> '{site,name}', v_site.name),
    'short_name', v_data #>> '{site,short_name}',
    'etare_number', v_data #>> '{site,etare_number}',
    'site_type', coalesce(v_data #>> '{site,site_type}', v_site.site_type),
    'address', case when jsonb_typeof(v_data #> '{site,address}') = 'object' then jsonb_build_object(
      'label', v_data #>> '{site,address,label}',
      'street', v_data #>> '{site,address,street}',
      'postal_code', v_data #>> '{site,address,postal_code}',
      'city', v_data #>> '{site,address,city}') end,
    'access_until', v_access.access_until,
    'publication', jsonb_build_object(
      'publication_number', v_publication.publication_number,
      'published_at', v_publication.published_at),
    'classifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'classification_type', c ->> 'classification_type', 'code', c ->> 'code', 'category', c ->> 'category',
        'label', c ->> 'label', 'valid_from', c ->> 'valid_from', 'valid_to', c ->> 'valid_to') order by n)
      from jsonb_array_elements(v_data -> 'classifications') with ordinality as x(c, n)), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', c ->> 'name', 'role', c ->> 'role', 'phone', c ->> 'phone', 'phone_alt', c ->> 'phone_alt',
        'email', c ->> 'email', 'availability', c ->> 'availability', 'verified_at', c ->> 'verified_at') order by n)
      from jsonb_array_elements(v_data -> 'contacts') with ordinality as x(c, n)), '[]'::jsonb),
    'plans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pl ->> 'id', 'title', pl ->> 'title', 'plan_type', pl ->> 'plan_type',
        'building_name', (select bu ->> 'name' from jsonb_array_elements(v_data -> 'buildings') bu
                          where bu ->> 'id' = pl ->> 'building_id'),
        'level_name', (select lv ->> 'name' from jsonb_array_elements(v_data -> 'buildings') bu,
                              jsonb_array_elements(bu -> 'levels') lv
                       where lv ->> 'id' = pl ->> 'level_id'),
        'revision_no', (pl #>> '{background,revision_no}')::integer) order by n)
      from jsonb_array_elements(v_data -> 'plans') with ordinality as x(pl, n)), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d ->> 'id', 'title', d ->> 'title', 'category', d ->> 'category',
        'version_no', (d #>> '{version,version_no}')::integer,
        'valid_from', d #>> '{version,valid_from}', 'expires_at', d #>> '{version,expires_at}',
        'filename', d #>> '{version,asset,filename}', 'mime_type', d #>> '{version,asset,mime_type}',
        'size_bytes', (d #>> '{version,asset,size_bytes}')::bigint) order by n)
      from jsonb_array_elements(v_data -> 'documents') with ordinality as x(d, n)
      where d -> 'portal_visible' = 'true'::jsonb), '[]'::jsonb)
  );
end;
$$;

-- File of a document visible to the exploitant in the published version of a
-- site (empty when the site is not open to them or the document is not shown).
create function app.portal_document_file(p_site_id uuid, p_document_id uuid)
returns table (asset_id uuid, storage_key text, filename text, mime_type text)
language sql stable
security definer
set search_path = ''
as $$
  select a.id, a.storage_key, a.filename, a.mime_type
  from app.portal_bound_sites() b
  join app.site s on s.id = b.site_id and s.tenant_id = app.current_tenant_id() and s.status <> 'archived'
  join app.publication p
    on p.tenant_id = s.tenant_id and p.site_id = s.id and p.id = s.active_publication_id and p.status = 'published'
  cross join lateral jsonb_array_elements(p.payload #> '{data,documents}') d
  join app.asset a
    on a.tenant_id = s.tenant_id and a.site_id = s.id
   and a.id::text = d #>> '{version,asset,id}' and a.sha256 = d #>> '{version,asset,sha256}'
   and a.scan_status = 'clean'
  where b.site_id = p_site_id and d ->> 'id' = p_document_id::text and d -> 'portal_visible' = 'true'::jsonb
    and app.has_permission('portal:read', s.id)
$$;

revoke all on function app.portal_bound_sites() from public;
grant execute on function
  app.portal_sites(),
  app.portal_site(uuid),
  app.portal_document_file(uuid, uuid)
to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
