import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const db = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const editor = '10000000-0000-4000-8000-000000000002';
const outsider = '10000000-0000-4000-8000-000000000003';
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
  // The ownership migration is part of the expected state of the database.
  await db.exec(readFileSync('supabase/migrations/20261111000100_content_ownership.sql', 'utf8'));
  await db.exec(`grant all on all tables in schema public to authenticated, anon, service_role;
    grant all on storage.objects to authenticated, anon, service_role;
    insert into auth.users(id,email) values ('${admin}','admin@example.test'), ('${outsider}','outsider@example.test');
    insert into public.profiles(id,email,role) values ('${admin}','admin@example.test','admin');
    insert into auth.users(id,email,invited_at) values ('${editor}','editor@example.test',now());
    insert into storage.objects(bucket_id,name,owner_id) values
      ('newspaper','editions/${editor}/1-published.pdf','${editor}'),
      ('newspaper','editions/${editor}/2-draft.pdf','${editor}');
    insert into public.editions(title,edition_date,school_year,pdf_url,pdf_path,published)
    values ('Public','2026-11-03','2026-27','/api/media/editions/${editor}/1-published.pdf','editions/${editor}/1-published.pdf',true),
      ('Draft','2026-11-03','2026-27','/api/media/editions/${editor}/2-draft.pdf','editions/${editor}/2-draft.pdf',false);
  `);
});
afterAll(async () => { await db.close(); });

