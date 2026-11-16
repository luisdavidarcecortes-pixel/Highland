-- Apply once in Supabase SQL Editor after deploying the matching application.
-- Existing content and accounts are preserved. Safe to apply more than once.
begin;

alter table public.profiles add column if not exists active boolean not null default true;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active);
$$;
create or replace function public.is_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;
create or replace function public.can_manage_team()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() and coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;

alter table public.articles add column if not exists image_path text;
update public.editions set pdf_path = split_part(pdf_url, '/storage/v1/object/public/newspaper/', 2)
where pdf_path is null and pdf_url like '%/storage/v1/object/public/newspaper/%';
update public.editions set cover_path = split_part(cover_url, '/storage/v1/object/public/newspaper/', 2)
where cover_path is null and cover_url like '%/storage/v1/object/public/newspaper/%';
update public.editions set pdf_path = substring(pdf_url from 12) where pdf_path is null and pdf_url like '/api/media/%';
update public.editions set cover_path = substring(cover_url from 12) where cover_path is null and cover_url like '/api/media/%';
update public.articles set image_path = split_part(image_url, '/storage/v1/object/public/newspaper/', 2)
where image_path is null and image_url like '%/storage/v1/object/public/newspaper/%';
update public.articles set image_path = substring(image_url from 12)
where image_path is null and image_url like '/api/media/%';

-- Public signups never become members. Invitations are created by the admin API.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invited_at is not null or new.raw_app_meta_data->>'newspaper_member' = 'true' then
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'editor')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Remove legacy permissive policies on the tables owned by this application.
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('profiles', 'editions', 'articles')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

create policy "members read team" on public.profiles for select to authenticated using (public.is_editor() or id = auth.uid());
create policy "admin inserts team" on public.profiles for insert to authenticated with check (public.can_manage_team());
create policy "admin updates team" on public.profiles for update to authenticated using (public.can_manage_team()) with check (public.can_manage_team());
create policy "self updates profile" on public.profiles for update to authenticated using (id = auth.uid() and public.is_editor()) with check (id = auth.uid() and active and role = public.my_role());

create or replace function public.protect_profile_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Profile identity cannot be changed';
  end if;
  if new.email is distinct from old.email and new.email is distinct from (select email from auth.users where id = new.id) then
    raise exception 'Change your email through the verified account flow';
  end if;
  if (new.role is distinct from old.role or new.active is distinct from old.active) and not public.can_manage_team() then
    raise exception 'Team changes require an administrator with two-factor verification';
  end if;
  if length(coalesce(new.full_name, '')) > 100 then raise exception 'Name is too long'; end if;
  return new;
end;
$$;
drop trigger if exists protect_profile_identity on public.profiles;
create trigger protect_profile_identity before update on public.profiles for each row execute function public.protect_profile_identity();

create or replace function public.sync_verified_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;
drop trigger if exists sync_verified_profile_email on auth.users;
create trigger sync_verified_profile_email after update of email on auth.users
for each row when (old.email is distinct from new.email) execute function public.sync_verified_profile_email();
update public.profiles p set email = u.email from auth.users u where p.id = u.id and p.email is distinct from u.email;

create policy "read editions" on public.editions for select using (published or public.is_editor());
create policy "members insert editions" on public.editions for insert to authenticated with check (public.is_editor() and created_by = auth.uid());
create policy "members update editions" on public.editions for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "admin deletes editions" on public.editions for delete to authenticated using (public.is_admin());
create policy "read articles" on public.articles for select using (published or public.is_editor());
create policy "members insert articles" on public.articles for insert to authenticated with check (public.is_editor() and author_id = auth.uid());
create policy "members update articles" on public.articles for update to authenticated using (public.is_editor()) with check (public.is_editor());
create policy "author deletes articles" on public.articles for delete to authenticated using (public.is_editor() and (public.is_admin() or author_id = auth.uid()));

