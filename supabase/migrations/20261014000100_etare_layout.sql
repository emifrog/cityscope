-- =============================================================================
-- Sprint 10 — MET-05: sections of the ETARE (DEC-05, ADR-026).
--
--   * One national registry of sections (packages/domain, etare-layout.ts);
--     the SIS may hide the optional ones (Énergies, Moyens de secours, Plans,
--     Annexes, Photos). Synthèse, Accès, Risques, Eau and Contacts stay.
--   * The setting is read by the API in the transaction that freezes a
--     revision: the snapshot carries it, so a publication never changes when
--     the setting does. Changing it requires catalog:manage and is audited.
-- =============================================================================

-- Optional sections hidden by the current SIS, in the order of the registry.
-- Readable by every member of the SIS: the editors freeze it into their revisions.
create function app.etare_layout_settings() returns table (hidden_sections text[])
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(
    array(
      select s.section
      from unnest(array['energy', 'rescue', 'plans', 'annexes', 'photos']) with ordinality s (section, position)
      where t.settings -> 'etare_hidden_sections' ? s.section
      order by s.position
    ),
    '{}'
  )
  from app.tenant t
  where t.id = app.current_tenant_id()
$$;

create function app.update_etare_layout_settings(p_hidden text[]) returns text[]
language plpgsql volatile
security definer
set search_path = ''
as $$
declare
  v_before text[];
  v_after text[];
begin
  if p_hidden is null
     or exists (
       select 1 from unnest(p_hidden) h (section)
       where h.section is null or h.section not in ('energy', 'rescue', 'plans', 'annexes', 'photos')
     ) then
    raise exception 'only optional sections can be hidden' using errcode = '22023';
  end if;
  if not app.has_permission('catalog:manage') then
    raise exception 'catalog:manage required' using errcode = '42501';
  end if;
  select s.hidden_sections into v_before from app.etare_layout_settings() s;
  v_after := array(
    select s.section
    from unnest(array['energy', 'rescue', 'plans', 'annexes', 'photos']) with ordinality s (section, position)
    where s.section = any (p_hidden)
    order by s.position
  );
  update app.tenant t
  set settings = t.settings || jsonb_build_object('etare_hidden_sections', to_jsonb(v_after))
  where t.id = app.current_tenant_id();
  if v_before is distinct from v_after then
    perform app.record_audit_event(
      'tenant.etare_layout', 'tenant', app.current_tenant_id(), 'success', null,
      jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after))
    );
  end if;
  return v_after;
end
$$;

grant execute on function app.etare_layout_settings(), app.update_etare_layout_settings(text[]) to etare_api;

-- Routines are never executable by PUBLIC (explicit grants above only).
revoke all on all routines in schema app from public;
