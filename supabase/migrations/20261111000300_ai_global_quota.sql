-- ---------------------------------------------------------------------------
-- A global cap for the AI quota.
--
-- Why
--   public.consume_ai_quota() only counted the requests of each member, so a
--   single account (or a stolen one) could spend the whole Gemini credit of
--   the project and leave the rest of the team without AI assistance.
--
-- What this migration adds
--   * public.ai_quotas_global: the same ten minute window, shared by the
--     whole site.
--   * consume_ai_quota() is replaced with a version that checks the per member
--     limit AND the global limit before it consumes anything.
--
-- The limits can be changed in one place (the two constants below).
--
-- Apply it manually (never executed automatically by this repository):
--   Supabase dashboard -> SQL Editor -> paste this file -> Run
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.ai_quotas_global (
  scope text primary key,
  started_at timestamptz not null,
  count integer not null
);
alter table public.ai_quotas_global enable row level security;
revoke all on public.ai_quotas_global from anon, authenticated;

create or replace function public.consume_ai_quota(quota_scope text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  allowed integer;
  global_allowed integer;
  used integer;
  global_used integer;
begin
  if not public.is_editor() then return false; end if;
  if quota_scope = 'analyze' then
    allowed := 30;
    global_allowed := 120;
  elsif quota_scope = 'detect' then
    allowed := 60;
    global_allowed := 240;
  else return false; end if;

  -- The site-wide counter is checked first: it never grows past the limit.
  insert into public.ai_quotas_global (scope, started_at, count)
  values (quota_scope, now(), 1)
  on conflict (scope) do update
    set started_at = case when ai_quotas_global.started_at <= now() - interval '10 minutes' then now() else ai_quotas_global.started_at end,
        count = case when ai_quotas_global.started_at <= now() - interval '10 minutes' then 1 else ai_quotas_global.count + 1 end
    where ai_quotas_global.started_at <= now() - interval '10 minutes' or ai_quotas_global.count < global_allowed
  returning count into global_used;
  if global_used is null then return false; end if;

  -- And then the per member counter.
  insert into public.ai_quotas (user_id, scope, started_at, count)
  values (auth.uid(), quota_scope, now(), 1)
  on conflict (user_id, scope) do update
    set started_at = case when ai_quotas.started_at <= now() - interval '10 minutes' then now() else ai_quotas.started_at end,
        count = case when ai_quotas.started_at <= now() - interval '10 minutes' then 1 else ai_quotas.count + 1 end
    where ai_quotas.started_at <= now() - interval '10 minutes' or ai_quotas.count < allowed
  returning count into used;
  if used is null then
    -- The member is over their own limit: the global counter is given back.
    update public.ai_quotas_global
       set count = greatest(count - 1, 0)
     where scope = quota_scope;
    return false;
  end if;

  return true;
end;
$$;
revoke all on function public.consume_ai_quota(text) from public;
grant execute on function public.consume_ai_quota(text) to authenticated;

commit;
