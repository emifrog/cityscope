-- OPS consumes only active published content. Preparation states remain visible
-- to the back-office roles which can read ETARE revisions.
alter policy publication_select on app.publication
using (
  tenant_id = (select app.current_tenant_id())
  and ((select app.has_permission('publication:read')) or app.has_permission('publication:read', site_id))
  and (
    status = 'published'
    or (select app.has_permission('etare:read'))
    or app.has_permission('etare:read', site_id)
  )
);

-- A pointer cannot accidentally reference another site of the same SIS.
alter table app.site drop constraint site_active_publication_fk;
alter table app.site add constraint site_active_publication_fk
  foreign key (tenant_id, id, active_publication_id)
  references app.publication (tenant_id, site_id, id);
alter table app.etare_revision drop constraint etare_revision_base_publication_fk;
alter table app.etare_revision add constraint etare_revision_base_publication_fk
  foreign key (tenant_id, site_id, base_publication_id)
  references app.publication (tenant_id, site_id, id);

-- The published author, timestamps, and identity are as immutable as its content.
-- Lifecycle transitions are still audited by the existing row audit trigger.
create function app.tg_publication_metadata_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status in ('published', 'superseded', 'withdrawn')
     and (to_jsonb(new) - array['status', 'superseded_at', 'withdrawn_at', 'withdrawal_reason', 'updated_at', 'row_version'])
         is distinct from
         (to_jsonb(old) - array['status', 'superseded_at', 'withdrawn_at', 'withdrawal_reason', 'updated_at', 'row_version']) then
    raise exception 'PUBLICATION_IMMUTABLE: published metadata cannot be rewritten' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger publication_metadata_guard before update on app.publication
for each row execute function app.tg_publication_metadata_guard();

revoke all on all routines in schema app from public;
