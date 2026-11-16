-- ---------------------------------------------------------------------------
-- Content ownership: an editor may only change their own content.
--
-- Why this migration exists
--   The update policies granted every active member ("editor") the right to
--   change any row:
--       create policy "members update articles" ... using (public.is_editor())
--       create policy "members update editions" ... using (public.is_editor())
--   and the guard trigger public.protect_content_files() deliberately left the
--   `published` column out of the comparison, so the publication flag could be
--   flipped by anybody. As a result any editor could:
--     * publish or unpublish a story written by a colleague,
--     * publish or unpublish an issue uploaded by a colleague,
--     * rewrite the metadata (title, date, number) of anybody's issue.
--
-- What this migration does
--   1. Replaces both update policies with an owner-or-admin rule:
--        articles -> author_id  = auth.uid() or is_admin()
--        editions -> created_by = auth.uid() or is_admin()
--      Reading, inserting own content and deleting are unchanged, so the
--      legitimate editorial workflow keeps working:
--        * an editor publishes and edits their own articles and issues,
--        * an administrator still manages every article and issue,
--        * every member still sees the whole board (published + drafts).
--   2. Tightens public.protect_content_files() so the same rule is enforced
--      for direct SQL clients (PostgREST, SQL editor), not only through RLS:
--      the article guard now also covers the `published` flag, and issues get
--      the same ownership check they lacked.
--
-- Requirements: apply it AFTER supabase/schema.sql and supabase/harden-newspaper.sql
-- (it uses public.is_editor(), public.is_admin() and public.owns_newspaper_uploads()).
--
-- How to apply it (never executed automatically by this repository):
--   * Supabase dashboard -> SQL Editor -> paste this file -> Run
--   * or locally:  psql "$SUPABASE_DB_URL" -f supabase/migrations/20261111000100_content_ownership.sql
--
-- The file is idempotent: running it twice leaves the same result.
-- ---------------------------------------------------------------------------

begin;

drop policy if exists "members update articles" on public.articles;
drop policy if exists "owners update articles" on public.articles;
create policy "owners update articles" on public.articles
  for update to authenticated
  using (public.is_editor() and (author_id = auth.uid() or public.is_admin()))
  with check (public.is_editor() and (author_id = auth.uid() or public.is_admin()));

drop policy if exists "members update editions" on public.editions;
drop policy if exists "owners update editions" on public.editions;
create policy "owners update editions" on public.editions
  for update to authenticated
  using (public.is_editor() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_editor() and (created_by = auth.uid() or public.is_admin()));

-- Defense in depth for clients that talk to the database directly.
create or replace function public.protect_content_files()
returns trigger language plpgsql security definer set search_path = public as $$
declare paths text[] := '{}';
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'editions' then
    if tg_op = 'INSERT' then
      paths := array[new.pdf_path, new.cover_path];
    else
      if new.created_by is distinct from old.created_by and not public.is_admin() then raise exception 'The uploader cannot be changed'; end if;
      if not public.is_admin() and old.created_by is distinct from auth.uid()
        and to_jsonb(new) is distinct from to_jsonb(old) then
        raise exception 'Only the uploader or an administrator can edit this issue';
      end if;
      if new.pdf_path is distinct from old.pdf_path then paths := array_append(paths, new.pdf_path); end if;
      if new.cover_path is distinct from old.cover_path then paths := array_append(paths, new.cover_path); end if;
    end if;
  else
    -- The publication flag is part of the row now: publishing is an edit.
    if tg_op = 'UPDATE' and not public.is_admin() and old.author_id is distinct from auth.uid()
      and to_jsonb(new) is distinct from to_jsonb(old) then
      raise exception 'Only the author or an administrator can edit article content';
    end if;
    if tg_op = 'UPDATE' and new.author_id is distinct from old.author_id and not public.is_admin() then raise exception 'The author cannot be changed'; end if;
    if tg_op = 'INSERT' then
      if new.image_path is not null then paths := array[new.image_path]; end if;
    elsif new.image_path is distinct from old.image_path and new.image_path is not null then paths := array_append(paths, new.image_path); end if;
  end if;
  if cardinality(paths) > 0 and not public.owns_newspaper_uploads(paths) then raise exception 'The uploaded files must belong to your account'; end if;
  return new;
end;
$$;

commit;
