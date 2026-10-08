# 📰 Highland Academy · Student Newspaper

The Highland Academy school newspaper website with a **flipbook reader** (real page-turn
animation), **news portal**, **issue archive**, and an **editors' panel** with accounts and roles.

- **Each issue** is designed in Canva/Word, exported as a PDF and uploaded to the panel:
  readers flip through it like a real newspaper.
- **Between issues**, editors publish news with photos, YouTube videos and podcasts.
- Cost: **$0** (Vercel + Supabase free tiers).

## Quick start (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:3000 — with no configuration you will see sample content with the
flipbook reader working.

## Real setup (15 min)

### 1. Create the Supabase project (free)

1. Go to https://supabase.com and create a new project.
2. Open the **SQL Editor** and paste ALL the contents of `supabase/schema.sql`. Click **Run**.
   This creates the tables, security policies and storage bucket.

### 2. Configure the keys

1. Copy `.env.example` to `.env.local`.
2. In Supabase: **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, server only)
3. In Supabase: **Authentication → URL Configuration**, set your website URL
   (locally: `http://localhost:3000`) as the *Site URL*.

### 3. Create your admin account

With the server running (`npm run dev`):

```bash
curl -X POST "https://YOUR-PROJECT.supabase.co/auth/v1/admin/users" \
  -H "apikey: YOUR-SERVICE-ROLE-KEY" \
  -H "Authorization: Bearer YOUR-SERVICE-ROLE-KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@school.edu","password":"aStrongPassword","email_confirm":true}'
```

Then in the SQL Editor turn your user into an admin:

```sql
update public.profiles set role = 'admin' where email = 'teacher@school.edu';
```

> Easier alternative: invite the first admin from the panel itself (`/admin/team`)
> using any account that is already an admin. The invitation arrives by email.

### 4. Publish on the internet (free)

1. Push the project to GitHub.
2. At https://vercel.com → **Add New Project** → import the repository.
3. Under *Environment Variables* add the 4 variables from `.env.local`
   (use `https://your-web.vercel.app` in `NEXT_PUBLIC_SITE_URL`).
4. Deploy. The site is online: share the link with the school. 🎉

## How to publish an issue (for editors)

1. Design the newspaper in Canva/Word and download it as a **PDF**. Add one clear printed page number near the bottom of every page; the upload form reads digital numbers locally and uses Gemini to check scanned footers, then stops if any page number is unclear, missing, or duplicated.
2. Sign in at `/admin`.
3. **Issues → New issue**: number, title, date and the PDF. After verifying the printed page numbers, the upload form saves the pages in numeric order and generates the cover from the first numbered page.
4. Check it looks right in `/read` and click the eye 👁 to **publish** it.

## Roles

| | Editor | Admin |
|---|---|---|
| Write news articles | ✅ | ✅ |
| Upload issues (drafts) | ✅ | ✅ |
| Publish/unpublish | ✅ | ✅ |
| Delete issues | ❌ | ✅ |
| Manage the team | ❌ | ✅ |

## Project structure

```
src/app/               Pages (home, read, archive, news, admin)
src/app/api/           API: issues, news and team (protected)
src/components/        UI: header, cards and flipbook reader
src/lib/               Supabase, data, utilities
supabase/schema.sql    Full database schema
scripts/               Utilities (PDF.js worker, demo assets)
public/demo/           Demo-mode sample content
```
