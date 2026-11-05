-- Minimal Supabase compatibility shim for running migrations and policy tests on plain
-- PostgreSQL 16 (no Docker / Supabase CLI). TEST USE ONLY. Never apply to a real project.
--
-- Mirrors the parts of a Supabase database that our migrations and RLS policies rely on:
--   * roles anon, authenticated (no RLS bypass) and service_role (BYPASSRLS)
--   * auth.users, auth.uid(), auth.jwt(), auth.role() reading the `request.jwt.claims` GUC,
--     the same mechanism PostgREST uses
--   * Supabase's default privileges: objects created in `public` are granted to
--     anon/authenticated/service_role by default. This is why every migration must
--     REVOKE explicitly (ADR 0003), and the tests prove that it does.
-- Known gaps (ADR 0004): no GoTrue, PostgREST, storage, realtime or pg_graphql;
-- the shim's auth.users has only the columns we use.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select auth.jwt() ->> 'role'
$$;

grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

-- Supabase default privileges in public.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
