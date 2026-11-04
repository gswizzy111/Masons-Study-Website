-- Server guards: rows users write directly over the REST API can no longer
-- steer the service-role job runner, and Claude, YouTube and job use has
-- per-user limits. Additive and safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. materials.storage_path must be the uploader's own object.
-- The build job downloads storage_path with the service-role key, so a path
-- such as '../../../auth/v1/admin/users' or another user's folder must never
-- be stored. The shape is exactly what components/sets/upload-material.ts
-- builds: <user_id>/<set_id>/<uuid>-<safe file name>. A CHECK covers inserts
-- and updates alike (the "own materials" policy is FOR ALL).
-- ---------------------------------------------------------------------------
alter table study.materials drop constraint if exists materials_storage_path_owned;
alter table study.materials
  add constraint materials_storage_path_owned check (
    storage_path is null
    or storage_path ~ (
      '^' || user_id::text || '/' || set_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,100}$'
    )
  ) not valid;
-- Existing rows: validate when they all fit. If this fails in production,
-- look at the rows (see README "Security checks") before validating.
do $$
begin
  alter table study.materials validate constraint materials_storage_path_owned;
exception when check_violation then
  raise warning 'materials_storage_path_owned: some existing rows do not match; review them, then validate the constraint';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Per-user usage limits for Claude, YouTube and background jobs.
-- Only take_ai_quota() and the jobs trigger below write here; users can read
-- their own rows. Rows are not tied to a set, so deleting a set does not
-- reset the count.
-- ---------------------------------------------------------------------------
create table if not exists study.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('chat', 'build_set', 'exam_questions', 'videos')),
  cost integer not null default 1 check (cost between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_kind_idx on study.ai_usage (user_id, kind, created_at desc);
alter table study.ai_usage enable row level security;

drop policy if exists "read own ai usage" on study.ai_usage;
create policy "read own ai usage" on study.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Records `p_cost` units of `p_kind` for `p_user` when that stays within the
-- hourly and daily limits. Returns 0 when recorded, otherwise the number of
-- seconds until enough earlier use expires. Internal: called by
-- take_ai_quota() and the jobs trigger, never directly by users.
create or replace function study.take_ai_quota_for(p_user uuid, p_kind text, p_cost integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  hour_limit integer;
  day_limit integer;
  v_cost integer := greatest(1, least(coalesce(p_cost, 1), 1000));
  used_hour integer;
  used_day integer;
  wait_seconds integer;
begin
  if p_user is null then
    raise exception 'take_ai_quota_for: no user' using errcode = '22023';
  end if;
  -- Generous for one student studying hard; a hard ceiling for anyone else.
  -- videos: one unit per topic searched (each YouTube search costs 100 of the
  -- default 10,000 daily quota units).
  case p_kind
    when 'chat' then hour_limit := 60; day_limit := 400;
    when 'build_set' then hour_limit := 8; day_limit := 30;
    when 'exam_questions' then hour_limit := 10; day_limit := 40;
    when 'videos' then hour_limit := 40; day_limit := 80;
    else raise exception 'take_ai_quota_for: unknown kind %', p_kind using errcode = '22023';
  end case;

  -- One check at a time per user and kind, so parallel requests can't all
  -- slip under the limit together.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || p_kind, 0));

  select
    coalesce(sum(u.cost) filter (where u.created_at > now() - interval '1 hour'), 0),
    coalesce(sum(u.cost), 0)
  into used_hour, used_day
  from study.ai_usage u
  where u.user_id = p_user and u.kind = p_kind and u.created_at > now() - interval '1 day';

  if used_hour + v_cost > hour_limit then
    select ceil(extract(epoch from (min(u.created_at) + interval '1 hour' - now())))::integer
      into wait_seconds
      from study.ai_usage u
      where u.user_id = p_user and u.kind = p_kind and u.created_at > now() - interval '1 hour';
    return greatest(60, coalesce(wait_seconds, 3600));
  end if;
  if used_day + v_cost > day_limit then
    select ceil(extract(epoch from (min(u.created_at) + interval '1 day' - now())))::integer
      into wait_seconds
      from study.ai_usage u
      where u.user_id = p_user and u.kind = p_kind and u.created_at > now() - interval '1 day';
    return greatest(60, coalesce(wait_seconds, 86400));
  end if;

  insert into study.ai_usage (user_id, kind, cost) values (p_user, p_kind, v_cost);
  return 0;
end;
$$;

revoke all on function study.take_ai_quota_for(uuid, text, integer) from public;
revoke all on function study.take_ai_quota_for(uuid, text, integer) from anon, authenticated;

-- The signed-in user's own quota check, for route handlers (RPC with the
-- user's client). Calling it directly only ever uses up the caller's quota.
create or replace function study.take_ai_quota(p_kind text, p_cost integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'take_ai_quota: not signed in' using errcode = '42501';
  end if;
  return study.take_ai_quota_for(uid, p_kind, p_cost);
end;
$$;

revoke all on function study.take_ai_quota(text, integer) from public;
revoke all on function study.take_ai_quota(text, integer) from anon;
grant execute on function study.take_ai_quota(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Jobs that users insert carry only the options /api/jobs accepts.
-- The runner trusts internal option keys (continue_from, continuations and
-- the carried totals), and users can insert jobs over REST, so anything else
-- is dropped and the bookkeeping columns are reset. Each insert also counts
-- toward the build / question limits (raises PT429, which PostgREST answers
-- with HTTP 429). Service-role inserts are left alone.
-- ---------------------------------------------------------------------------
create or replace function study.jobs_guard_user_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o jsonb := case when jsonb_typeof(new.options) = 'object' then new.options else '{}'::jsonb end;
  wait_seconds integer;
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    return new;
  end if;

  new.options := jsonb_strip_nulls(jsonb_build_object(
    'regenerate', case when jsonb_typeof(o -> 'regenerate') = 'boolean' then o -> 'regenerate' end,
    'count', case when jsonb_typeof(o -> 'count') = 'number' then o -> 'count' end,
    'topicIds', case
      when jsonb_typeof(o -> 'topicIds') = 'array' and jsonb_array_length(o -> 'topicIds') <= 100
      then o -> 'topicIds'
    end,
    'difficulty', case when jsonb_typeof(o -> 'difficulty') = 'string' then o -> 'difficulty' end
  ));
  new.status := 'queued';
  new.progress := 0;
  new.message := null;
  new.error := null;
  new.started_at := null;
  new.finished_at := null;
  new.created_at := now();
  new.updated_at := now();

  wait_seconds := study.take_ai_quota_for(new.user_id, new.kind, 1);
  if wait_seconds > 0 then
    raise exception 'usage_limit'
      using errcode = 'PT429', detail = wait_seconds::text,
            hint = 'Too many jobs of this kind recently. Try again later.';
  end if;
  return new;
end;
$$;

revoke all on function study.jobs_guard_user_insert() from public;
revoke all on function study.jobs_guard_user_insert() from anon, authenticated;

drop trigger if exists jobs_guard_user_insert on study.jobs;
create trigger jobs_guard_user_insert
  before insert on study.jobs
  for each row execute function study.jobs_guard_user_insert();
