-- Mason's Study: initial schema.
-- Every table is owner-only through RLS. Background jobs use the service role.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Profiles (one per user, holds the learning profile)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  learning_profile jsonb not null default '{}'::jsonb,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Courses (optional grouping, e.g. "BIO 301")
-- ---------------------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  color text not null default 'teal' check (color in ('teal', 'blue', 'violet', 'rose', 'amber', 'green', 'slate')),
  created_at timestamptz not null default now()
);
create index courses_user_idx on public.courses (user_id);

-- ---------------------------------------------------------------------------
-- Study sets (one exam / unit / topic)
-- topics: [{ "id": "t1", "title": "Glycolysis", "summary": "..." }]
-- ---------------------------------------------------------------------------
create table public.study_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  exam_date date,
  status text not null default 'draft' check (status in ('draft', 'building', 'ready', 'error')),
  topics jsonb not null default '[]'::jsonb,
  last_studied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_sets_user_idx on public.study_sets (user_id, updated_at desc);
create trigger study_sets_updated_at before update on public.study_sets
  for each row execute function public.set_updated_at();

-- True when the signed-in user owns the study set.
create or replace function public.owns_set(p_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.study_sets s
    where s.id = p_set_id and s.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Materials (uploaded files or pasted notes)
-- ---------------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  kind text not null check (kind in ('file', 'text')),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  storage_path text,
  content_text text,
  char_count integer,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
  error text,
  created_at timestamptz not null default now(),
  check (kind = 'text' or storage_path is not null)
);
create index materials_set_idx on public.materials (set_id, created_at);

-- ---------------------------------------------------------------------------
-- Study guide sections (written by the build job, one per topic)
-- ---------------------------------------------------------------------------
create table public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  position integer not null,
  topic_id text not null,
  title text not null,
  content_md text not null default '',
  status text not null default 'pending' check (status in ('pending', 'writing', 'ready', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, position)
);
create trigger guide_sections_updated_at before update on public.guide_sections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Flashcards
-- ---------------------------------------------------------------------------
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  term text not null check (char_length(term) between 1 and 500),
  definition text not null check (char_length(definition) between 1 and 4000),
  topic_id text,
  hint text check (hint is null or char_length(hint) <= 1000),
  source text not null default 'manual' check (source in ('ai', 'manual')),
  starred boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cards_set_idx on public.cards (set_id, position);
create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-card learning progress
-- level: 0 not studied, 1 still learning, 2 familiar, 3 mastered
-- ---------------------------------------------------------------------------
create table public.card_progress (
  card_id uuid primary key references public.cards (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  level smallint not null default 0 check (level between 0 and 3),
  streak integer not null default 0 check (streak >= 0),
  times_seen integer not null default 0 check (times_seen >= 0),
  times_correct integer not null default 0 check (times_correct >= 0),
  times_wrong integer not null default 0 check (times_wrong >= 0),
  interval_days numeric not null default 0 check (interval_days >= 0),
  ease numeric not null default 2.5 check (ease between 1.3 and 3.0),
  due_at timestamptz,
  last_result text check (last_result is null or last_result in ('correct', 'wrong')),
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
create index card_progress_set_idx on public.card_progress (set_id);
create index card_progress_due_idx on public.card_progress (user_id, due_at);
create trigger card_progress_updated_at before update on public.card_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Tutor chat (one thread per set)
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 60000),
  created_at timestamptz not null default now()
);
create index chat_messages_set_idx on public.chat_messages (set_id, created_at);

-- ---------------------------------------------------------------------------
-- Background jobs (study-set build, exam-question generation)
-- Users can create and read their jobs; only the service role updates them.
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  kind text not null check (kind in ('build_set', 'exam_questions')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  progress integer not null default 0 check (progress between 0 and 100),
  message text,
  error text,
  options jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_set_idx on public.jobs (set_id, created_at desc);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- AI exam-style questions
-- ---------------------------------------------------------------------------
create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  topic_id text,
  stem text not null check (char_length(stem) between 1 and 6000),
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 2 and 6),
  answer_index integer not null check (answer_index between 0 and 5),
  explanation text not null,
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz not null default now()
);
create index exam_questions_set_idx on public.exam_questions (set_id, created_at);

-- ---------------------------------------------------------------------------
-- Test attempts
-- ---------------------------------------------------------------------------
create table public.test_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  kind text not null check (kind in ('cards', 'exam')),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index test_attempts_set_idx on public.test_attempts (set_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Game scores. meteor: points (higher is better). match: milliseconds (lower is better).
-- ---------------------------------------------------------------------------
create table public.game_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  game text not null check (game in ('meteor', 'match')),
  score integer not null check (score >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index game_scores_set_idx on public.game_scores (set_id, game);

-- ---------------------------------------------------------------------------
-- YouTube suggestions, cached per topic
-- videos: [{ "id", "title", "channel", "thumbnail", "publishedAt" }]
-- ---------------------------------------------------------------------------
create table public.video_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id uuid not null references public.study_sets (id) on delete cascade,
  topic_id text,
  topic_title text not null,
  query text not null,
  reason text,
  videos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index video_suggestions_set_idx on public.video_suggestions (set_id, created_at);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.study_sets enable row level security;
alter table public.materials enable row level security;
alter table public.guide_sections enable row level security;
alter table public.cards enable row level security;
alter table public.card_progress enable row level security;
alter table public.chat_messages enable row level security;
alter table public.jobs enable row level security;
alter table public.exam_questions enable row level security;
alter table public.test_attempts enable row level security;
alter table public.game_scores enable row level security;
alter table public.video_suggestions enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "own courses" on public.courses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own sets" on public.study_sets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (course_id is null or exists (
      select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid())
    ))
  );

-- Child tables: the row is yours and the set it points at is yours.
create policy "own materials" on public.materials
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

create policy "own guide sections" on public.guide_sections
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

create policy "own cards" on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

create policy "own card progress" on public.card_progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.cards c
      where c.id = card_id and c.user_id = (select auth.uid()) and c.set_id = card_progress.set_id
    )
  );

create policy "own chat" on public.chat_messages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

create policy "read own jobs" on public.jobs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "create own jobs" on public.jobs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'queued' and public.owns_set(set_id));

create policy "own exam questions" on public.exam_questions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

create policy "own test attempts" on public.test_attempts
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

create policy "own game scores" on public.game_scores
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

create policy "own video suggestions" on public.video_suggestions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_set(set_id));

-- ---------------------------------------------------------------------------
-- Storage: private "materials" bucket, files under <user_id>/<set_id>/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('materials', 'materials', false, 52428800)
on conflict (id) do nothing;

create policy "read own material files" on storage.objects
  for select to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "upload own material files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "delete own material files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
