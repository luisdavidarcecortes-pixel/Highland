-- ============================================================
-- SECURITY FIX · run once: Supabase → SQL Editor → New query → paste → Run
--
-- Closes a privilege escalation that was confirmed against this project:
-- the "admin manages team" policy had no `with check`, so an invited
-- editor could PATCH their own profiles row with the public anon key and
-- set role = 'admin' from the browser. It answered HTTP 200 and the
-- account became a real admin.
--
-- Why the two-policy split: in Postgres, an UPDATE policy that omits
-- `with check` reuses `using` for the new row, so `id = auth.uid()` alone
-- lets an editor write ANY value into their own row — including `role`.
-- Row-level filtering was never column-level protection.
--
-- Safe to run more than once. Touches nothing else.
-- ============================================================

-- 1) The caller's own role, read past RLS.
--    Named my_role() on purpose: `current_role` is a reserved SQL keyword.
create or replace function public.my_role()
returns text
language sql
security definer set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 2) Changing a role is an admin-only action.
drop policy if exists "admin manages team" on public.profiles;
create policy "admin manages team" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3) Everyone keeps control of their own row — except their role.
drop policy if exists "self updates own profile" on public.profiles;
create policy "self updates own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role());

-- 4) A profile can never be born as an admin.
drop policy if exists "self insert" on public.profiles;
create policy "self insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'editor');

-- 5) Proof: expect exactly the four policies above, with both
--    qual and with_check filled in. Paste the result back if anything
--    looks off.
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'profiles'
 order by policyname;
