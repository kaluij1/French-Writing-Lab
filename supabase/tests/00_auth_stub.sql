-- Minimal stand-in for the parts of Supabase the migration relies on.
-- Used ONLY by scripts/test-db.sh against a throwaway local cluster.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
-- Supabase's auth.uid(): the `sub` claim of the request JWT.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase grants table privileges to API roles by default; RLS is what restricts rows.
alter default privileges in schema public grant all on tables to anon, authenticated;