-- Serialize changes to admin membership, including direct database requests.
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.active and (tg_op = 'DELETE' or new.role <> 'admin' or not new.active) then
    perform pg_advisory_xact_lock(783448001);
    if not exists (select 1 from public.profiles where role = 'admin' and active and id <> old.id) then
      raise exception 'The last administrator cannot be removed or demoted';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin before update of role, active or delete on public.profiles
for each row execute function public.protect_last_admin();

create or replace function public.owns_newspaper_uploads(object_paths text[])
returns boolean language sql stable security definer set search_path = public, storage as $$
  select public.is_editor() and cardinality(object_paths) between 1 and 10 and not exists (
    select 1 from unnest(object_paths) p
    where not exists (select 1 from storage.objects o where o.bucket_id = 'newspaper'
      and o.name = p and o.owner_id = auth.uid()::text)
  );
$$;
revoke all on function public.owns_newspaper_uploads(text[]) from public;
grant execute on function public.owns_newspaper_uploads(text[]) to authenticated;

create or replace function public.newspaper_object_unused(object_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.editions where pdf_path = object_path or cover_path = object_path)
     and not exists (select 1 from public.articles where image_path = object_path
       or image_url = '/api/media/' || object_path
       or right(image_url, length('/storage/v1/object/public/newspaper/' || object_path)) = '/storage/v1/object/public/newspaper/' || object_path);
$$;
revoke all on function public.newspaper_object_unused(text) from public;
grant execute on function public.newspaper_object_unused(text) to service_role;

-- Keep authors immutable for editors, and check the true Storage owner of changed files.
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
      if new.pdf_path is distinct from old.pdf_path then paths := array_append(paths, new.pdf_path); end if;
      if new.cover_path is distinct from old.cover_path then paths := array_append(paths, new.cover_path); end if;
    end if;
  else
    if tg_op = 'UPDATE' and not public.is_admin() and old.author_id is distinct from auth.uid()
      and (to_jsonb(new) - 'published') is distinct from (to_jsonb(old) - 'published') then
      raise exception 'Only the author or an administrator can edit article content';
    end if;
    if tg_op = 'UPDATE' and new.author_id is distinct from old.author_id and not public.is_admin() then raise exception 'The author cannot be changed'; end if;
    if tg_op = 'INSERT' then
      if new.image_path is not null then paths := array[new.image_path]; end if;
    elsif new.image_path is distinct from old.image_path and new.image_path is not null then paths := array[new.image_path]; end if;
  end if;
  if cardinality(paths) > 0 and not public.owns_newspaper_uploads(paths) then raise exception 'The uploaded files must belong to your account'; end if;
  return new;
end;
$$;
drop trigger if exists protect_content_files on public.editions;
create trigger protect_content_files before insert or update on public.editions for each row execute function public.protect_content_files();
drop trigger if exists protect_content_files on public.articles;
create trigger protect_content_files before insert or update on public.articles for each row execute function public.protect_content_files();

