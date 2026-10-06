-- ============================================================
-- HIGHLAND ACADEMY · STUDENT NEWSPAPER · Supabase schema
-- Run this whole file in your project's SQL Editor
-- (https://supabase.com/dashboard → SQL Editor → New query → paste → Run)
-- ============================================================

-- 1) Profiles table (editors)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'editor' check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);

-- 2) Newspaper issues table
create table if not exists public.editions (
  id uuid primary key default gen_random_uuid(),
  number integer,
  title text not null,
  description text,
  edition_date date not null,
  school_year text not null,
  pdf_path text,
  pdf_url text not null,
  cover_path text,
  cover_url text,
  published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3) News articles table
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body text not null,
  image_url text,
  video_url text,
  audio_url text,
  author_id uuid references public.profiles(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

-- 4) Auto-profile on user creation (in case someone signs up without an invitation)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'editor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) Role helper functions (must exist before the policies)
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_editor()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
  );
$$;

-- 6) Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.editions enable row level security;
alter table public.articles enable row level security;

-- Profiles: any authenticated user sees the team; each user edits their own profile; admin edits all
drop policy if exists "team readable" on public.profiles;
create policy "team readable" on public.profiles
  for select to authenticated using (true);

drop policy if exists "self insert" on public.profiles;
create policy "self insert" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "admin manages team" on public.profiles;
create policy "admin manages team" on public.profiles
  for update to authenticated
  using (public.is_admin() or id = auth.uid());

drop policy if exists "admin deletes team" on public.profiles;
create policy "admin deletes team" on public.profiles
  for delete to authenticated
  using (public.is_admin());

-- Issues: public reads published; authenticated read all; authenticated create; admin deletes
drop policy if exists "published editions public" on public.editions;
create policy "published editions public" on public.editions
  for select using (published = true or public.is_editor());

drop policy if exists "editors create editions" on public.editions;
create policy "editors create editions" on public.editions
  for insert to authenticated with check (true);

drop policy if exists "editors update editions" on public.editions;
create policy "editors update editions" on public.editions
  for update to authenticated using (true);

drop policy if exists "admin deletes editions" on public.editions;
create policy "admin deletes editions" on public.editions
  for delete to authenticated using (public.is_admin());

-- Articles: same rules
drop policy if exists "published articles public" on public.articles;
create policy "published articles public" on public.articles
  for select using (published = true or public.is_editor());

drop policy if exists "editors create articles" on public.articles;
create policy "editors create articles" on public.articles
  for insert to authenticated with check (true);

drop policy if exists "editors update articles" on public.articles;
create policy "editors update articles" on public.articles
  for update to authenticated using (true);

drop policy if exists "editors delete articles" on public.articles;
create policy "editors delete articles" on public.articles
  for delete to authenticated using (public.is_admin() or author_id = auth.uid());

-- 7) Storage: single "newspaper" bucket with public read access
insert into storage.buckets (id, name, public)
values ('newspaper', 'newspaper', true)
on conflict (id) do nothing;

drop policy if exists "public read newspaper" on storage.objects;
create policy "public read newspaper" on storage.objects
  for select using (bucket_id = 'newspaper');

drop policy if exists "editors upload newspaper" on storage.objects;
create policy "editors upload newspaper" on storage.objects
  for insert to authenticated with check (bucket_id = 'newspaper');

drop policy if exists "editors update newspaper" on storage.objects;
create policy "editors update newspaper" on storage.objects
  for update to authenticated using (bucket_id = 'newspaper');

drop policy if exists "editors delete newspaper" on storage.objects;
create policy "editors delete newspaper" on storage.objects
  for delete to authenticated using (bucket_id = 'newspaper' and public.is_editor());

-- 8) Sample data (optional): comment these lines out if you don't want them
-- insert into public.editions (number, title, description, edition_date, school_year, pdf_url, published)
-- values (1, 'The newspaper is born!', 'First issue', '2026-04-10', '2025-26', 'https://example.com/demo.pdf', true);
