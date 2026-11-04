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
   http://127.0.0.1:54323 and the test inbox (for confirmation emails) at
   http://127.0.0.1:54324.

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

1. **Create a Supabase project** at https://supabase.com/dashboard.
2. **Run the migrations**, all of `supabase/migrations/` in name order,
   before deploying the code that needs them. Either link the project and
   push:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   or paste each file into the SQL editor and run them in order:
   - `20261104000000_init.sql`: tables, RLS policies, and the private
     `materials` storage bucket
   - `20261104000001_jobs_one_active.sql`: at most one queued or running job
     of each kind per set
   - `20261104000002_server_guards.sql`: checks that every uploaded file path
     is the uploader's own, strips internal options from jobs users create,
     and adds the per-user usage limits (`ai_usage`, `take_ai_quota`). The app
     refuses AI requests until this one is in.

   All three are safe to run again.
3. **Configure Auth.**
   - Authentication > URL Configuration:
     - Site URL: your production URL, for example
       `https://your-site.netlify.app`. Email links are built from it.
     - Redirect URLs: `https://your-site.netlify.app/auth/callback` and
       `https://your-site.netlify.app/auth/confirm` (add the same for any
       custom domain, and `https://**--your-site.netlify.app/**` if you want
       deploy previews to sign in).
   - Authentication > Emails > Templates: replace the message body of
     "Confirm signup" with the contents of
     [`supabase/templates/confirmation.html`](supabase/templates/confirmation.html)
     and "Reset password" with
     [`supabase/templates/recovery.html`](supabase/templates/recovery.html).
     Their links go to `/auth/confirm` with a `token_hash`, so they work on
     any device, not only in the browser that asked for them:
     - `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/onboarding`
     - `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

     Suggested subjects: "Confirm your email for Mason's Study" and "Reset
     your Mason's Study password". (Locally, `supabase/config.toml` already
     uses these templates.)
   - Authentication > Sign In / Providers > Email: set the minimum password
     length to 8 (the app asks for at least 8 characters), and turn on
     "Confirm email" if you want sign-ups confirmed.
4. **Create the Netlify site** from this repository. `netlify.toml` already
   sets the build command (`npm run build`), the publish directory (`.next`)
   and the functions directory. Netlify installs its Next.js runtime
   automatically.
5. **Set Netlify environment variables** (Project configuration > Environment
   variables), with both the Builds and Functions scopes:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase >
     Project Settings > API)
   - `SUPABASE_SERVICE_ROLE_KEY` (mark it secret)
   - `ANTHROPIC_API_KEY` (mark it secret)
   - `NEXT_PUBLIC_SITE_URL`: your production URL
   - Optional: `YOUTUBE_API_KEY` (YouTube Data API v3) and `ANTHROPIC_MODEL`
     (defaults to `claude-opus-5-5`)

   Never put keys in `netlify.toml`. `NEXT_PUBLIC_*` values are baked in at
   build time, so trigger a new deploy after changing any variable.
6. **Deploy**, then sign up on the live site and build a small study set to
   check uploads, the build job and the tutor end to end.
7. **Lock it down.** The site uses your Claude key for whoever is signed
   in, so once the student's account exists:
   - Turn off new sign-ups: Authentication > Sign In / Providers > "Allow
     new users to sign up" off. (To add someone later, invite them from
     Authentication > Users.)
   - Set a monthly spend limit for the API key's workspace in the Claude
     Console as a backstop.
   - If you use `YOUTUBE_API_KEY`, restrict the key to the YouTube Data API
     v3 in Google Cloud.

## Usage limits

Each account has limits on what costs money, checked in the database
(`take_ai_quota_for` in `supabase/migrations/20261104000002_server_guards.sql`):

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
from public.materials
where storage_path is not null
  and storage_path not like user_id::text || '/' || set_id::text || '/%';
```

Any row there was written outside the app; treat its `content_text` as
suspect, delete the row, then run
`alter table public.materials validate constraint materials_storage_path_owned;`.

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
3. The runner uses the Supabase service-role key, claims the job atomically
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