-- Public access is tied to publication state; drafts require an active member.
create or replace function public.newspaper_object_visible(object_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_editor()
    or exists (select 1 from public.editions where published and (pdf_path = object_path or cover_path = object_path))
    or exists (select 1 from public.articles where published and (image_path = object_path
      or image_url = '/api/media/' || object_path
      or right(image_url, length('/storage/v1/object/public/newspaper/' || object_path)) = '/storage/v1/object/public/newspaper/' || object_path));
$$;
update storage.buckets set public = false, file_size_limit = 52428800,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp','image/gif']
where id = 'newspaper';
drop policy if exists "public read newspaper" on storage.objects;
drop policy if exists "editors upload newspaper" on storage.objects;
drop policy if exists "editors update newspaper" on storage.objects;
drop policy if exists "editors delete newspaper" on storage.objects;
drop policy if exists "admins update newspaper" on storage.objects;
drop policy if exists "admins delete newspaper" on storage.objects;
drop policy if exists "visible newspaper objects" on storage.objects;
drop policy if exists "members upload own objects" on storage.objects;
drop policy if exists "admins delete objects" on storage.objects;
create policy "visible newspaper objects" on storage.objects for select using (bucket_id = 'newspaper' and public.newspaper_object_visible(name));
create policy "members upload own objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'newspaper' and public.is_editor() and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] in ('articles','editions','covers')
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "admins delete objects" on storage.objects for delete to authenticated using (bucket_id = 'newspaper' and public.is_admin());

create table if not exists public.ai_quotas (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null, started_at timestamptz not null, count integer not null,
  primary key (user_id, scope)
);
alter table public.ai_quotas enable row level security;
revoke all on public.ai_quotas from anon, authenticated;
create or replace function public.consume_ai_quota(quota_scope text)
returns boolean language plpgsql security definer set search_path = public as $$
declare allowed integer; used integer;
begin
  if not public.is_editor() then return false; end if;
  if quota_scope = 'analyze' then allowed := 30;
  elsif quota_scope = 'detect' then allowed := 60;
  else return false; end if;
  insert into public.ai_quotas (user_id, scope, started_at, count)
  values (auth.uid(), quota_scope, now(), 1)
  on conflict (user_id, scope) do update
    set started_at = case when ai_quotas.started_at <= now() - interval '10 minutes' then now() else ai_quotas.started_at end,
        count = case when ai_quotas.started_at <= now() - interval '10 minutes' then 1 else ai_quotas.count + 1 end
    where ai_quotas.started_at <= now() - interval '10 minutes' or ai_quotas.count < allowed
  returning count into used;
  return used is not null;
end;
$$;
revoke all on function public.consume_ai_quota(text) from public;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- Metadata-only audit history, written by triggers rather than clients.
create table if not exists public.editorial_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  entity text not null,
  record_id uuid not null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.editorial_audit enable row level security;
create index if not exists editorial_audit_created_at_idx on public.editorial_audit(created_at desc);
revoke all on public.editorial_audit from anon, authenticated;
grant select on public.editorial_audit to authenticated;
grant select, insert on public.editorial_audit to service_role;
drop policy if exists "admin reads history" on public.editorial_audit;
create policy "admin reads history" on public.editorial_audit for select to authenticated using (public.is_admin());
create or replace function public.record_editorial_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare row_data jsonb; previous jsonb; detail jsonb;
begin
  if tg_op = 'DELETE' then row_data := to_jsonb(old); else row_data := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    previous := to_jsonb(old);
    if row_data = previous then return new; end if;
  end if;
  if tg_table_name = 'profiles' then
    detail := jsonb_build_object('name', row_data->>'full_name', 'role', row_data->>'role', 'active', row_data->'active');
    if previous is not null then detail := detail || jsonb_build_object('previous_role', previous->>'role', 'previous_active', previous->'active'); end if;
  else
    detail := jsonb_build_object('title', row_data->>'title', 'published', row_data->'published');
  end if;
  insert into public.editorial_audit(actor_id, actor_name, entity, record_id, action, details)
  values (auth.uid(), (select coalesce(full_name, email) from public.profiles where id = auth.uid()), tg_table_name, (row_data->>'id')::uuid, lower(tg_op), detail);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
do $$ declare table_name text; begin
  foreach table_name in array array['profiles','articles','editions'] loop
    execute format('drop trigger if exists editorial_history on public.%I', table_name);
    execute format('create trigger editorial_history after insert or update or delete on public.%I for each row execute function public.record_editorial_change()', table_name);
  end loop;
end $$;

create or replace function public.get_editorial_team()
returns table(id uuid, full_name text, email text, role text, active boolean, invited_at timestamptz, confirmed_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, u.email::text, p.role, p.active, u.invited_at, u.email_confirmed_at, u.last_sign_in_at
  from public.profiles p join auth.users u on u.id = p.id
  where public.is_admin() order by p.created_at;
$$;
revoke all on function public.get_editorial_team() from public;
grant execute on function public.get_editorial_team() to authenticated;
commit;
