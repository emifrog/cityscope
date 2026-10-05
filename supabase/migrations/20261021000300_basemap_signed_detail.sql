-- =============================================================================
-- Sprint 11 — fix: a detail area of a base map surrounds only the sites actually
-- distributed to the tablets, whose version in force is signed (ADR-024). A version
-- published before the signature of packages is not distributed: no detail area.
-- =============================================================================

-- What the base map of a sector covers: the extent of its located sites (general view)
-- and the sites distributed to the tablets (signed version in force: detail areas), with a
-- signature that moves when either changes. Restricted or high sites never mark a detail area.
create or replace function app.basemap_coverage(p_sector_id uuid) returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  with sector as (
    select sc.id, sc.tenant_id from app.sector sc where sc.id = p_sector_id and sc.status = 'active'
  ),
  located as (
    select s.id, s.geom, s.sensitivity
    from sector sc
    join app.site s on s.tenant_id = sc.tenant_id
    where s.status <> 'archived' and s.geom is not null and app.site_in_sector(s.id, sc.id)
  ),
  detail as (
    select distinct round(extensions.st_x(l.geom)::numeric, 5) as lon, round(extensions.st_y(l.geom)::numeric, 5) as lat
    from located l
    where exists (
      select 1 from app.publication p
      where p.site_id = l.id and p.status = 'published' and p.manifest_signature is not null
        and app.effective_sensitivity(p.sensitivity, l.sensitivity) = 'normal'
    )
  ),
  box as (
    select extensions.st_extent(l.geom)::extensions.geometry as e from located l
  ),
  summary as (
    select
      (select count(*) from located)::integer as site_count,
      (select case when b.e is null then null
                   else jsonb_build_array(round(extensions.st_xmin(b.e)::numeric, 5), round(extensions.st_ymin(b.e)::numeric, 5),
                                          round(extensions.st_xmax(b.e)::numeric, 5), round(extensions.st_ymax(b.e)::numeric, 5))
              end from box b) as extent,
      coalesce((select jsonb_agg(jsonb_build_array(d.lon, d.lat) order by d.lon, d.lat) from detail d), '[]'::jsonb)
        as detail
  )
  select jsonb_build_object(
    'site_count', s.site_count,
    'extent', s.extent,
    'detail', s.detail,
    'signature', md5(coalesce(s.extent::text, '') || '|' || s.detail::text)
  )
  from summary s
$$;