describe('real PostgreSQL security rules', () => {
  it('does not create a member for public signups', async () => {
    await db.exec('reset role');
    const rows = await db.query('select role from public.profiles where id = $1', [outsider]);
    expect(rows.rows).toHaveLength(0);
  });
  it('still creates invited editorial profiles', async () => {
    await db.exec('reset role');
    expect((await db.query<{ role: string }>('select role from public.profiles where id = $1', [editor])).rows[0].role).toBe('editor');
  });
  it('blocks authenticated non-members from writing articles', async () => {
    await actor(outsider);
    await expect(db.query("insert into public.articles(slug,title,body,author_id) values ('unauthorized','No','No',$1)", [outsider])).rejects.toThrow(/row-level security/i);
  });
  it('only exposes files referenced by published content to anonymous readers', async () => {
    await actor(null, 'anon');
    const rows = await db.query<{ name: string }>('select name from storage.objects');
    expect(rows.rows.map(row => row.name)).toEqual([`editions/${editor}/1-published.pdf`]);
  });
  it('keeps the entire newspaper bucket private', async () => {
    await db.exec('reset role');
    expect((await db.query<{ public: boolean }>("select public from storage.buckets where id='newspaper'")).rows[0].public).toBe(false);
  });
  it('denies uploads into another member’s folder', async () => {
    await actor(editor);
    await expect(db.query("insert into storage.objects(bucket_id,name,owner_id) values ('newspaper',$1,$2)", [`editions/${admin}/1-forged.pdf`, editor])).rejects.toThrow(/row-level security/i);
  });
  it('verifies Storage ownership instead of trusting a filename', async () => {
    await actor(admin);
    const result = await db.query<{ allowed: boolean }>('select public.owns_newspaper_uploads($1) as allowed', [[`editions/${editor}/1-published.pdf`]]);
    expect(result.rows[0].allowed).toBe(false);
  });
  it('does not delete a file still referenced by an edition', async () => {
    await actor(null, 'service_role');
    const result = await db.query<{ unused: boolean }>('select public.newspaper_object_unused($1) as unused', [`editions/${editor}/1-published.pdf`]);
    expect(result.rows[0].unused).toBe(false);
  });
  it('prevents an editor from making themselves admin', async () => {
    await actor(editor);
    await expect(db.query("update public.profiles set role='admin' where id=$1", [editor])).rejects.toThrow(/row-level security|administrator/i);
  });
  it('protects the last admin even through direct SQL updates', async () => {
    await actor(admin);
    await expect(db.query("update public.profiles set role='editor' where id=$1", [admin])).rejects.toThrow(/last administrator/i);
  });
  it('shares a strict quota across repeated requests', async () => {
    await actor(editor);
    for (let i = 0; i < 30; i++) {
      expect((await db.query<{ allowed: boolean }>("select public.consume_ai_quota('analyze') as allowed")).rows[0].allowed).toBe(true);
    }
    expect((await db.query<{ allowed: boolean }>("select public.consume_ai_quota('analyze') as allowed")).rows[0].allowed).toBe(false);
  });
  it('enforces author permissions on direct SQL, including the publication flag', async () => {
    await actor(admin);
    const article = (await db.query<{ id: string }>("insert into public.articles(slug,title,body,author_id) values ('admin-story','Title','Original',$1) returning id", [admin])).rows[0].id;
    await actor(editor);
    // The ownership policy hides the row from the editor: nothing is written.
    const tampered = await db.query("update public.articles set body='Tampered' where id=$1 returning id", [article]);
    expect(tampered.rows).toHaveLength(0);
    const published = await db.query('update public.articles set published=true where id=$1 returning id', [article]);
    expect(published.rows).toHaveLength(0);
    await actor(admin);
    await db.query("update public.articles set body='Corrected' where id=$1", [article]);
    expect((await db.query<{ body: string }>('select body from public.articles where id=$1', [article])).rows[0].body).toBe('Corrected');
    await actor(editor);
    await db.query("insert into public.articles(slug,title,body,author_id) values ('editor-story','Own','Original',$1)", [editor]);
    await db.exec("update public.articles set body='My correction' where slug='editor-story'");
    expect((await db.query<{ body: string }>("select body from public.articles where slug='editor-story'")).rows[0].body).toBe('My correction');
  });
  it('blocks unverified identity email changes and synchronizes verified Auth changes', async () => {
    await actor(editor);
    await expect(db.query("update public.profiles set email='pretend@example.test' where id=$1", [editor])).rejects.toThrow(/verified account/i);
    await actor(null, 'service_role');
    await db.exec('reset role');
    await db.query("update auth.users set email='verified@example.test' where id=$1", [editor]);
    expect((await db.query<{ email: string }>('select email from public.profiles where id=$1', [editor])).rows[0].email).toBe('verified@example.test');
  });
  it('requires AAL2 for direct database team changes', async () => {
    await actor(admin);
    await db.query("select set_config('request.jwt.claim.aal', 'aal1', false)");
    expect((await db.query("update public.profiles set active=false where id=$1 returning id", [editor])).rows).toHaveLength(0);
    expect((await db.query<{ active: boolean }>('select active from public.profiles where id=$1', [editor])).rows[0].active).toBe(true);
  });
  it('revokes every editorial permission without removing authorship or uploads', async () => {
    await actor(admin);
    await db.query('update public.profiles set active=false where id=$1', [editor]);
    await actor(editor);
    expect((await db.query<{ allowed: boolean }>('select public.is_editor() as allowed')).rows[0].allowed).toBe(false);
    expect((await db.query('update public.profiles set active=true where id=$1 returning id', [editor])).rows).toHaveLength(0);
    await expect(db.query("insert into public.articles(slug,title,body,author_id) values ('revoked','No','No',$1)", [editor])).rejects.toThrow(/row-level security/i);
    expect((await db.query("select * from public.articles where slug='editor-story'")).rows).toHaveLength(0);
    await actor(admin);
    expect((await db.query<{ author_id: string }>("select author_id from public.articles where slug='editor-story'")).rows[0].author_id).toBe(editor);
    expect((await db.query('select * from storage.objects where owner_id=$1', [editor])).rows).toHaveLength(2);
    await db.query('update public.profiles set active=true where id=$1', [editor]);
  });
  it('protects the last active administrator from deactivation', async () => {
    await actor(admin);
    await expect(db.query('update public.profiles set active=false where id=$1', [admin])).rejects.toThrow(/last administrator/i);
  });
  it('records changes and prevents forged history', async () => {
    await actor(admin);
    expect((await db.query("select * from public.editorial_audit where entity='articles' and actor_id=$1", [admin])).rows.length).toBeGreaterThan(0);
    await actor(editor);
    expect((await db.query('select * from public.editorial_audit')).rows).toHaveLength(0);
    // Test fixture grants tables broadly, so RLS must still deny forged entries.
    await expect(db.query("insert into public.editorial_audit(entity,record_id,action) values ('profiles',$1,'fake')", [admin])).rejects.toThrow(/row-level security/i);
  });
});
