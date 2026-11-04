# Mason's Study

A personal study site for science exams. Make a study set for an exam, upload
the class material (PDF slides, Word, PowerPoint, text, photos of notes) or
paste notes, and Claude builds a study guide in your preferred style plus
flashcards tagged by topic. Then study with flashcards, adaptive Learn mode,
practice tests (from your cards or exam-style questions with explanations),
games, suggested YouTube videos, and a tutor you can ask about the material.
Progress shows what is learned, still learning, and not studied, with cards due
for review.

Each person has their own account; everything they make is private to them.

**Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript, Tailwind
v4, Supabase (Postgres, Auth, Storage, RLS), Claude through `@anthropic-ai/sdk`,
deployed on Netlify. The build contract for contributors is
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Database schema: `study`, in a shared project

Every Mason's Study table and function lives in its own Postgres schema,
`study`, not in `public`. The hosted database is the existing Supabase
project **card-doc-test-temp** (`kuvnqapzuevhpviilqpc`), which also holds a
test copy of The Card Doc in the `public` schema (orders, cards, profiles,
its own storage buckets). Keeping Mason's Study in `study` means neither app
can collide with or change the other's tables, and Mason's Study can be
removed later without touching the Card Doc data.

- The app's three Supabase clients (`lib/supabase/client.ts`, `server.ts`,
  `admin.ts`) and `scripts/seed-demo.mjs` send every query and RPC to
  `study` (`DB_SCHEMA` in `lib/supabase/schema.ts`). Code keeps using plain
  table names (`.from("cards")`).
- The schema has to be exposed through the Data API: locally
  `supabase/config.toml` does it; on the hosted project it is a dashboard
  setting (see the checklist below). Without it every request fails with
  HTTP 406.
- Only three things live outside `study`, all named so they can't clash:
  the private Storage bucket `materials`, three policies on
  `storage.objects` named `study: ...` (they only cover that bucket), and
  the trigger `study_on_auth_user_created` on `auth.users`, which creates a
  `study.profiles` row for each new account and never blocks a sign-up.
- Auth is shared: one pool of users for both apps, and the URL settings,
  email templates and sign-up switches under Authentication apply to both.
  An account made in either app can sign in to the other.
- Signed-in users and the service role get explicit grants on `study`;
  `anon` gets nothing, so signed-out requests can't read it at all.

## Local development

You need Node 20.9 or newer and Docker.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start Supabase locally (runs in Docker and applies
   `supabase/migrations/*.sql`):

   ```bash
   npx supabase start
   ```

   `npx supabase status` prints the API URL and keys. Studio runs at
   http://127.0.0.1:54323 (pick the `study` schema in the Table Editor) and
   the test inbox (for confirmation emails) at http://127.0.0.1:54324.
   Locally, sign-up and reset emails use the templates in
   `supabase/templates/` (links to `/auth/confirm`).

3. Create `.env.local` from the template and fill it in:

   ```bash
   cp .env.example .env.local
   ```

   - `NEXT_PUBLIC_SUPABASE_URL`: `http://127.0.0.1:54321`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`: from
     `npx supabase status`
   - `ANTHROPIC_API_KEY`: your Claude API key (without it, AI features show a
     "not connected" message and everything else works)
   - `YOUTUBE_API_KEY`: optional

4. Run the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, sign up, and make a study set.

To reset the local database to a clean copy of the migrations, run
`npx supabase db reset`.

## Production setup checklist

Production uses the existing Supabase project **card-doc-test-temp**
(project ref `kuvnqapzuevhpviilqpc`, API URL
`https://kuvnqapzuevhpviilqpc.supabase.co`). It is shared with the Card Doc
test copy, which lives in the `public` schema and must keep working
untouched. Nothing below changes `public`, and the Authentication settings
are only added to, never switched off.

