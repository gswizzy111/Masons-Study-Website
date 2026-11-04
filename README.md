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
2. **Run the migration.** Either link the project and push:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   or paste `supabase/migrations/20261104000000_init.sql` into the SQL editor
   and run it. It creates the tables, RLS policies, and the private
   `materials` storage bucket.
3. **Configure Auth** (Authentication > URL Configuration):
   - Site URL: your production URL, for example `https://your-site.netlify.app`
   - Redirect URLs: `https://your-site.netlify.app/auth/callback` and
     `https://your-site.netlify.app/auth/confirm` (add the same for any
     custom domain, and `https://**--your-site.netlify.app/**` if you want
     deploy previews to sign in).
   - Email templates (Authentication > Emails): point "Confirm signup" at
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` and
     "Reset password" at
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`.
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

## Scripts

- `npm run dev`: development server
- `npm run build`: production build
- `npm run start`: run the production build
- `npm run lint`: ESLint
