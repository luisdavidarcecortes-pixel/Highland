import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

/**
 * Ownership rules enforced by the database itself (finding S3).
 *
 * The suite applies the real schema, the hardening script and the ownership
 * migration against an in-memory PostgreSQL, so the policies and the guard
 * trigger are exercised exactly as they behave in production.
 */

const db = new PGlite();
const admin = '10000000-0000-4000-8000-000000000001';
const editor = '10000000-0000-4000-8000-000000000002';
const colleague = '10000000-0000-4000-8000-000000000003';

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
  await db.exec(`
    grant all on all tables in schema public to authenticated, anon, service_role;
    grant all on storage.objects to authenticated, anon, service_role;
    insert into auth.users(id,email) values ('${admin}','admin@example.test');
    insert into public.profiles(id,email,role) values ('${admin}','admin@example.test','admin');
    insert into auth.users(id,email,invited_at) values ('${editor}','editor@example.test',now()), ('${colleague}','colleague@example.test',now());
    insert into storage.objects(bucket_id,name,owner_id) values
      ('newspaper','editions/${editor}/1-own.pdf','${editor}'),
      ('newspaper','covers/${editor}/1-own.jpg','${editor}'),
      ('newspaper','editions/${editor}/2-fresh.pdf','${editor}'),
      ('newspaper','covers/${editor}/2-fresh.jpg','${editor}'),
      ('newspaper','editions/${colleague}/1-other.pdf','${colleague}');
    insert into public.articles(slug,title,body,author_id,published) values
      ('editor-story','Own story','Original','${editor}',false),
      ('colleague-story','Colleague story','Original','${colleague}',true);
    insert into public.editions(title,edition_date,school_year,published,created_by,pdf_url,pdf_path) values
      ('Own issue','2026-11-03','2026-27',false,'${editor}','/api/media/editions/${editor}/1-own.pdf','editions/${editor}/1-own.pdf'),
      ('Colleague issue','2026-11-04','2026-27',true,'${colleague}','/api/media/editions/${colleague}/1-other.pdf','editions/${colleague}/1-other.pdf');
  `);
});
afterAll(async () => { await db.close(); });

describe('database ownership rules', () => {
  it('stops an editor from publishing or rewriting another author’s article', async () => {
    await actor(editor);
    const published = await db.query("update public.articles set published=false where slug='colleague-story' returning id");
    expect(published.rows).toHaveLength(0);
    const rewritten = await db.query("update public.articles set title='Hijacked' where slug='colleague-story' returning id");
    expect(rewritten.rows).toHaveLength(0);
    await actor(null, 'service_role');
    await db.exec('reset role');
    expect((await db.query<{ published: boolean }>("select published from public.articles where slug='colleague-story'")).rows[0].published).toBe(true);
  });

  it('lets an editor publish and edit their own article', async () => {
    await actor(editor);
    const published = await db.query("update public.articles set published=true where slug='editor-story' returning id");
    expect(published.rows).toHaveLength(1);
    const edited = await db.query("update public.articles set body='My correction' where slug='editor-story' returning id");
    expect(edited.rows).toHaveLength(1);
  });

  it('lets an administrator publish and rewrite another author’s article', async () => {
    await actor(admin);
    const unpublished = await db.query("update public.articles set published=false where slug='colleague-story' returning id");
    expect(unpublished.rows).toHaveLength(1);
    const rewritten = await db.query("update public.articles set title='Corrected by the desk' where slug='colleague-story' returning id");
    expect(rewritten.rows).toHaveLength(1);
    await actor(admin);
    await db.query("update public.articles set published=true where slug='colleague-story'");
  });

  it('stops an editor from publishing or rewriting another member’s issue', async () => {
    await actor(editor);
    const unpublished = await db.query("update public.editions set published=false where title='Colleague issue' returning id");
    expect(unpublished.rows).toHaveLength(0);
    const renamed = await db.query("update public.editions set title='Hijacked issue' where title='Colleague issue' returning id");
    expect(renamed.rows).toHaveLength(0);
    await actor(null, 'service_role');
    await db.exec('reset role');
    expect((await db.query<{ title: string }>("select title from public.editions where title='Colleague issue'")).rows).toHaveLength(1);
  });

  it('lets an editor publish and edit their own issue', async () => {
    await actor(editor);
    const published = await db.query("update public.editions set published=true where title='Own issue' returning id");
    expect(published.rows).toHaveLength(1);
    const renamed = await db.query("update public.editions set title='My issue' where title='Own issue' returning id");
    expect(renamed.rows).toHaveLength(1);
  });

  it('lets an administrator publish and rewrite another member’s issue', async () => {
    await actor(admin);
    const unpublished = await db.query("update public.editions set published=false where title='Colleague issue' returning id");
    expect(unpublished.rows).toHaveLength(1);
    const renamed = await db.query("update public.editions set title='Issue corrected by the desk' where title='Colleague issue' returning id");
    expect(renamed.rows).toHaveLength(1);
  });

  it('keeps the legitimate workflow: members still insert their own content', async () => {
    await actor(editor);
    await db.query("insert into public.articles(slug,title,body,author_id) values ('new-story','Fresh','Text',$1)", [editor]);
    await db.query(`insert into public.editions(title,edition_date,school_year,published,created_by,pdf_url,pdf_path,cover_url,cover_path) values ('Fresh issue','2026-11-05','2026-27',false,$1,'/api/media/editions/${editor}/2-fresh.pdf','editions/${editor}/2-fresh.pdf','/api/media/covers/${editor}/2-fresh.jpg','covers/${editor}/2-fresh.jpg')`, [editor]);
    expect((await db.query("select id from public.articles where slug='new-story'")).rows).toHaveLength(1);
    expect((await db.query("select id from public.editions where title='Fresh issue'")).rows).toHaveLength(1);
  });

  it('keeps the legitimate workflow: members still read the whole board', async () => {
    await actor(editor);
    const articles = await db.query('select slug from public.articles');
    expect(articles.rows.length).toBeGreaterThanOrEqual(3);
    const editions = await db.query('select title from public.editions');
    expect(editions.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the legitimate workflow: an editor still deletes their own article', async () => {
    await actor(editor);
    const deleted = await db.query("delete from public.articles where slug='new-story' returning id");
    expect(deleted.rows).toHaveLength(1);
  });

  it('still blocks an editor from deleting a colleague’s article', async () => {
    await actor(editor);
    const deleted = await db.query("delete from public.articles where slug='colleague-story' returning id");
    expect(deleted.rows).toHaveLength(0);
  });

  it('still blocks an editor from taking over the authorship of an article', async () => {
    await actor(editor);
    await expect(db.query("update public.articles set author_id=$1 where slug='editor-story'", [colleague])).rejects.toThrow(/row-level security|author cannot be changed/i);
  });

  it('can be applied twice without breaking', async () => {
    await db.exec('reset role');
    await db.exec(readFileSync('supabase/migrations/20261111000100_content_ownership.sql', 'utf8'));
    await actor(editor);
    const result = await db.query("update public.articles set published=false where slug='colleague-story' returning id");
    expect(result.rows).toHaveLength(0);
  });
});
