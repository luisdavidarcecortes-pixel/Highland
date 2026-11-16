-- ---------------------------------------------------------------------------
-- Global queue for the page-by-page reader.
--
-- Why
--   Preparing an issue downloads the whole PDF and renders every page. That
--   work used to happen on whichever instance received the first request, with
--   a limit of eight pending jobs *per instance*: a cold start re-rendered the
--   same PDF again, and a visitor could keep asking for new issues until the
--   queue was full (and the legitimate readers got a 503).
--
-- What this migration adds
--   * public.reader_jobs: one row per issue with a lease, so the whole site
--     shares a single "who is preparing what" registry.
--   * claim_reader_job(): takes the global slot atomically. It answers
--     'claimed' (you may render), 'held' (another instance is already
--     rendering this very issue) or 'busy' (the site-wide limit is reached).
--   * finish_reader_job(): releases the slot with the outcome.
--
-- The table is only reachable with the service role: the browser never talks
-- to it. RLS is enabled anyway, so a stray policy cannot expose it.
--
-- Apply it manually (never executed automatically by this repository):
--   Supabase dashboard -> SQL Editor -> paste this file -> Run
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.reader_jobs (
  edition_id uuid primary key,
  version text not null,
  status text not null default 'running' check (status in ('running', 'ready', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pages integer,
  error text
);

alter table public.reader_jobs enable row level security;
revoke all on public.reader_jobs from anon, authenticated;
grant all on public.reader_jobs to service_role;

-- A lease of ten minutes: a worker that dies leaves the slot free again.
create or replace function public.claim_reader_job(
  p_edition uuid,
  p_version text,
  p_max_running integer default 4
)
returns text language plpgsql security definer set search_path = public as $$
declare
  held boolean := false;
  running integer := 0;
begin
  select (status = 'running' and started_at > now() - interval '10 minutes')
    into held
    from public.reader_jobs
   where edition_id = p_edition;

  if held then return 'held'; end if;

  select count(*) into running
    from public.reader_jobs
   where status = 'running' and started_at > now() - interval '10 minutes';

  if running >= p_max_running then return 'busy'; end if;

  insert into public.reader_jobs (edition_id, version, status, started_at)
  values (p_edition, p_version, 'running', now())
  on conflict (edition_id) do update
     set status = 'running', started_at = now(), version = p_version,
         finished_at = null, error = null
   where public.reader_jobs.status <> 'running'
      or public.reader_jobs.started_at <= now() - interval '10 minutes';

  return 'claimed';
end;
$$;
revoke all on function public.claim_reader_job(uuid, text, integer) from public;
grant execute on function public.claim_reader_job(uuid, text, integer) to service_role;

create or replace function public.finish_reader_job(
  p_edition uuid,
  p_status text,
  p_pages integer default null,
  p_error text default null
)
returns void language sql security definer set search_path = public as $$
  update public.reader_jobs
     set status = p_status, finished_at = now(), pages = p_pages, error = p_error
   where edition_id = p_edition;
$$;
revoke all on function public.finish_reader_job(uuid, text, integer, text) from public;
grant execute on function public.finish_reader_job(uuid, text, integer, text) to service_role;

commit;
