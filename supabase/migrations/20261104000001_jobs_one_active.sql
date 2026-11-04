-- At most one queued or running job of each kind per set, so two clicks at
-- the same moment cannot start two builds. POST /api/jobs maps the unique
-- violation (23505) to the existing job.
create unique index if not exists jobs_one_active_per_kind
  on public.jobs (set_id, kind)
  where status in ('queued', 'running');