1. **Run the migrations** in name order, before deploying the code that
   needs them: paste each file into the SQL editor (Database > SQL Editor)
   and run it, or apply them through the Supabase MCP `apply_migration`
   tool (that is how the Card Doc test copy's migrations were applied).
   - `20261104000000_init.sql`: the `study` schema, its tables, RLS
     policies and grants, the private `materials` storage bucket with its
     three `study: ...` policies, and the `study_on_auth_user_created`
     trigger. Run it once: it stops with "relation already exists" if
     `study` is already set up.
   - `20261104000001_jobs_one_active.sql`: at most one queued or running
     job of each kind per set
   - `20261104000002_server_guards.sql`: checks that every uploaded file
     path is the uploader's own, strips internal options from jobs users
     create, and adds the per-user usage limits (`study.ai_usage`,
     `study.take_ai_quota`). The app refuses AI requests until this one is
     in.

   The last two are safe to run again.

   Don't use `npx supabase db push` on this project: its migration history
   holds the Card Doc test copy's migrations, which aren't in this repo, so
   the CLI refuses and suggests `supabase migration repair`, which would
   rewrite the other app's history. Never run `npx supabase db reset
   --linked` here: it wipes the whole database, Card Doc data included.
2. **Expose the schema.** Project Settings > Data API > Exposed schemas:
   add `study` and keep `public` and `graphql_public`. Without this every
   app request fails with HTTP 406 ("The schema must be one of the
   following").
3. **Check the result** in the SQL editor:

   ```sql
   select count(*) from information_schema.tables where table_schema = 'study'; -- 14
   select id, public from storage.buckets where id = 'materials';                -- materials, false
   select count(*) from public.orders;                                           -- Card Doc data, unchanged
   ```
4. **Configure Auth.** These settings are project-wide and shared with the
   Card Doc test copy, so add to them rather than change them.
   - Authentication > URL Configuration: leave the **Site URL** as it is.
     Under **Redirect URLs**, add `https://<mason-site>/**` (and the same
     for a custom domain; `https://**--<mason-site>.netlify.app/**` if
     deploy previews should sign in). The app's email links go to
     `/auth/callback?next=/...`, and an exact `/auth/callback` entry does
     not match that query string; when nothing matches, Supabase sends
     people to the Site URL, which is the Card Doc site.
   - Authentication > Emails > Templates: **keep the default templates.**
     Their links go through Supabase and land on `/auth/callback` with a
     one-time code, which the app already handles (the link has to be
     opened in the same browser that asked for it). Don't paste
     `supabase/templates/*.html` into this project: they are built on
     `{{ .SiteURL }}`, which here is the Card Doc address, and templates
     apply to every app in the project. Those templates are for the local
     stack only.
   - Email delivery: unless the project has custom SMTP (Authentication >
     Emails > SMTP Settings), Supabase's built-in mailer only delivers to
     members of the Supabase organization's team, a few emails per hour, so
     confirmation and reset emails to the student would not arrive. The
     simplest way to give the student an account is Authentication > Users
     > Add user > Create new user, with "Auto Confirm User" on; they then
     log in and finish onboarding. Custom SMTP is also project-wide (the
     Card Doc app sends its own account emails through Resend, but check
     before changing it).
   - "Confirm email", the minimum password length and "Allow new users to
     sign up" (Authentication > Sign In / Providers) are project-wide too.
     Leave them as the Card Doc test copy needs them; the app already
     requires passwords of at least 8 characters on its own forms.
5. **Create the Netlify site** from this repository. `netlify.toml` already
   sets the build command (`npm run build`), the publish directory (`.next`)
   and the functions directory. Netlify installs its Next.js runtime
   automatically.
