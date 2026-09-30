-- =============================================================================
-- Supabase Storage bucket (the only Supabase-specific migration).
--
--   * One private bucket; object keys: tenants/{tenant_id}/assets/{asset_id}/{version_id}.
--   * NO policy is created on storage.objects for anon/authenticated: with RLS
--     enabled by Supabase, clients can neither list, read nor write objects.
--     Every file access goes through the product API, which authorizes the exact
--     asset in PostgreSQL (RLS) and then issues a short-lived signed URL with the
--     server-side secret key (docs/security.md, "Stockage"). This keeps the
--     authorization model identical once migrated to an S3-compatible store.
--   * Guarded so that the schema also applies on a plain PostgreSQL.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'storage' and c.relname = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'etare-assets', 'etare-assets', false, 52428800,
      array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/json', 'application/zip']
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;
