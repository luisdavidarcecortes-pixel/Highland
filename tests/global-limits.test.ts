import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

/**
 * Site-wide limits (findings S11 and the AI quota).
 *
 * The reader queue and the AI quota used to be counted per instance and per
 * member. These tests run the real SQL against an in-memory PostgreSQL.
 */

const db = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const editors = [
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  '10000000-0000-4000-8000-000000000006',
];

async function actor(id: string | null, role = 'authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  await db.query("select set_config('request.jwt.claim.role', $1, false)", [role]);
  await db.query("select set_config('request.jwt.claim.aal', 'aal2', false)");
  await db.exec(`set role ${role}`);
}

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role', true) $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', current_setting('request.jwt.claim.aal', true)) $$;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}', invited_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz);
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner_id text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
  `);
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
  await db.exec(readFileSync('supabase/harden-newspaper.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261111000100_content_ownership.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261111000200_reader_jobs.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261111000300_ai_global_quota.sql', 'utf8'));
  await db.exec(`
    grant all on all tables in schema public to authenticated, anon, service_role;
    grant all on storage.objects to authenticated, anon, service_role;
    insert into auth.users(id,email) values ('${admin}','admin@example.test');
    insert into public.profiles(id,email,role) values ('${admin}','admin@example.test','admin');
    insert into auth.users(id,email,invited_at) values
      ('${editors[0]}','one@example.test',now()), ('${editors[1]}','two@example.test',now()),
      ('${editors[2]}','three@example.test',now()), ('${editors[3]}','four@example.test',now()),
      ('${editors[4]}','five@example.test',now());
  `);
});
afterAll(async () => { await db.close(); });

describe('the reader queue is shared by the whole site', () => {
  it('gives the slot to the first worker and holds it for the others', async () => {
    await actor(null, 'service_role');
    const first = await db.query("select public.claim_reader_job('20000000-0000-4000-8000-000000000001','v1','4') as claim");
    expect(first.rows[0].claim).toBe('claimed');
    const second = await db.query("select public.claim_reader_job('20000000-0000-4000-8000-000000000001','v1','4') as claim");
    expect(second.rows[0].claim).toBe('held');
  });

  it('answers busy when the site-wide limit is reached', async () => {
    await actor(null, 'service_role');
    // One slot is already taken by the previous test: three more fill the queue.
    for (const suffix of ['011', '012', '013']) {
      const claim = await db.query("select public.claim_reader_job($1,'v1','4') as claim", [`20000000-0000-4000-8000-000000000${suffix}`]);
      expect(claim.rows[0].claim).toBe('claimed');
    }
    const extra = await db.query("select public.claim_reader_job('20000000-0000-4000-8000-000000000014','v1','4') as claim");
    expect(extra.rows[0].claim).toBe('busy');
  });

  it('frees the slot when the preparation finishes', async () => {
    await actor(null, 'service_role');
    await db.query("select public.finish_reader_job('20000000-0000-4000-8000-000000000001','ready',12)");
    const status = await db.query("select status, pages from public.reader_jobs where edition_id='20000000-0000-4000-8000-000000000001'");
    expect(status.rows[0]).toMatchObject({ status: 'ready', pages: 12 });
    const again = await db.query("select public.claim_reader_job('20000000-0000-4000-8000-000000000001','v1','4') as claim");
    expect(again.rows[0].claim).toBe('claimed');
  });

  it('keeps the registry out of reach of the browser', async () => {
    await actor(editors[0]);
    // RLS is enabled without a policy: the browser reads nothing.
    expect((await db.query('select * from public.reader_jobs')).rows).toHaveLength(0);
  });
});

describe('the AI quota is also capped for the whole site', () => {
  it('stops a single member at their own limit', async () => {
    await actor(editors[0]);
    for (let n = 0; n < 30; n++) {
      expect((await db.query<{ allowed: boolean }>("select public.consume_ai_quota('analyze') as allowed")).rows[0].allowed).toBe(true);
    }
    expect((await db.query<{ allowed: boolean }>("select public.consume_ai_quota('analyze') as allowed")).rows[0].allowed).toBe(false);
  });

  it('stops the whole site before the credit of the project is gone', async () => {
    // 120 requests per ten minutes for everybody: the fifth member is refused
    // even though their own counter is still empty.
    for (const editor of editors.slice(1)) {
      await actor(editor);
      let allowed = true;
      let calls = 0;
      while (allowed && calls < 40) {
        allowed = (await db.query<{ allowed: boolean }>("select public.consume_ai_quota('analyze') as allowed")).rows[0].allowed;
        if (allowed) calls++;
      }
      expect(calls).toBeLessThan(40);
    }
    await actor(editors[0]);
    expect((await db.query<{ allowed: boolean }>("select public.consume_ai_quota('analyze') as allowed")).rows[0].allowed).toBe(false);
  });
});
