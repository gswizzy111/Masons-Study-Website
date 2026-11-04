# Mason's Study: architecture and build contract

This file is the contract every builder works from. If you need to change a
contract (an exported name, a prop, a route), do not do it silently: keep the
documented signature working and note the change in your final report.

## 1. Product

A personal study site for one serious student: a biology undergrad who starts
medical school in about 18 months and studies mostly for science exams (course
exams now, the MCAT and med school later). They want "the ultimate study site,
catered to exactly how I learn". Each person has an account; everything they
make is private to them.

Core loop:

1. **Make a study set** (one exam or unit, e.g. "Exam 2: Metabolism"), optionally
   in a course with an exam date.
2. **Upload material** (PDF lecture slides, DOCX, PPTX, TXT/MD, photos of notes)
   or paste notes.
3. The site **builds the set** with Claude: topics, a study guide written in the
   student's preferred style, and flashcards tagged by topic.
4. **Study**: read the guide, flip flashcards, run **Learn** (adaptive: multiple
   choice, then written, until mastered, with spaced review), take **practice
   tests** (from cards, or AI exam-style questions with explanations), play
   **games** (Meteor: type the answer before the meteor lands; Match), watch
   **YouTube** videos suggested per topic.
5. **Ask Claude** anything in a tutor panel next to the material.
6. **See progress**: what is learned, still learning, and not studied, overall
   and per topic, plus cards due for review.

The **learning profile** (set in onboarding, editable in settings) shapes every
AI output: study guide style, tutor answers, question style, video picks.

## 2. Stack and conventions

- Next.js 16.4 App Router, React 19.3, TypeScript strict, Tailwind v4 (CSS-first
  config in `app/globals.css`, compiled by `@tailwindcss/turbopack`).
- **This is not the Next.js you know.** Read the relevant guide in
  `node_modules/next/dist/docs/` before using an API. Things that bite:
  - `middleware.ts` is now **`proxy.ts`** (export `proxy`). See
    `01-app/03-api-reference/03-file-conventions/proxy.md`.
  - `cookies()`, `headers()` are async. `params` and `searchParams` are
    Promises in pages, layouts and route handlers. Global helper types
    `PageProps<'/sets/[setId]'>`, `LayoutProps<...>`, `RouteContext<...>` exist.
  - `cacheComponents` is **off** (removed from `next.config.ts` on purpose).
    Pages that read cookies are dynamic; no `"use cache"` needed.
- Supabase: `@supabase/ssr` + `@supabase/supabase-js`. Auth is email + password.
  All app data lives in the Postgres schema **`study`**, never `public` (see
  section 4, "Schema and hosting"). Every client sets
  `db: { schema: DB_SCHEMA }`; never create a Supabase client anywhere else.
- Claude: `@anthropic-ai/sdk` 1.x. See section 7.
- UI: hand-built components in `components/ui/` (Radix primitives from the
  `radix-ui` package where behavior is hard: dialog, dropdown, tooltip, popover,
  select). `lucide-react` icons, stroke width 1.75. `motion/react` for animation.
  `sonner` for toasts. `react-markdown` + `remark-gfm` for markdown.
- Dependencies are already installed. **Do not run `npm install`.** If you
  truly need a new package, say so in your final report instead.
- Imports: use the `@/` alias in app and component code. **Exception:** files
  under `lib/ai/`, `lib/extract/`, `lib/jobs/` (except `start-job.ts` and
  `use-job.ts`), `lib/supabase/admin.ts`, `lib/supabase/schema.ts`, `lib/env.ts`, `lib/types.ts`,
  `lib/mastery.ts` and `lib/learn/` must use **relative imports only** and no
  Next-only modules (`next/*`, `server-only`), because the Netlify background
  function bundles them outside Next.
- Read env vars with `process.env.X` (works in Next and in Netlify functions).
- Server Components by default; `"use client"` only where needed.
- Data access: Server Components and route handlers use the server Supabase
  client (RLS applies as the signed-in user). Client components use the browser
  client. Only the job runner uses the service-role client.
