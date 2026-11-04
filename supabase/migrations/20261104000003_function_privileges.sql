-- Tighten EXECUTE on study functions. Postgres grants EXECUTE to PUBLIC on
-- every new function, and the init migration granted all study functions to
-- authenticated and service_role. Trigger functions are never called
-- directly, and anon has no USAGE on study, so this is defense in depth.
-- Rerunnable.
revoke execute on function study.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function study.set_updated_at() from public, anon, authenticated, service_role;
-- owns_set is used inside RLS policies, so signed-in users keep it.
revoke execute on function study.owns_set(uuid) from public, anon;
-- Future study functions start with no EXECUTE for PUBLIC; grant explicitly.
alter default privileges in schema study revoke execute on functions from public;
