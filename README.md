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

Development uses Turbopack to reduce the first compilation delay. For a compiled local preview, run `npm run preview` and wait for the build to finish before opening the site.

Open http://localhost:3000 — with no configuration you will see sample content with the
flipbook reader working.

> Going back to demo mode? **Comment out** `NEXT_PUBLIC_SUPABASE_URL`,
> `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
> If they point at a project that no longer exists, every page renders as if the
> newspaper were empty and `/read/<id>` answers 404 — the app cannot tell a dead
> project from an empty one.

## Real setup (15 min)

> Step-by-step version in Spanish, including the first admin and common errors:
> [`supabase/SETUP.md`](supabase/SETUP.md).

### 1. Create the Supabase project (free)

1. Go to https://supabase.com and create a new project.
2. Open the **SQL Editor** and paste ALL the contents of `supabase/schema.sql`. Click **Run**.
   This creates the tables, security policies and private storage bucket.

### 2. Configure the keys

1. Copy `.env.example` to `.env.local`.
2. In Supabase: **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secret, server only)
3. In Supabase: **Authentication → URL Configuration**, set your website URL
   (locally: `http://localhost:3000`) as the *Site URL*. Add
   `http://localhost:3000/auth/confirm` (and the production equivalent) under
   *Redirect URLs*, or invitation and password-reset emails will bounce.
4. In Supabase: **Authentication → Providers → Email**, turn
   **"Allow new users to sign up" OFF**. Accounts are created by an admin from
   the panel; leaving public signup on would let anyone give themselves an
   account. The database also refuses to turn public signups into newspaper members.
5. Optional, for AI metadata and scanned-footer OCR: add `GEMINI_API_KEY` from
   https://aistudio.google.com/apikey. The panel falls back to the local PDF
   heuristics when it is missing.

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
insert into public.profiles (id, email, full_name, role)
select id, email, 'Administrator', 'admin' from auth.users
where email = 'teacher@school.edu'
on conflict (id) do update set role = 'admin';
```

> Easier alternative: invite the first admin from the panel itself (`/admin/team`)
> using any account that is already an admin. The invitation arrives by email;
> the link opens `/auth/confirm`, which signs the invited person in and sends
> them to `/set-password` to choose a password. "Forgot your password?" on the
> login page uses the same route.

### 4. Publish on the internet (free)

1. Push the project to GitHub.
2. At https://vercel.com → **Add New Project** → import the repository.
3. Under *Environment Variables* add the 4 variables from `.env.local`
   (use `https://your-web.vercel.app` in `NEXT_PUBLIC_SITE_URL`).
4. Deploy. The site is online: share the link with the school. 🎉

## How to publish an issue (for editors)

1. Design the newspaper in Canva/Word and download it as a **PDF**. Add one clear printed page number near the bottom of every page; the upload form reads digital numbers locally and uses Gemini to check scanned footers, then stops if any page number is unclear, missing, or duplicated.

> The sample issue in `public/demo/` is there for the **reader** only: its pages have
> no printed numbers, so the upload form will (correctly) refuse it. To try the
> upload flow, export a PDF whose pages carry folios.
2. Sign in at `/admin`.
3. **Issues → New issue**: number, title, date and the PDF. After verifying the printed page numbers, the upload form saves the pages in numeric order and generates the cover from the first numbered page.
4. Check it looks right in `/read` and click the eye 👁 to **publish** it.

Large PDFs use resumable uploads in 6 MB blocks through Supabase's direct Storage host. Keep the editor page open while uploading. Connection failures retry from the last saved block; **Pause upload** and **Resume upload** let you continue the same attempt. Completed files are retained when only the final save fails, so **Retry save** does not transfer the PDF again. Repeated saves use one identifier to prevent duplicate drafts. Selecting a different PDF or leaving the editor discards the current attempt; the original file must be selected again after reloading the page. The file-size limit remains 50 MB.

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

## Security update for an existing Supabase project

Deploy the matching application and run **supabase/harden-newspaper.sql** in the project SQL Editor. It preserves accounts and content, makes the newspaper bucket private, restricts editorial access to members, validates upload ownership, protects the last admin, and installs shared AI quotas. Existing public asset URLs are converted to protected media URLs by the application. Old public URLs will no longer work directly.

New projects can run the complete **supabase/schema.sql**, which includes this migration. Public signups no longer receive profiles; bootstrap the first administrator with the INSERT above, then invite colleagues from the panel. AI requires a signed-in member even when a Gemini key is available in demo mode.

Validation: `npm test`, `npm run typecheck`, and `npm run build`. The SQL security tests use an isolated PostgreSQL database and do not connect to the real Supabase project.

The admin workspace now includes an overview, searchable content lists, **Account & security**, and **Activity**. Administrators must enroll an authenticator and verify a code in `/admin/account` before inviting members, changing roles, deactivating access, or restoring it. This AAL2 requirement is enforced by the team API and database. TOTP follows the [Supabase MFA flow](https://supabase.com/docs/guides/auth/auth-mfa/totp); enable enrollment and verification in the project's Auth settings. Project owners handle lost-authenticator recovery in Supabase Auth.

Re-run the current migration even if an earlier version was applied. Membership deactivation now preserves accounts, uploaded files and authorship. Inactive members lose editorial access immediately in API checks and RLS. Reactivation reuses the existing identity. The team list shows pending invitations using Auth confirmation metadata; it does not guess whether an invitation link has expired. Database triggers record future content and membership changes in an admin-only audit history. Verified Auth email changes are synchronized to profiles; account email changes use Supabase's confirmation flow.