- Visible copy: plain, direct, encouraging, sentence case. **No em dashes in
  visible copy.** No exclamation-mark spam. No emoji in UI chrome.
- Accessibility is required: semantic HTML, labels on every input, visible
  focus rings, keyboard support for every interaction (flashcards, games,
  Learn), `prefers-reduced-motion` respected, WCAG AA contrast in both themes.
- Must work at 390px phone width and 1440px desktop, light and dark.

## 3. Environment variables

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL (production: `https://kuvnqapzuevhpviilqpc.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | job runner (bypasses RLS) |
| `ANTHROPIC_API_KEY` | server only | Claude |
| `ANTHROPIC_MODEL` | server only, optional | default `claude-opus-5-5` |
| `ANTHROPIC_BASE_URL` | optional | SDK reads it; used to point local tests at a mock |
| `YOUTUBE_API_KEY` | server only, optional | YouTube Data API v3 search |
| `ALLOWED_EMAILS` | server only, required in production | comma-separated addresses allowed to use the app (logins are shared with the Card Doc test copy); unset = anyone (local dev). Enforced in `lib/access.ts`: sign-in/up, `requireUser()`, `/api/*` (403) and the job runner |
| `NEXT_PUBLIC_SITE_URL` | optional | absolute URL for auth email links (falls back to request origin); set it in production |

There is no schema variable: `DB_SCHEMA` in `lib/supabase/schema.ts` is
always `study`.

When `ANTHROPIC_API_KEY` is missing, AI features must show a clear "Claude is
not connected yet" state instead of crashing. When `YOUTUBE_API_KEY` is
missing, videos fall back to YouTube search links.

## 4. Data model

### Schema and hosting

Every table and function below lives in the Postgres schema `study`. The
hosted database is the Supabase project **card-doc-test-temp**
(`kuvnqapzuevhpviilqpc`), shared with a test copy of The Card Doc that owns
the `public` schema (orders, cards, profiles, `public.set_updated_at()`,
buckets `app-config`, `signed-documents`, `card-photos`) and must keep
working untouched. A separate schema keeps the two apps from colliding
(both have `profiles`, `cards` and a `set_updated_at()`), and lets Mason's
Study be dropped as a unit.

How the app reaches it:

- `lib/supabase/schema.ts` exports `DB_SCHEMA = "study"`. The browser,
  server and admin clients pass `db: { schema: DB_SCHEMA }`, so PostgREST
  gets `Accept-Profile: study` on reads and `Content-Profile: study` on
  writes and RPC. `.from("cards")`, `{ count: "exact", head: true }`,
  embeds such as `cards(count)` and `supabase.rpc("take_ai_quota")` all
  resolve inside `study`. `scripts/seed-demo.mjs` sets the same schema.
  `proxy.ts` only calls `auth.*`, so its client needs no schema.
- The Netlify background function (`netlify/functions/run-job.mts` →
  `lib/jobs/run-job.ts` → `lib/supabase/admin.ts`) uses the admin client,
  so the job runner reads and writes `study` too. Storage calls are not
  schema-bound.
- `study` must be in the Data API's exposed schemas: `supabase/config.toml`
  (`[api] schemas`) locally, Project Settings > Data API > Exposed schemas on
  the hosted project. Without it every request answers 406 (`PGRST106`).

Objects outside `study`, all named so they can't clash with the other app:
the private bucket `materials`; three `storage.objects` policies named
`study: ...` that only match `bucket_id = 'materials'`; and the trigger
`study_on_auth_user_created` on `auth.users` →
`study.handle_new_user()`, which inserts a `study.profiles` row and swallows
its own errors so it never blocks a sign-up in either app.

Shared, project-wide: the auth user pool (an account made in either app can
sign in to both), Authentication URL configuration, email templates, SMTP,
and the sign-up and confirmation switches. Production setup for this is in
the README ("Production setup checklist").

Rules for new migrations:

- Qualify every object with `study.`; never create, alter or grant anything
  in `public`.
- Functions: `set search_path = ''` and fully qualified names. Postgres
  gives new functions `EXECUTE` to `PUBLIC`; revoke it (and from `anon`,
  `authenticated`) for anything internal, as `20261104000002` does.
- Grants: `anon` gets nothing on `study`. The init migration's default
  privileges cover tables and sequences created later by the same role;
  grant explicitly to `authenticated, service_role` in each new migration
  anyway, in case it runs as a different role.
- Anything that must live in a shared schema (`storage`, `auth`) gets a
  `study`-prefixed name and a guard that limits it to this app's rows.
- Apply them with the SQL editor or the Supabase MCP, never
  `supabase db push` (the remote history holds the Card Doc migrations).

### Tables

Source of truth: `supabase/migrations/20261104000000_init.sql`. Types:
`lib/types.ts`. Every table has `user_id` (defaults to `auth.uid()` for normal
inserts; **the service role must set `user_id` explicitly**) and owner-only
RLS. Child rows can only point at the user's own set (`owns_set()`).

Tables: `profiles` (learning_profile jsonb), `courses`, `study_sets`
(`topics` jsonb `[{id,title,summary}]`, `status` draft|building|ready|error),
`materials`, `guide_sections` (one per topic, ordered by `position`), `cards`,
`card_progress` (one row per card: `level` 0 not studied, 1 still learning,
2 familiar, 3 mastered; SRS fields), `chat_messages`, `jobs` (users insert +
read; only the service role updates), `exam_questions`, `test_attempts`,
`game_scores` (meteor: points, higher better; match: ms, lower better),
`video_suggestions`.

Storage: private bucket `materials`, object path
`<user_id>/<set_id>/<uuid>-<safe file name>`, 50 MB per file. The browser
uploads directly to Storage (never through a route handler: Netlify caps
request bodies at 6 MB). `materials.storage_path` must have exactly that
shape for the row's own user and set (CHECK `materials_storage_path_owned`,
and `isOwnStoragePath()` in `lib/extract/index.ts` before the service-role
download). A `ready` material's `error` holds a note about parts that
couldn't be read (picture pages, a long scan read only in part).

Server guards (`20261104000002_server_guards.sql`): `ai_usage` and
`take_ai_quota(kind, cost)` (per-user hourly and daily limits for chat,
builds, exam questions and video searches; read through
`lib/usage-limits.ts`, 429 when reached), and a BEFORE INSERT trigger on
`jobs` that keeps only the public options (`regenerate`, `count`,
`topicIds`, `difficulty`), resets the bookkeeping columns, and counts the
job toward the limits (raises `PT429`). Internal options (`continue_from`,
`continuations`, carried totals) are written only by the runner.

## 5. Shared modules (contracts)

Owner in brackets. "stub" means the foundation writes a compiling placeholder
with the final signature and the named builder replaces the body.

### Platform [F2: platform]
- `lib/supabase/schema.ts`: `DB_SCHEMA = "study"` (no imports; bundled by the
  Netlify function through `admin.ts`).
- `lib/env.ts`: `publicEnv` `{ supabaseUrl, supabaseAnonKey }`;
  `serverEnv()` → `{ serviceRoleKey, anthropicApiKey, anthropicModel, youtubeApiKey }`
  (missing values are `undefined`, never throws); `aiConfigured(): boolean`;
  `youtubeConfigured(): boolean`; `siteUrlFrom(origin?: string): string`.
- `lib/utils.ts`: `cn(...classes)` (clsx + tailwind-merge), `formatRelative(date)`,
  `daysUntil(dateStr)`, `slugifyFileName(name)`, `pluralize(n, word)`.
- `lib/supabase/client.ts`: `createClient()` browser client (singleton OK).
- `lib/supabase/server.ts`: `async createClient()`; `async getUser()` → `User | null`;
  `async requireUser()` → `{ supabase, user }`, redirects to `/login?next=<path>`
  when signed out. Re-exports `safeNextPath` from `lib/safe-next.ts` (no
  Next imports; also used by `proxy.ts`): the one check for redirect targets
  (refuses control characters, backslashes, and anything that resolves to
  another origin).
- `lib/usage-limits.ts`: `takeQuota(supabase, kind, cost?)` →
  `{ ok: true } | { ok: false, status: 429 | 503, message }`; `limitMessage()`.
- `lib/supabase/admin.ts`: `createAdminClient()` service-role client (relative
  imports, no `server-only`).
- `proxy.ts` (root): refreshes the Supabase session cookie on every request
  (standard `@supabase/ssr` pattern) and redirects signed-out users away from
  `/dashboard`, `/sets/*`, `/settings`, `/onboarding` to `/login?next=...`.
  Excludes static assets, `/api/*` (routes check auth themselves) and
  `/auth/*`.
- `lib/mastery.ts` (full implementation, pure):
  `type Bucket = 'not_studied' | 'learning' | 'mastered'`;
  `bucketOf(p?: { level: number } | null): Bucket` (none/0 → not_studied,
  1-2 → learning, 3 → mastered);
  `isDue(p, now = new Date()): boolean` (level 3 and `due_at <= now`, or
  level 1-2 not seen for 1+ day);
  `type MasterySummary = { total, not_studied, learning, familiar, mastered, due, percent }`
  (`percent` = round(100 * mastered / total), 0 when empty);
  `summarize(cards, progress, now?)`;
  `summarizeByTopic(topics, cards, progress, now?)` →
  `Array<{ topic: Topic; summary: MasterySummary }>` in topic order, plus an
  "Other" topic (`id: 'other'`) for cards with no or unknown topic_id, omitted if empty.
- `lib/ai/client.ts`: `MODEL` (env `ANTHROPIC_MODEL` or `claude-opus-5-5`),
  `getAnthropic()` (throws `AiNotConfiguredError` without a key),
  `class AiNotConfiguredError`, `class AiRefusalError`,
  `FALLBACK_BETA = 'server-side-fallback-2026-07-01'`.
- `lib/ai/learning-profile.ts`: `describeLearningProfile(p: LearningProfile): string`
  (turns the profile into 4-10 lines of prompt guidance; sensible defaults for
  empty fields: undergrad bio student heading to med school, balanced depth).
- `lib/ai/set-context.ts`: `loadSetContext(supabase, setId, opts?: { includeGuide?: boolean; maxChars?: number })`
  → `{ title, topics, text, truncated, charCount }`. Builds one text block
  (materials' `content_text` with `<material name="...">` wrappers, then the
  guide sections if `includeGuide`: every section with text, including ones
  being rewritten). Default `maxChars` 600000; if cut, sets
  `truncated: true` (callers must surface that, never hide it). Topics come
  through `sanitizeTopics()` (at most 12, titles 200 and summaries 600
  characters), since users can write `study_sets.topics` directly; every
  prompt reads topics that way (`loadSet()` in the job runner too).
- `lib/jobs/start-job.ts` (client): `startJob(setId, kind, options?)` →
  `Promise<string>` job id; POSTs `/api/jobs`, throws `Error(message)` on failure.
- `lib/jobs/use-job.ts` (client hook): `useJob(jobId: string | null)` →
  `{ job: Job | null, loading: boolean }`, polls the `jobs` row every 2 s until
  `done`/`error`; `useLatestJob(setId, kind)` → same shape for the newest job
  of that kind (polls while queued/running).
- `components/chat/chat-context.tsx` (full implementation): `ChatProvider`
  `{ setId, children }`; `useChat()` →
  `{ isOpen, open(), close(), toggle(), ask(text: string), pendingQuestion: string | null, takePendingQuestion(): string | null }`.
  `ask()` opens the panel and queues the question; the panel takes it and sends it.
- Stubs F2 writes for builders to replace:
  - `components/chat/chat-panel.tsx`: `export function ChatPanel(props: { setId: string; setTitle: string; className?: string })` [B7 chat]
  - `components/jobs/job-progress.tsx`: `export function JobProgress(props: { job: Job | null; onRetry?: () => void; className?: string })` [B2 sets]
  - `lib/learn/progress.ts`: `export async function recordAnswer(supabase: SupabaseClient, input: { cardId: string; setId: string; correct: boolean; mode: AnswerMode; examDate?: string | null }): Promise<CardProgress | null>` (without `examDate` it reads `study_sets.exam_date`; reviews before an exam land before it), `export type AnswerMode = 'mc' | 'written' | 'flashcard' | 'test' | 'review'` [B4 learn]
- `netlify.toml`, `.env.example`, `next.config.ts` upkeep.

### Design system [F1: design]
- `app/globals.css`: tokens (section 6), base styles, `.prose-study` styles for
  rendered markdown, print styles for the guide.
- `app/layout.tsx`: fonts via `next/font/google`, metadata (title template
  "%s · Mason's Study"), theme no-flash script, `<Toaster />`.
- `components/theme-toggle.tsx`, `components/brand.tsx` (wordmark + small SVG mark).
- `components/ui/`: `button` (variants primary, secondary, ghost, outline,
  danger, link; sizes sm, md, lg, icon; `asChild` via Radix Slot), `input`,
  `textarea`, `label`, `field` (label + hint + error wrapper), `card`, `badge`,
  `dialog`, `dropdown-menu`, `tooltip`, `select`, `progress` (bar),
  `progress-ring` (SVG circle: `value` 0-100, `size`, `stroke`, label slot),
  `mastery-bar` (stacked bar of not_studied / learning / mastered with legend,
  takes a `MasterySummary`), `skeleton`, `spinner`, `kbd`, `empty-state`,
  `segmented` (segmented control), `tabs-nav` (link-based tab bar with active
  state and horizontal scroll on phones).
- `components/markdown.tsx`: `<Markdown>{md}</Markdown>` using react-markdown +
  remark-gfm, styled with `.prose-study`, tables scroll horizontally, links open
  in a new tab with `rel="noreferrer"`, no raw HTML.
- `components/app-shell/`: `AppShell` (header with brand, primary nav:
  Dashboard, New set, Settings; user menu with sign-out form posting to
  `/auth/signout`; theme toggle; mobile menu sheet) and `app/(app)/layout.tsx`
  which calls `requireUser()` and renders `AppShell`.
- `app/page.tsx`: landing page for signed-out visitors (what the site does,
  sign up / log in); signed-in visitors are redirected to `/dashboard`.
- `app/not-found.tsx`, `app/(app)/error.tsx` (friendly error with retry).
- `DESIGN.md` at the repo root documenting the system.

## 6. Design direction: "lab notebook, calm focus"

Warm paper, ink, one chlorophyll-teal accent. Quiet chrome so the material is
the loudest thing on screen. Dense where studying needs density (cards list,
guide), generous on dashboards. No gradients-on-everything, no glassmorphism,
no purple, no stock illustrations.

Fonts (`next/font/google`): **Fraunces** for display headings (variable, opsz,
weights 500-600), **Hanken Grotesk** for UI and body, **JetBrains Mono** for
numbers that tick (timers, scores, kbd). CSS vars `--font-display`,
`--font-sans`, `--font-mono`.

Tokens (CSS custom properties on `:root`, overridden under `.dark`; exposed to
Tailwind through `@theme inline` so classes like `bg-bg bg-surface text-ink
text-ink-2 border-line bg-accent text-accent-ink bg-accent-soft text-learning`
work):

| token | light | dark |
|---|---|---|
| `--bg` | `#F7F6F2` | `#0E1012` |
| `--surface` | `#FFFFFF` | `#16191C` |
| `--surface-2` (sunken) | `#F0EEE8` | `#1D2125` |
| `--ink` | `#16181C` | `#ECEEF0` |
| `--ink-2` (muted) | `#585E68` | `#A3AAB3` |
| `--ink-3` (subtle) | `#7E848D` | `#7D858F` |
| `--line` | `#E4E1D8` | `#272C31` |
| `--accent` | `#0E7A6A` | `#3FC1A7` |
| `--accent-hover` | `#0B6457` | `#5ED0B8` |
| `--accent-ink` (text on accent) | `#FFFFFF` | `#06221C` |
| `--accent-soft` | `#E1F0EC` | `#12332D` |
| `--learning` | `#A86200` | `#E3A33A` |
| `--learning-soft` | `#FBEFD9` | `#3A2A0F` |
| `--not-studied` | `#868C95` | `#6A727C` |
| `--mastered` | = accent | = accent |
| `--danger` | `#B42318` | `#F07167` |
| `--danger-soft` | `#FDECEA` | `#3A1614` |

Radii: `--radius-sm` 6px, `--radius` 10px, `--radius-lg` 16px. Shadows: very
subtle (`0 1px 2px rgb(16 18 22 / .06), 0 8px 24px -12px rgb(16 18 22 / .14)`).
Dark mode: class `dark` on `<html>`; default follows the system; the toggle
stores `theme` in localStorage (wrap in try/catch). Tailwind v4:
`@custom-variant dark (&:where(.dark, .dark *));`.

Mastery colors are fixed everywhere: not studied = `--not-studied`, still
learning = `--learning`, mastered = `--mastered`.

Motion: `motion/react`, 150-250 ms, ease-out for enters, no bounce on UI
chrome (flashcard flip may use a spring). Always honor reduced motion
(`useReducedMotion`). Games are the exception that is allowed to be lively.

Before calling UI done, builders should load the `design-taste-frontend`
skill's pre-flight checklist and `emil-design-eng` for polish if time allows.

## 7. Claude usage

- Model: `MODEL` from `lib/ai/client.ts` (`claude-opus-5-5` by default). Use
  adaptive thinking (omit `thinking` or send `{ type: 'adaptive' }`; never
  `budget_tokens`, never `disabled`: both 400 on this model). Set
  `output_config.effort` explicitly: `low` for small fast calls (video
  queries), `medium` for chat and question generation, `high` for the study
  guide.
- **Refusal fallback on every request:** call through `client.beta.messages`
  with `betas: [FALLBACK_BETA]` and `fallbacks: 'default'`. Biology content can
  trip the bio safety classifier. Always check `stop_reason === 'refusal'`
  before reading content; surface a friendly message ("Claude couldn't answer
  this one. Try rephrasing.") and never crash a job on one refused section
  (mark that section errored, continue).
- No assistant prefill (400 on this model). No `temperature`/`top_p`.
- Structured output: `output_config: { format: zodOutputFormat(schema) }` via
  `messages.parse` (see `@anthropic-ai/sdk/helpers/zod`); or strict tools with
  `tool_choice: auto` (forced `tool_choice` 400s on this model). Verify the
  exact SDK surface in `node_modules/@anthropic-ai/sdk` before writing; if the
  beta namespace lacks `parse`, use `create` with `output_config.format` and
  JSON-parse + zod-validate the text.
- Stream anything long (`messages.stream(...)` + `finalMessage()`); default
  `max_tokens` 16000 for non-streaming, up to 64000 for streaming.
- Prompt caching: put the stable material context in a `system` text block with
  `cache_control: { type: 'ephemeral' }`; keep volatile things (the question,
  dates) after it. Calls in one job reuse the cache.
- Never send secrets or other users' data. The learning profile text goes into
  the system prompt.
- Netlify limits: normal and streaming responses 60 s, background functions
  15 min, request body 6 MB. Anything that can exceed ~45 s runs as a **job**.

## 8. Jobs

`POST /api/jobs` `{ setId, kind: 'build_set' | 'exam_questions', options? }` →
`201 { jobId }` (`503 { code: 'not_configured' }` without `ANTHROPIC_API_KEY`). Checks the user owns the set, refuses a second
queued/running job of the same kind for the set (returns the existing id),
inserts the row with the user's client, then `triggerJob(jobId, origin)`.

`triggerJob` POSTs `{ jobId }` to `${origin}/.netlify/functions/run-job` (a
background function, answers 202). If that does not answer 202 (local
`next dev`, other hosts), it runs `runJob(jobId)` in-process via `after()`
from `next/server`.

`runJob(jobId)` (service role): atomically claims the job
(`update ... set status='running' where id=$1 and status='queued'`); a claimed
or unknown job is a no-op, so retries and duplicate triggers are safe. It
reports `progress` 0-100 and a human `message` as it goes, and ends `done` or
`error` (with a readable `error`). `POST /api/jobs/[jobId]/retry` re-queues an
errored job, or a running one with no update for 15+ minutes.

`build_set` (options `{ regenerate?: boolean }`). A rebuild never blanks
the guide: each section keeps its previous text while it is rewritten
(status `pending`/`writing` with `content_md` still set; the guide UI should
keep showing it), a section that can't be rewritten keeps its text and goes
back to `ready`, and sections of topics the new outline dropped are deleted
only when the build finishes. Extraction stops starting files at the soft
deadline and continues in a fresh run (`continue_from: 'extract'`).
1. Extract every `pending`/`error` material (status `processing` → `ready` or
   `error`). PDF via `unpdf`, DOCX via `mammoth`, PPTX via `jszip` (slide text
   + speaker notes in slide order), TXT/MD directly, images and scanned PDFs
   (under ~100 chars of text per page) via Claude vision transcription.
   Picture pages inside a typed PDF (an image and under 100 characters) are
   transcribed too and replace those pages' text; long scans are read 25
   pages per call; big photos are shrunk with `sharp` when it loads. Only
   `<user_id>/<set_id>/...` paths of the job's own set are downloaded.
2. Load the learning profile and all ready material text (`loadSetContext`).
   Fail with a clear error if there is no usable text.
3. Outline call (structured): 3-12 topics `{ id: 't1'..., title, summary }`
   covering the material in teaching order. Save to `study_sets.topics`.
4. For each topic (3 at a time), one structured call returning
   `{ content_md, cards: [{ term, definition, hint? }] }`: the guide section in
   the student's style (headings, key terms in bold, tables for
   compare/contrast, mechanisms step by step, mnemonics, "high-yield" call-outs,
   clinical connections when relevant, 3-5 self-check questions at the end) and
   8-25 flashcards for that topic. Upsert `guide_sections` as each finishes
   (status `writing` → `ready`) so the guide fills in live. Insert cards with
   `source: 'ai'`, `topic_id`, skipping terms that already exist in the set
   (case-insensitive), so regenerating never wipes progress.
5. Set `study_sets.status` `ready` (or `error`).

`exam_questions` (options `{ count?: 5-40 (default 15), topicIds?: string[], difficulty?: 'mixed' | 'easy' | 'medium' | 'hard' }`):
batches of 5 per call, run in parallel, exam-style (MCAT / course exam style:
application and short clinical or experimental vignettes, 4-5 choices, one
best answer, plausible distractors, explanation of why the answer is right and
each distractor wrong), inserted into `exam_questions`.

## 9. Routes

| Route | Owner |
|---|---|
| `/` landing | F1 |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | B1 auth |
| `/auth/callback` (code exchange), `/auth/confirm` (token_hash), `/auth/signout` (POST) | B1 auth |
| `/onboarding`, `/settings` | B1 auth |
| `/dashboard` | B2 sets |
| `/sets/new` | B2 sets |
| `/sets/[setId]` overview (layout with header, tabs, chat panel) | B2 sets |
| `/sets/[setId]/cards` (edit cards) | B2 sets |
| `/sets/[setId]/guide` | B3 guide |
| `/sets/[setId]/flashcards` | B3 guide |
| `/sets/[setId]/learn` (`?topic=`, `?mode=review`, `?starred=1`) | B4 learn |
| `/sets/[setId]/test` | B4 learn |
| `/sets/[setId]/games`, `/games/meteor`, `/games/match` | B5 games |
| `/sets/[setId]/videos` | B6 videos |
| `POST /api/chat` | B7 chat |
| `POST /api/videos` | B6 videos |
| `POST /api/jobs`, `POST /api/jobs/[jobId]/retry` | B8 pipeline |
| `netlify/functions/run-job.mts` | B8 pipeline |

Set tab order: Overview, Guide, Flashcards, Learn, Test, Games, Videos, Cards.

## 10. File ownership

Only edit files you own. Shared files owned by someone else are read-only to
you; if one is broken or missing something you need, work around it locally
and report it.

- **F1 design**: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`,
  `app/not-found.tsx`, `app/(app)/layout.tsx`, `app/(app)/error.tsx`,
  `components/ui/**`, `components/app-shell/**`, `components/markdown.tsx`,
  `components/theme-toggle.tsx`, `components/brand.tsx`, `public/**`, `DESIGN.md`.
- **F2 platform**: `lib/env.ts`, `lib/utils.ts`, `lib/supabase/**`, `proxy.ts`,
  `lib/mastery.ts`, `lib/ai/client.ts`, `lib/ai/learning-profile.ts`,
  `lib/ai/set-context.ts`, `lib/jobs/start-job.ts`, `lib/jobs/use-job.ts`,
  `components/chat/chat-context.tsx`, the three stubs above (until their
  owners take them), `netlify.toml`, `.env.example`, `next.config.ts`,
  `README.md`.
- **B1 auth**: `app/(auth)/**`, `app/auth/**`, `app/(app)/onboarding/**`,
  `app/(app)/settings/**`, `components/profile/**`.
- **B2 sets**: `app/(app)/dashboard/**`, `app/(app)/sets/new/**`,
  `app/(app)/sets/[setId]/layout.tsx`, `app/(app)/sets/[setId]/page.tsx`,
  `app/(app)/sets/[setId]/cards/**`, `components/sets/**`,
  `components/jobs/job-progress.tsx`.
- **B3 guide**: `app/(app)/sets/[setId]/guide/**`,
  `app/(app)/sets/[setId]/flashcards/**`, `components/guide/**`,
  `components/flashcards/**`.
- **B4 learn**: `lib/learn/**`, `app/(app)/sets/[setId]/learn/**`,
  `app/(app)/sets/[setId]/test/**`, `components/learn/**`, `components/test/**`.
- **B5 games**: `app/(app)/sets/[setId]/games/**`, `components/games/**`.
- **B6 videos**: `app/api/videos/**`, `app/(app)/sets/[setId]/videos/**`,
  `components/videos/**`, `lib/ai/videos.ts`, `lib/youtube.ts`.
- **B7 chat**: `app/api/chat/**`, `components/chat/chat-panel.tsx`,
  `components/chat/**` (except `chat-context.tsx`), `lib/ai/chat.ts`.
- **B8 pipeline**: `lib/extract/**`, `lib/ai/prompts.ts`, `lib/ai/schemas.ts`,
  `lib/ai/build-set.ts`, `lib/ai/exam-questions.ts`, `lib/jobs/run-job.ts`,
  `lib/jobs/trigger.ts`, `app/api/jobs/**`, `netlify/functions/**`, and the
  `[functions]` section of `netlify.toml`.
- **Lead / integrator**: `supabase/**`, `lib/types.ts`, `docs/**`,
  `package.json`, git.

## 11. Working rules for builders

- Don't run `npm install`, `next build`, `next dev` or git commands during the
  build phase (other builders are writing files at the same time).
- Check your work with `npx tsc --noEmit -p .` and `npx eslint <your files>`.
  Errors in other builders' files are not yours to fix; files you depend on
  may still be in progress, so re-run later before reporting.
- The local database (Docker) has the migration applied:
  `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`. You may read
  it to check column names (tables are in `study`: `\dt study.*`); don't
  change the schema.
- Finish with: files written, what works, anything stubbed or not done, and any
  contract change.
