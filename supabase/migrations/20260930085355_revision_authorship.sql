-- Contributor history is maintained by PostgreSQL, never by caller-supplied rows.
-- A validator who also edits a draft must remain disqualified for that revision.
revoke insert, update on app.etare_revision_contributor from etare_api;

create function app.tg_revision_authorship_guard() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if not app.is_application_session() then
    return new;
  end if;
  if app.current_user_id() is null then
    raise exception 'a verified author is required' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.created_by is distinct from app.current_user_id() then
    raise exception 'the revision author must be the current user' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'draft' and not app.has_permission('etare:edit', new.site_id) then
      raise exception 'editing a draft requires etare:edit' using errcode = '42501';
    end if;
    if old.status = 'draft' and new.status = 'submitted'
       and new.submitted_by is distinct from app.current_user_id() then
      raise exception 'the submitter must be the current user' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
create trigger revision_authorship_guard before insert or update on app.etare_revision
for each row execute function app.tg_revision_authorship_guard();

create function app.tg_record_revision_contributor() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Migration/seed sessions without a verified actor do not invent a user.
  if app.current_user_id() is null then return null; end if;
  if (tg_op = 'INSERT' and new.status = 'draft')
     or (tg_op = 'UPDATE' and old.status = 'draft') then
    insert into app.etare_revision_contributor (tenant_id, site_id, revision_id, user_id)
    values (new.tenant_id, new.site_id, new.id, app.current_user_id())
    on conflict (revision_id, user_id) do update set last_contributed_at = clock_timestamp();
  end if;
  return null;
end
$$;
create trigger record_revision_contributor after insert or update on app.etare_revision
for each row execute function app.tg_record_revision_contributor();

revoke all on all routines in schema app from public;