6. **Set Netlify environment variables** (Project configuration >
   Environment variables), with both the Builds and Functions scopes:
   - `NEXT_PUBLIC_SUPABASE_URL=https://kuvnqapzuevhpviilqpc.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the project's anon (or publishable)
     key, from Project Settings > API Keys
   - `SUPABASE_SERVICE_ROLE_KEY`: the service_role (or secret) key; mark it
     secret. It bypasses RLS for the whole project, the Card Doc test
     tables included, so it only ever goes in server-side settings. The app
     uses it only in the job runner, against `study`.
   - `ANTHROPIC_API_KEY` (mark it secret)
   - `NEXT_PUBLIC_SITE_URL`: Mason's Study's production URL (email links
     are built from it)
   - Optional: `YOUTUBE_API_KEY` (YouTube Data API v3) and `ANTHROPIC_MODEL`
     (defaults to `claude-opus-5-5`)

   There is no schema variable: the app always uses `study`. Never put keys
   in `netlify.toml`. `NEXT_PUBLIC_*` values are baked in at build time, so
   trigger a new deploy after changing any variable.
7. **Deploy**, then sign in on the live site and build a small study set to
   check uploads, the build job and the tutor end to end.
8. **Limit who can run up the bill.** The site uses your Claude key for
   whoever is signed in, and auth is shared with the Card Doc test copy:
   any account in the project, made in either app, can sign in here.
   - Don't turn off sign-ups project-wide without checking that the Card
     Doc test app doesn't need them. Closing sign-ups for Mason's Study
     alone would take an allowlist in the app, which isn't built yet.
   - The per-user usage limits below always apply.
   - Set a monthly spend limit for the API key's workspace in the Claude
     Console as a backstop.
   - If you use `YOUTUBE_API_KEY`, restrict the key to the YouTube Data API
     v3 in Google Cloud.

### Removing Mason's Study from the shared project

Everything it added is named for it. In the SQL editor:

```sql
drop trigger if exists study_on_auth_user_created on auth.users;
drop policy if exists "study: read own material files" on storage.objects;
drop policy if exists "study: upload own material files" on storage.objects;
drop policy if exists "study: delete own material files" on storage.objects;
drop schema study cascade;
```

Then empty and delete the `materials` bucket in Storage, remove `study`
from the exposed schemas, and delete Mason's Study's redirect URLs and user
accounts. The `public` schema is never involved.

## Usage limits

Each account has limits on what costs money, checked in the database
(`study.take_ai_quota_for` in `supabase/migrations/20261104000002_server_guards.sql`):

| What | Per hour | Per day |
|---|---|---|
| Questions to the tutor | 60 | 400 |
| Study-set builds (new or retried) | 8 | 30 |
| Practice-question batches (new or retried) | 10 | 40 |
| Video searches (one per topic) | 40 | 80 |

When a limit is reached the app says how long to wait (HTTP 429). Change
the numbers in that function with a new migration. Each tutor question also
sends at most 40,000 characters of earlier chat, and every prompt uses at
most 12 topics.

## Security checks

Uploads live in the private `materials` bucket under
`<user_id>/<set_id>/<uuid>-<file name>`, and the build job only ever
downloads paths of that shape for the job's own user and set. The
`materials_storage_path_owned` constraint enforces the same shape in the
database. If the migration warned that existing rows didn't match, list them
before validating the constraint:

```sql
select id, user_id, set_id, storage_path, status
from study.materials
where storage_path is not null
  and storage_path not like user_id::text || '/' || set_id::text || '/%';
```

Any row there was written outside the app; treat its `content_text` as
suspect, delete the row, then run
`alter table study.materials validate constraint materials_storage_path_owned;`.

## How background jobs run

Building a study set and generating exam questions can take several minutes,
longer than Netlify allows for a normal request (60 seconds). They run as
jobs:

1. The page calls `startJob()` (`lib/jobs/start-job.ts`), which POSTs
   `/api/jobs`. The route checks that you own the set, inserts a `jobs` row
   (status `queued`), and triggers the runner.
2. On Netlify, the trigger calls the background function
   `/.netlify/functions/run-job` (`netlify/functions/run-job.mts`), which can
   run for up to 15 minutes. Under `next dev` (or any host without that
   function), the job runs inside the Next server after the response is sent.
3. The runner uses the Supabase service-role key (through
   `lib/supabase/admin.ts`, so it also reads and writes `study`), claims the job atomically
   (so duplicate triggers are harmless), and writes `progress` and a
   readable `message` as it goes. It ends `done` or `error`.
4. The page follows the job with `useJob()` / `useLatestJob()`
   (`lib/jobs/use-job.ts`), which polls the `jobs` row every 2 seconds until
   it finishes. The guide fills in section by section while the job runs.

A failed job, or one that has made no progress for 15 minutes, can be retried
with `POST /api/jobs/<jobId>/retry`.

Rebuilding a set never blanks its guide: each section keeps its previous
text until the new text is saved, and a section Claude can't rewrite (a
refusal, an outage) keeps its previous text for good. Picture-only pages
inside a typed PDF are read by Claude; long scans are read in parts of 25
pages; files that could only be read in part are named in the job's message
and noted on the material.

## Testing

```bash
node --test tests/*.test.mjs
```

runs the unit tests (plain Node, no build needed). For end-to-end runs
without a Claude key, start the mock API with
`MOCK_PORT=4010 node scripts/mock-anthropic.mjs` and point the app at it with
`ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=test`.
`node scripts/seed-demo.mjs <email> <password>` creates a demo account with
a built set.

## Scripts

- `npm run dev`: development server
- `npm run build`: production build
- `npm run start`: run the production build
- `npm run lint`: ESLint
